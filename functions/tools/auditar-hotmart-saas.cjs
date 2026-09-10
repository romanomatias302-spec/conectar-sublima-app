#!/usr/bin/env node
"use strict";
/* eslint-disable require-jsdoc, max-len */

function parseArgs(argv) {
  const args = {project: "", pageSize: 200, tenant: ""};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--project") args.project = argv[++index] || "";
    else if (value === "--tenant") args.tenant = argv[++index] || "";
    else if (value === "--page-size") args.pageSize = Number(argv[++index]);
    else if (["--help", "-h"].includes(value)) args.help = true;
    else {
      throw new Error(`Argumento desconocido: ${value}`);
    }
  }
  if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 1000) {
    throw new Error("--page-size debe ser un entero entre 1 y 1000.");
  }
  return args;
}

function classifyHotmartClient(id, data = {}, pendingEvents = []) {
  const provider = String(data.billingProvider || data.metodoCobro || "")
      .trim().toLowerCase();
  if (provider !== "hotmart") return null;
  const subscriptionId = String(
      data.hotmartSubscriptionId || data.providerSubscriptionId || "",
  ).trim();
  const conflicts = [];
  if (!subscriptionId) conflicts.push("MISSING_SUBSCRIPTION_ID");
  if (data.clienteId && data.clienteId !== id) conflicts.push("TENANT_IDENTITY_MISMATCH");
  if (pendingEvents.length > 0) conflicts.push("PENDING_RECONCILIATION");
  return {
    clienteId: id,
    nombre: data.nombre || data.nombreVisible || "",
    billingProvider: provider,
    providerSubscriptionId: subscriptionId || null,
    planId: data.planId || null,
    billingCycle: data.billingCycle || data.frecuenciaCobro || null,
    subscriptionStatus: data.subscriptionStatus || data.estadoSuscripcion || null,
    hotmartSubscriptionStatus: data.hotmartSubscriptionStatus || null,
    lastTransactionId: data.hotmartLastTransactionId || null,
    association: subscriptionId ? "ASSOCIATED" : "MISSING",
    pendingReconciliation: pendingEvents,
    conflicts,
  };
}

async function readAll(collection, FieldPath, fields, pageSize) {
  const rows = [];
  let cursor = null;
  do {
    let query = collection.select(...fields)
        .orderBy(FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    rows.push(...snapshot.docs.map((doc) => ({id: doc.id, data: doc.data()})));
    cursor = snapshot.docs.at(-1) || null;
    if (snapshot.size < pageSize) break;
  } while (cursor);
  return rows;
}

async function runAudit(args) {
  const {applicationDefault, initializeApp} = require("firebase-admin/app");
  const {FieldPath, getFirestore} = require("firebase-admin/firestore");
  initializeApp({credential: applicationDefault(), projectId: args.project || undefined});
  const db = getFirestore();
  const eventRows = await readAll(
      db.collection("saas_provider_events"),
      FieldPath,
      ["provider", "status", "tenantId", "reconciliationReasons"],
      args.pageSize,
  );
  const pendingByTenant = new Map();
  const pendingWithoutTenant = [];
  for (const row of eventRows) {
    if (row.data.provider !== "hotmart" ||
        row.data.status !== "PENDING_RECONCILIATION") continue;
    if (!row.data.tenantId) {
      pendingWithoutTenant.push({
        eventId: row.id,
        reasons: row.data.reconciliationReasons || [],
      });
    } else {
      const pending = pendingByTenant.get(row.data.tenantId) || [];
      pending.push({eventId: row.id, reasons: row.data.reconciliationReasons || []});
      pendingByTenant.set(row.data.tenantId, pending);
    }
  }
  const clientRows = await readAll(
      db.collection("clientes-saas"),
      FieldPath,
      [
        "clienteId", "nombre", "nombreVisible", "billingProvider", "metodoCobro",
        "hotmartSubscriptionId", "providerSubscriptionId", "planId", "billingCycle",
        "frecuenciaCobro", "subscriptionStatus", "estadoSuscripcion",
        "hotmartSubscriptionStatus", "hotmartLastTransactionId",
      ],
      args.pageSize,
  );
  const rows = clientRows.map((row) => classifyHotmartClient(
      row.id,
      row.data,
      pendingByTenant.get(row.id) || [],
  )).filter(Boolean).filter((row) => !args.tenant || row.clienteId === args.tenant);
  console.log(JSON.stringify({
    readOnly: true,
    tenantsHotmart: rows.length,
    tenantsConConflictos: rows.filter((row) => row.conflicts.length).length,
    eventosPendientesSinTenant: pendingWithoutTenant,
    rows,
  }, null, 2));
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log("Uso: node tools/auditar-hotmart-saas.cjs --project <id> [--tenant <id>] [--page-size 200]\nSolo lectura; no modifica Firestore.");
      return;
    }
    await runAudit(args);
  }).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {classifyHotmartClient, parseArgs, readAll};
