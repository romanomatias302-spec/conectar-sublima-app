#!/usr/bin/env node
"use strict";

const {evaluateBillingCandidate} = require("../saasBillingEngine");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const candidate = typeof value.toDate === "function" ? value.toDate() : value;
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compactMovement(id, data = {}) {
  return {
    id,
    clientId: normalizeText(data.clienteSaasId),
    type: normalizeText(data.tipoMovimiento || "pago"),
    amount: normalizeNumber(data.monto),
    currency: normalizeText(data.currency || data.moneda).toUpperCase(),
    period: normalizeText(data.periodKey || data.periodoFacturado),
    voided: data.anulado === true || data.estado === "anulado",
    eventDate: normalizeDate(data.createdAt || data.fechaPago || data.fechaCobro),
    billingDate: normalizeDate(data.fechaCobro),
    dueDate: normalizeDate(data.fechaVencimiento),
    periodStart: normalizeDate(data.periodStart),
    periodEnd: normalizeDate(data.periodEnd),
  };
}

function auditClients(clients, movements, now = new Date()) {
  const clientIds = new Set(clients.map((client) => client.id));
  const byClient = new Map();
  for (const movement of movements) {
    if (!byClient.has(movement.clientId)) byClient.set(movement.clientId, []);
    byClient.get(movement.clientId).push(movement);
  }

  const reports = clients.map((client) => {
    const rows = byClient.get(client.id) || [];
    const active = rows.filter((row) => !row.voided);
    const charges = rows.filter((row) => row.type === "cargo");
    const activeCharges = active.filter((row) => row.type === "cargo");
    const periods = {};

    for (const row of active) {
      if (!row.period) continue;
      if (!periods[row.period]) periods[row.period] = {charges: 0, payments: 0, balance: 0, chargeDocuments: 0};
      if (["cargo", "ajuste"].includes(row.type)) {
        periods[row.period].charges += row.amount || 0;
        if (row.type === "cargo") periods[row.period].chargeDocuments += 1;
      }
      if (["pago", "credito"].includes(row.type)) periods[row.period].payments += row.amount || 0;
      periods[row.period].balance = periods[row.period].charges - periods[row.period].payments;
    }

    const duplicates = Object.entries(periods)
      .filter(([, value]) => value.chargeDocuments > 1)
      .map(([period, value]) => ({period, cargoDocuments: value.chargeDocuments}));
    const pending = Object.values(periods).filter((value) => value.balance > 0).length;
    const paid = Object.values(periods).filter((value) => value.chargeDocuments > 0 && value.balance <= 0).length;
    const suspensionDate = normalizeDate(client.data.fechaSuspension || client.data.suspendidoAt);
    const reactivationDate = normalizeDate(client.data.fechaReactivacion);
    const postSuspensionChronological = suspensionDate
      ? activeCharges.filter((row) => row.eventDate && row.eventDate > suspensionDate).map((row) => row.id)
      : [];
    const normalizedStatus = normalizeText(
      client.data.subscriptionStatus || client.data.estadoSuscripcion || client.data.estado
    ).toLowerCase();
    const currentlySuspended = client.data.suspendidoManual === true || client.data.suspendidoPorSistema === true ||
      ["suspendida", "suspended", "suspendido"].includes(normalizedStatus);
    const postSuspensionConfirmed = currentlySuspended
      ? postSuspensionChronological
      : reactivationDate && suspensionDate && reactivationDate > suspensionDate
        ? activeCharges.filter((row) =>
          row.eventDate && row.eventDate > suspensionDate && row.eventDate < reactivationDate
        ).map((row) => row.id)
        : [];
    const postSuspensionReview = !currentlySuspended && !(reactivationDate && suspensionDate && reactivationDate > suspensionDate)
      ? postSuspensionChronological
      : [];
    const evaluation = evaluateBillingCandidate(client.data, now);
    const expectedPeriod = evaluation.period?.periodKey || null;
    const missingExpected = evaluation.action === "CHARGE" && !activeCharges.some((row) => row.period === expectedPeriod);
    const latest = activeCharges.slice().sort((a, b) => String(b.eventDate || "").localeCompare(String(a.eventDate || "")))[0] || null;

    return {
      clienteId: client.id,
      estado: normalizeText(client.data.subscriptionStatus || client.data.estadoSuscripcion || client.data.estado),
      cargosTotales: charges.length,
      cargosPendientes: pending,
      cargosPagados: paid,
      cargosAnulados: charges.filter((row) => row.voided).length,
      ultimoCargo: latest ? {id: latest.id, periodo: latest.period, fecha: latest.eventDate, monto: latest.amount, moneda: latest.currency || null} : null,
      periodosFacturados: Object.keys(periods).sort(),
      posiblesDuplicados: duplicates,
      cargosPosterioresSuspension: [...postSuspensionConfirmed, ...postSuspensionReview],
      cargosDuranteSuspensionConfirmados: postSuspensionConfirmed,
      cargosPosterioresSuspensionPorRevisar: postSuspensionReview,
      activoSinCargoEsperado: missingExpected ? expectedPeriod : null,
      cargosPrecioInvalido: charges.filter((row) => row.amount === null || row.amount <= 0).map((row) => row.id),
      cargosSinMoneda: charges.filter((row) => !row.currency).map((row) => row.id),
      cargosSinPeriodo: charges.filter((row) => !row.period).map((row) => row.id),
      anomaliasFecha: charges.filter((row) =>
        !row.eventDate ||
        (row.periodStart && row.periodEnd && row.periodEnd <= row.periodStart) ||
        (row.billingDate && row.dueDate && row.dueDate < row.billingDate)
      ).map((row) => row.id),
    };
  });

  const orphanMovements = movements.filter((movement) => !clientIds.has(movement.clientId)).map((movement) => movement.id);
  return {
    resumen: {
      clientes: clients.length,
      movimientos: movements.length,
      clientesConDuplicados: reports.filter((row) => row.posiblesDuplicados.length).length,
      suspendidosConCargosPosteriores: reports.filter((row) => row.cargosDuranteSuspensionConfirmados.length).length,
      activosConCargosPosterioresPorRevisar: reports.filter((row) => row.cargosPosterioresSuspensionPorRevisar.length).length,
      activosSinCargoEsperado: reports.filter((row) => row.activoSinCargoEsperado).length,
      cargosPrecioInvalido: reports.reduce((sum, row) => sum + row.cargosPrecioInvalido.length, 0),
      cargosSinMoneda: reports.reduce((sum, row) => sum + row.cargosSinMoneda.length, 0),
      cargosSinPeriodo: reports.reduce((sum, row) => sum + row.cargosSinPeriodo.length, 0),
      anomaliasFecha: reports.reduce((sum, row) => sum + row.anomaliasFecha.length, 0),
      movimientosHuerfanos: orphanMovements.length,
      lecturasDocumentalesAproximadas: clients.length + movements.length,
    },
    clientes: reports,
    movimientosHuerfanos: orphanMovements,
  };
}

function parseArgs(argv) {
  const args = {pageSize: 200};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--project") args.projectId = argv[++index];
    else if (argv[index] === "--page-size") args.pageSize = Number(argv[++index]);
    else if (argv[index] === "--help") args.help = true;
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!args.help && !args.projectId) throw new Error("Falta --project");
  if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 500) {
    throw new Error("--page-size debe estar entre 1 y 500");
  }
  return args;
}

async function readCollection(db, FieldPath, collectionName, fields, pageSize) {
  const rows = [];
  let cursor = null;
  while (true) {
    let query = db.collection(collectionName).orderBy(FieldPath.documentId()).select(...fields).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    snapshot.docs.forEach((document) => rows.push({id: document.id, data: document.data()}));
    if (snapshot.size < pageSize) return rows;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Uso: node tools/auditar-cargos-saas.cjs --project <id> [--page-size 200]\nSolo lectura paginada de clientes-saas y saas_pagos.");
    return;
  }
  const {applicationDefault, initializeApp} = require("firebase-admin/app");
  const {FieldPath, getFirestore} = require("firebase-admin/firestore");
  initializeApp({credential: applicationDefault(), projectId: args.projectId});
  const db = getFirestore();
  const clients = await readCollection(db, FieldPath, "clientes-saas", [
    "planId", "plan", "planNombre", "billingCycle", "frecuenciaCobro", "currency", "moneda", "price",
    "planPrecio", "mantenimientoMensual", "subscriptionStatus", "estadoSuscripcion", "estado", "fechaAlta",
    "billingAnchorDate", "nextBillingDate", "fechaProximoCargo", "ultimoPeriodoFacturado", "billingCycleSequence",
    "saldoCuentaCorriente", "suspendidoManual", "suspendidoPorSistema", "fechaSuspension", "suspendidoAt", "fechaReactivacion",
    "diasGracia", "diasAnticipacionCargo",
  ], args.pageSize);
  const rawMovements = await readCollection(db, FieldPath, "saas_pagos", [
    "clienteSaasId", "tipoMovimiento", "monto", "currency", "moneda", "periodKey", "periodoFacturado",
    "anulado", "estado", "createdAt", "fechaPago", "fechaCobro", "fechaVencimiento", "periodStart", "periodEnd",
  ], args.pageSize);
  const movements = rawMovements.map((movement) => compactMovement(movement.id, movement.data));
  console.log(JSON.stringify({projectId: args.projectId, readOnly: true, recorridoCompleto: true, ...auditClients(clients, movements)}, null, 2));
}

module.exports = {auditClients, compactMovement, parseArgs};
if (require.main === module) main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
