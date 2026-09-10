#!/usr/bin/env node
"use strict";

const NEW_FIELDS = ["planId", "billingCycle", "currency", "subscriptionStatus", "price"];

function text(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function hasValue(data, field) {
  return Object.prototype.hasOwnProperty.call(data, field) && data[field] !== null && data[field] !== undefined && data[field] !== "";
}

function toIso(value) {
  if (!value) return null;
  const candidate = typeof value.toDate === "function" ? value.toDate() : value;
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeKey(value) {
  return text(value, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function classifyPrice(rawPrice) {
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") return "ausente";
  const price = Number(rawPrice);
  if (!Number.isFinite(price)) return "tipo_invalido";
  if (price === 0) return "cero";
  if (price > 0) return "positivo";
  return "negativo";
}

function classifySpecial(row) {
  const plan = normalizeKey(row.plan);
  const status = normalizeKey(row.status);
  const cycle = normalizeKey(row.cycle);
  const paid = row.priceClass === "positivo";
  const recurringCycle = ["mensual", "monthly", "anual", "annual"].includes(cycle);
  if (plan === "personalizado") {
    if (paid && (recurringCycle || row.nextCharge)) return "PARECE_SUSCRIPCION";
    if (["suspendida", "suspended", "cancelado", "cancelled"].includes(status) && !paid) return "PARECE_HISTORICO_ESPECIAL";
    return "AMBIGUO";
  }
  if (plan === "instalacion") {
    if (paid && (recurringCycle || row.nextCharge)) return "PARECE_SUSCRIPCION";
    if (row.installationCost > 0 && !paid && !recurringCycle) return "PARECE_PAGO_UNICO";
    if (["prueba", "trial", "activa", "active"].includes(status) && !row.nextCharge) return "PARECE_ONBOARDING";
    if (["suspendida", "suspended", "cancelado", "cancelled"].includes(status) && !paid) return "PARECE_DATO_HISTORICO";
    return "AMBIGUO";
  }
  if (row.plan === "(sin plan)") {
    if (["prueba", "trial"].includes(status) || normalizeKey(row.cycle) === "prueba") return "PARECE_TRIAL";
    if (paid && (recurringCycle || row.nextCharge)) return "PARECE_SUSCRIPCION";
    if (["suspendida", "suspended", "inactivo"].includes(status) && !paid && !row.nextCharge) return "PARECE_REGISTRO_ABANDONADO";
    return "AMBIGUO";
  }
  return null;
}

function classifyCurrency(row) {
  const expected = {argentina: "ARS", mexico: "MXN", colombia: "COP", peru: "PEN", chile: "CLP", "estados unidos": "USD"}[normalizeKey(row.country)];
  if (!expected || row.currency === "(SIN MONEDA)" || row.currency === expected) return null;
  return row.currency === "USD" ? "POSIBLE_ELECCION_EXPLICITA" : "REQUIERE_REVISION";
}

function classifyClient(id, data = {}) {
  const historicalPlan = text(data.planNombre || data.plan, "");
  const plan = text(data.planId || historicalPlan, "(sin plan)");
  const cycle = text(data.billingCycle || data.frecuenciaCobro, "(sin ciclo)");
  const currency = text(data.currency || data.moneda, "(sin moneda)").toUpperCase();
  const rawPrice = data.price ?? data.planPrecio ?? data.mantenimientoMensual;
  const priceClass = classifyPrice(rawPrice);
  const price = ["cero", "positivo", "negativo"].includes(priceClass) ? Number(rawPrice) : null;
  const status = text(data.subscriptionStatus || data.estadoSuscripcion || data.estado, "(sin estado)");
  const legacyPlan = normalizeKey(historicalPlan);
  const newFields = NEW_FIELDS.filter((field) => hasValue(data, field));
  const row = {
    id, name: text(data.nombre || data.nombreCliente, "(sin nombre)"), plan, historicalPlan, cycle, currency,
    rawPrice, price, priceClass, status, country: text(data.pais, "(sin país)"),
    legacy: ["mensual", "anual"].includes(legacyPlan) && !hasValue(data, "planId"), newFields,
    newModel: newFields.length === NEW_FIELDS.length ? "COMPLETO" : newFields.length ? "PARCIAL" : "SOLO_HISTORICO",
    registrationDate: toIso(data.fechaAlta), nextCharge: toIso(data.fechaProximoCargo || data.fechaProximoCobro),
    suspensionDate: toIso(data.fechaSuspension || data.suspendidoAt), billingMethod: text(data.metodoCobro, null),
    billingDays: Number.isFinite(Number(data.diasCiclo)) ? Number(data.diasCiclo) : null,
    advanceDays: Number.isFinite(Number(data.diasAnticipacionCargo)) ? Number(data.diasAnticipacionCargo) : null,
    installationCost: Number.isFinite(Number(data.costoInstalacion)) ? Number(data.costoInstalacion) : null,
    lastBilledPeriod: text(data.ultimoPeriodoFacturado, null),
  };
  row.specialClassification = classifySpecial(row);
  row.currencyClassification = classifyCurrency(row);
  return row;
}

function increment(map, key) { map[key] = (map[key] || 0) + 1; }
function incrementMatrix(matrix, first, second) {
  if (!matrix[first]) matrix[first] = {};
  increment(matrix[first], second);
}

function compactRow(row) {
  return {
    clienteId: row.id, nombre: row.name, estado: row.status, pais: row.country, moneda: row.currency,
    precio: row.priceClass === "ausente" ? "AUSENTE" : row.priceClass === "tipo_invalido" ? "TIPO_INVALIDO" : row.price,
    ciclo: row.cycle, fechaAlta: row.registrationDate, proximoCobro: row.nextCharge, metodoCobro: row.billingMethod,
    diasCiclo: row.billingDays, diasAnticipacionCargo: row.advanceDays, costoInstalacion: row.installationCost,
    ultimoPeriodoFacturado: row.lastBilledPeriod, clasificacion: row.specialClassification,
  };
}

function suspensionBucket(row, now) {
  if (!row.suspensionDate) return "sin_fecha_confiable";
  const days = Math.floor((now.getTime() - new Date(row.suspensionDate).getTime()) / 86400000);
  if (days < 0) return "sin_fecha_confiable";
  if (days <= 30) return "0_30_dias";
  if (days <= 60) return "31_60_dias";
  if (days <= 90) return "61_90_dias";
  return "mas_90_dias";
}

function summarize(rows, {now = new Date(), complete = true, errors = []} = {}) {
  const result = {
    A_RESUMEN_GENERAL: {total: rows.length, recorridoCompleto: complete, totalesDefinitivos: complete, errores: errors.length},
    B_MATRICES: {planPorEstado: {}, planPorCiclo: {}, planPorMoneda: {}, planPorPrecio: {}},
    C_LEGACY_SEGURO: {total: 0, porEstado: {}, porMoneda: {}, porPrecio: {}, porValorPrecio: {}, porCiclo: {}, inconsistenciasPlanCiclo: []},
    D_PERSONALIZADO: [], E_INSTALACION: [],
    F_SIN_PLAN: {cargosExistentes: "NO_AUDITADOS_PARA_EVITAR_CONSULTAS_ADICIONALES", casos: []},
    G_ANOMALIAS_PRECIO: {precioCeroPorPlan: {}, precioAusentePorPlan: {}, legacyActivoOGraciaSinPrecioPositivo: []},
    H_COMBINACIONES_MONEDA: [],
    I_ADOPCION_CAMPOS_NUEVOS: {completos: 0, parciales: 0, soloHistoricos: 0, parcialesDetalle: []},
    J_ANTIGUEDAD_SUSPENDIDOS: {total: 0, "0_30_dias": 0, "31_60_dias": 0, "61_90_dias": 0, mas_90_dias: 0, sin_fecha_confiable: 0},
  };
  rows.forEach((row) => {
    incrementMatrix(result.B_MATRICES.planPorEstado, row.plan, row.status);
    incrementMatrix(result.B_MATRICES.planPorCiclo, row.plan, row.cycle);
    incrementMatrix(result.B_MATRICES.planPorMoneda, row.plan, row.currency);
    incrementMatrix(result.B_MATRICES.planPorPrecio, row.plan, row.priceClass);
    if (row.priceClass === "cero") increment(result.G_ANOMALIAS_PRECIO.precioCeroPorPlan, row.plan);
    if (row.priceClass === "ausente") increment(result.G_ANOMALIAS_PRECIO.precioAusentePorPlan, row.plan);
    if (row.legacy) {
      const expected = normalizeKey(row.historicalPlan) === "anual" ? ["anual", "annual"] : ["mensual", "monthly"];
      const actual = normalizeKey(row.cycle);
      result.C_LEGACY_SEGURO.total += 1;
      increment(result.C_LEGACY_SEGURO.porEstado, row.status); increment(result.C_LEGACY_SEGURO.porMoneda, row.currency);
      increment(result.C_LEGACY_SEGURO.porPrecio, row.priceClass); increment(result.C_LEGACY_SEGURO.porCiclo, row.cycle);
      increment(result.C_LEGACY_SEGURO.porValorPrecio, row.priceClass === "ausente" ? "AUSENTE" : row.priceClass === "tipo_invalido" ? "TIPO_INVALIDO" : String(row.price));
      if (actual && actual !== "(sin ciclo)" && !expected.includes(actual)) result.C_LEGACY_SEGURO.inconsistenciasPlanCiclo.push({clienteId: row.id, plan: row.historicalPlan, ciclo: row.cycle});
      if (["activa", "active", "gracia", "past_due"].includes(normalizeKey(row.status)) && row.priceClass !== "positivo") result.G_ANOMALIAS_PRECIO.legacyActivoOGraciaSinPrecioPositivo.push({clienteId: row.id, plan: row.historicalPlan, estado: row.status, precio: row.priceClass});
    }
    const planKey = normalizeKey(row.plan);
    if (planKey === "personalizado") result.D_PERSONALIZADO.push(compactRow(row));
    if (planKey === "instalacion") result.E_INSTALACION.push(compactRow(row));
    if (row.plan === "(sin plan)") result.F_SIN_PLAN.casos.push(compactRow(row));
    if (row.currencyClassification) result.H_COMBINACIONES_MONEDA.push({clienteId: row.id, nombre: row.name, pais: row.country, moneda: row.currency, clasificacion: row.currencyClassification});
    if (row.newModel === "COMPLETO") result.I_ADOPCION_CAMPOS_NUEVOS.completos += 1;
    else if (row.newModel === "PARCIAL") { result.I_ADOPCION_CAMPOS_NUEVOS.parciales += 1; result.I_ADOPCION_CAMPOS_NUEVOS.parcialesDetalle.push({clienteId: row.id, camposPresentes: row.newFields}); }
    else result.I_ADOPCION_CAMPOS_NUEVOS.soloHistoricos += 1;
    if (["suspendida", "suspended", "suspendido"].includes(normalizeKey(row.status))) { result.J_ANTIGUEDAD_SUSPENDIDOS.total += 1; result.J_ANTIGUEDAD_SUSPENDIDOS[suspensionBucket(row, now)] += 1; }
  });
  result.A_RESUMEN_GENERAL.documentosConPrecioCero = Object.values(result.G_ANOMALIAS_PRECIO.precioCeroPorPlan).reduce((a, b) => a + b, 0);
  result.A_RESUMEN_GENERAL.documentosSinPrecio = Object.values(result.G_ANOMALIAS_PRECIO.precioAusentePorPlan).reduce((a, b) => a + b, 0);
  if (errors.length) result.A_RESUMEN_GENERAL.detalleErrores = errors;
  return result;
}

function parseArgs(argv) {
  const args = {pageSize: 100};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--project") args.projectId = argv[++i];
    else if (argv[i] === "--page-size") args.pageSize = Number(argv[++i]);
    else if (argv[i] === "--help") args.help = true;
    else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  if (!args.help && !args.projectId) throw new Error("Falta --project");
  if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 500) throw new Error("--page-size debe estar entre 1 y 500");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log("Uso: node tools/auditar-clientes-saas.cjs --project <id> [--page-size 100]\nSolo lectura paginada de clientes-saas; no modifica Firestore ni crea archivos."); return; }
  const {applicationDefault, initializeApp} = require("firebase-admin/app");
  const {FieldPath, getFirestore} = require("firebase-admin/firestore");
  initializeApp({credential: applicationDefault(), projectId: args.projectId});
  const db = getFirestore();
  const fields = ["nombre", "nombreCliente", "planId", "plan", "planNombre", "billingCycle", "frecuenciaCobro", "currency", "moneda", "price", "planPrecio", "mantenimientoMensual", "subscriptionStatus", "estadoSuscripcion", "estado", "pais", "fechaAlta", "fechaProximoCargo", "fechaProximoCobro", "fechaSuspension", "suspendidoAt", "metodoCobro", "diasCiclo", "diasAnticipacionCargo", "costoInstalacion", "ultimoPeriodoFacturado"];
  const rows = []; const errors = []; let cursor = null; let complete = false;
  try {
    while (true) {
      let query = db.collection("clientes-saas").orderBy(FieldPath.documentId()).select(...fields).limit(args.pageSize);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      snapshot.docs.forEach((doc) => rows.push(classifyClient(doc.id, doc.data())));
      if (snapshot.size < args.pageSize) { complete = true; break; }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  } catch (error) { errors.push({code: error.code || "READ_ERROR", message: error.message}); process.exitCode = 1; }
  console.log(JSON.stringify({projectId: args.projectId, readOnly: true, ...summarize(rows, {complete, errors})}, null, 2));
}

module.exports = {classifyClient, classifyPrice, parseArgs, summarize, toIso};
if (require.main === module) main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
