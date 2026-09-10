"use strict";
/* eslint-disable require-jsdoc, max-len */

const {validateBillableClient} = require("./saasBillingCore");

const DAY_MS = 86400000;

function toUtcDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return toUtcDate(value.toDate());
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeCycle(client = {}) {
  const raw = String(client.billingCycle || client.frecuenciaCobro || "").trim().toLowerCase();
  if (["monthly", "mensual"].includes(raw)) return "monthly";
  if (["annual", "anual"].includes(raw)) return "annual";
  return "";
}

function normalizeStatus(client = {}) {
  const raw = String(client.subscriptionStatus || client.estadoSuscripcion || client.estado || "").trim().toLowerCase();
  return ({activa: "active", activo: "active", prueba: "trial", gracia: "past_due", suspendida: "suspended", suspendido: "suspended", cancelado: "cancelled", inactivo: "cancelled"})[raw] || raw;
}

function isTrial(client = {}) {
  return client.planId === "trial" || normalizeStatus(client) === "trial" || String(client.frecuenciaCobro || "").toLowerCase() === "prueba" || String(client.planNombre || client.plan || "").toLowerCase().includes("prueba");
}

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addCycle(date, cycle, count = 1, anchorDay = date.getUTCDate()) {
  if (cycle === "annual") {
    const year = date.getUTCFullYear() + count;
    const month = date.getUTCMonth();
    return new Date(Date.UTC(year, month, Math.min(anchorDay, daysInUtcMonth(year, month))));
  }
  const absoluteMonth = date.getUTCFullYear() * 12 + date.getUTCMonth() + count;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;
  return new Date(Date.UTC(year, month, Math.min(anchorDay, daysInUtcMonth(year, month))));
}

function periodKey(date, cycle) {
  const year = date.getUTCFullYear();
  if (cycle === "annual") return `${formatDate(date)}-ANUAL`;
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calculateBillingPeriod(client = {}, now = new Date()) {
  const today = toUtcDate(now);
  const cycle = normalizeCycle(client);
  if (!today || !cycle) return {valid: false, code: "INVALID_BILLING_CYCLE"};
  const anchor = toUtcDate(client.billingAnchorDate || client.fechaReactivacion || client.fechaAlta);
  let billingDate = toUtcDate(client.nextBillingDate || client.fechaProximoCargo);
  if (!billingDate && !anchor) return {valid: false, code: "MISSING_BILLING_ANCHOR"};
  const anchorDay = (anchor || billingDate).getUTCDate();
  let sequence = Number.isInteger(Number(client.billingCycleSequence)) ? Number(client.billingCycleSequence) + 1 : 1;
  if (!billingDate) billingDate = addCycle(anchor, cycle, 1, anchorDay);
  if (String(client.ultimoPeriodoFacturado || "") === periodKey(billingDate, cycle)) {
    billingDate = addCycle(billingDate, cycle, 1, anchorDay);
    sequence += 1;
  }
  let skippedPeriods = 0;
  const graceDays = Math.max(0, Number(client.diasGracia ?? 7));
  while (addCycle(billingDate, cycle, 1, anchorDay).getTime() + graceDays * DAY_MS < today.getTime()) {
    billingDate = addCycle(billingDate, cycle, 1, anchorDay);
    sequence += 1;
    skippedPeriods += 1;
  }
  const nextBillingDate = addCycle(billingDate, cycle, 1, anchorDay);
  const periodStart = billingDate;
  const periodEnd = nextBillingDate;
  const advanceDays = Math.max(0, Number(client.diasAnticipacionCargo ?? 10));
  const issueDate = new Date(billingDate.getTime() - advanceDays * DAY_MS);
  const dueDate = new Date(billingDate.getTime() + graceDays * DAY_MS);
  return {
    valid: true, cycle, sequence, periodKey: periodKey(billingDate, cycle),
    periodStart: formatDate(periodStart), periodEnd: formatDate(periodEnd), billingDate: formatDate(billingDate),
    issueDate: formatDate(issueDate), dueDate: formatDate(dueDate), nextBillingDate: formatDate(nextBillingDate),
    dueForEmission: today.getTime() >= issueDate.getTime(), skippedPeriods,
  };
}

function evaluateBillingCandidate(client = {}, now = new Date()) {
  if (isTrial(client)) return {action: "SKIP", code: "TRIAL_SKIP"};
  const provider = String(client.billingProvider || client.metodoCobro || "")
      .trim().toLowerCase();
  if (provider === "hotmart") {
    return {action: "SKIP", code: "EXTERNAL_PROVIDER_BILLING_SKIP"};
  }
  const status = normalizeStatus(client);
  if (status === "cancelled" || String(client.estado || "").toLowerCase() === "inactivo") return {action: "SKIP", code: "INACTIVE_OR_CANCELLED_SKIP"};
  if (client.suspendidoManual === true) return {action: "SKIP", code: "MANUAL_SUSPENDED_SKIP"};
  if (client.suspendidoPorSistema === true || status === "suspended") return {action: "SKIP", code: "SUSPENDED_SKIP"};
  if (status === "past_due" || Number(client.saldoCuentaCorriente || 0) > 0) return {action: "SKIP", code: "OUTSTANDING_DEBT_SKIP"};
  const validation = validateBillableClient(client);
  if (!validation.valid) return {action: "ERROR", code: "INVALID_PAID_SUBSCRIPTION", fields: validation.errors};
  if (validation.price === 0) return {action: "SKIP", code: "ZERO_PRICE_SKIP"};
  const period = calculateBillingPeriod(client, now);
  if (!period.valid) return {action: "ERROR", code: period.code};
  if (!period.dueForEmission) return {action: "SKIP", code: "NOT_DUE", period};
  return {action: "CHARGE", code: "READY_TO_BILL", period, amount: validation.price, currency: validation.currency};
}

function deterministicChargeId(clientId, period) {
  const safeClient = String(clientId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safePeriod = String(period || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `cargo_${safeClient}_${safePeriod}`;
}

function buildReactivationPatch(client = {}, balance, now = new Date()) {
  if (Number(balance) > 0 || client.suspendidoManual === true || client.suspendidoPorSistema !== true) return null;
  const cycle = normalizeCycle(client);
  const today = toUtcDate(now);
  if (!cycle || !today || isTrial(client)) return null;
  const next = addCycle(today, cycle, 1, today.getUTCDate());
  return {
    estado: "activo", estadoSuscripcion: "activa", subscriptionStatus: "active",
    estadoCuenta: Number(balance) < 0 ? "saldo_favor" : "al_dia", suspendidoPorSistema: false,
    motivoSuspension: "", fechaReactivacion: formatDate(today), billingAnchorDate: formatDate(today),
    nextBillingDate: formatDate(next), fechaProximoCargo: formatDate(next), billingCycleSequence: 0,
  };
}

async function createRecurringChargeTransaction({db, clientRef, chargeRef, expectedPeriodKey, now, movement, updatedAt}) {
  return db.runTransaction(async (transaction) => {
    const [clientSnapshot, chargeSnapshot] = await Promise.all([
      transaction.get(clientRef), transaction.get(chargeRef),
    ]);
    if (!clientSnapshot.exists) return {created: false, code: "CLIENT_NOT_FOUND"};
    if (chargeSnapshot.exists) return {created: false, code: "ALREADY_BILLED_PERIOD"};
    const client = {id: clientSnapshot.id, ...clientSnapshot.data()};
    const evaluation = evaluateBillingCandidate(client, now);
    if (evaluation.action !== "CHARGE" || evaluation.period.periodKey !== expectedPeriodKey) {
      return {created: false, code: evaluation.code || "BILLING_STATE_CHANGED"};
    }
    const period = evaluation.period;
    transaction.create(chargeRef, {
      ...movement,
      monto: evaluation.amount,
      billingCurrency: evaluation.currency,
      moneda: evaluation.currency,
      currency: evaluation.currency,
    });
    transaction.update(clientRef, {
      nextBillingDate: period.nextBillingDate,
      fechaProximoCargo: period.nextBillingDate,
      fechaVencimiento: period.dueDate,
      ultimoPeriodoFacturado: expectedPeriodKey,
      billingCycleSequence: period.sequence,
      updatedAt,
    });
    return {created: true};
  });
}

module.exports = {
  addCycle, buildReactivationPatch, calculateBillingPeriod, createRecurringChargeTransaction, deterministicChargeId,
  evaluateBillingCandidate, formatDate, isTrial, normalizeCycle, normalizeStatus, toUtcDate,
};
