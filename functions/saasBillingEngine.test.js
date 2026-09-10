"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReactivationPatch, calculateBillingPeriod, createRecurringChargeTransaction,
  deterministicChargeId, evaluateBillingCandidate,
} = require("./saasBillingEngine");

const activeMonthly = {
  planId: "start", billingCycle: "monthly", currency: "ARS", price: 19000,
  subscriptionStatus: "active", fechaAlta: "2026-08-01", nextBillingDate: "2026-09-01",
};

test("activa genera cargo y suspendida o con deuda no acumula", () => {
  assert.equal(evaluateBillingCandidate(activeMonthly, new Date("2026-08-22T00:00:00Z")).action, "CHARGE");
  assert.equal(evaluateBillingCandidate({...activeMonthly, subscriptionStatus: "suspended"}, new Date("2026-09-22T00:00:00Z")).code, "SUSPENDED_SKIP");
  assert.equal(evaluateBillingCandidate({...activeMonthly, saldoCuentaCorriente: 1}, new Date("2026-09-22T00:00:00Z")).code, "OUTSTANDING_DEBT_SKIP");
  assert.equal(evaluateBillingCandidate({...activeMonthly, subscriptionStatus: "past_due"}, new Date("2026-09-22T00:00:00Z")).code, "OUTSTANDING_DEBT_SKIP");
});

test("scheduler central omite Hotmart y mantiene Mercado Pago", () => {
  const now = new Date("2026-08-22T00:00:00Z");
  assert.equal(evaluateBillingCandidate({
    ...activeMonthly, billingProvider: "hotmart",
  }, now).code, "EXTERNAL_PROVIDER_BILLING_SKIP");
  assert.equal(evaluateBillingCandidate({
    ...activeMonthly, billingProvider: "mercadopago",
  }, now).action, "CHARGE");
});

test("trial no factura y conversión válida puede facturar", () => {
  assert.equal(evaluateBillingCandidate({...activeMonthly, planId: "trial", subscriptionStatus: "trial", price: 0}, new Date("2026-09-22T00:00:00Z")).code, "TRIAL_SKIP");
  assert.equal(evaluateBillingCandidate({...activeMonthly, planId: "trial", subscriptionStatus: "trial", price: 0, fechaVencimiento: "2026-08-01"}, new Date("2026-09-22T00:00:00Z")).code, "TRIAL_SKIP");
  assert.equal(evaluateBillingCandidate(activeMonthly, new Date("2026-08-22T00:00:00Z")).action, "CHARGE");
});

test("mensual preserva día y anual no usa lógica mensual", () => {
  const monthly = calculateBillingPeriod({...activeMonthly, fechaAlta: "2026-01-31", nextBillingDate: "2026-02-28"}, new Date("2026-02-18T00:00:00Z"));
  assert.deepEqual([monthly.periodKey, monthly.periodEnd], ["2026-02", "2026-03-31"]);
  const annual = calculateBillingPeriod({...activeMonthly, billingCycle: "annual", fechaAlta: "2024-02-29", nextBillingDate: "2025-02-28"}, new Date("2025-02-18T00:00:00Z"));
  assert.deepEqual([annual.periodKey, annual.periodEnd], ["2025-02-28-ANUAL", "2026-02-28"]);
});

test("legacy Mensual y Anual históricos siguen facturando", () => {
  const base = {plan: "Mensual", frecuenciaCobro: "mensual", moneda: "COP", planPrecio: 20, estadoSuscripcion: "activa", fechaAlta: "2026-08-01", fechaProximoCargo: "2026-09-01"};
  assert.equal(evaluateBillingCandidate(base, new Date("2026-08-22T00:00:00Z")).action, "CHARGE");
  assert.equal(evaluateBillingCandidate({...base, plan: "Anual", frecuenciaCobro: "anual", fechaProximoCargo: "2027-08-01"}, new Date("2027-07-22T00:00:00Z")).period.cycle, "annual");
});

test("precio o moneda inválidos no generan cargo", () => {
  assert.equal(evaluateBillingCandidate({...activeMonthly, price: 0}, new Date("2026-08-22T00:00:00Z")).code, "INVALID_PAID_SUBSCRIPTION");
  assert.equal(evaluateBillingCandidate({...activeMonthly, currency: ""}, new Date("2026-08-22T00:00:00Z")).code, "INVALID_PAID_SUBSCRIPTION");
});

test("deuda saldada reactiva y deuda parcial no", () => {
  const suspended = {...activeMonthly, suspendidoPorSistema: true, subscriptionStatus: "suspended"};
  assert.equal(buildReactivationPatch(suspended, 10, new Date("2026-09-09T00:00:00Z")), null);
  assert.match(buildReactivationPatch(suspended, 0, new Date("2026-09-09T00:00:00Z")).nextBillingDate, /^2026-10-09$/);
});

test("reactivada retoma desde una fecha explícita sin facturar meses congelados", () => {
  const suspended = {...activeMonthly, suspendidoPorSistema: true, subscriptionStatus: "suspended"};
  const patch = buildReactivationPatch(suspended, 0, new Date("2026-09-09T00:00:00Z"));
  const evaluation = evaluateBillingCandidate({...suspended, ...patch}, new Date("2026-09-09T00:00:00Z"));
  assert.equal(evaluation.code, "NOT_DUE");
  assert.equal(evaluation.period.periodStart, "2026-10-09");
  assert.equal(evaluation.period.skippedPeriods, 0);
});

function fakeFirestore(client) {
  const docs = new Map([["client", {...client}]]);
  const ref = (path) => ({path});
  return {
    docs, clientRef: ref("client"), chargeRef: ref("charge"),
    db: {runTransaction: async (callback) => callback({
      get: async (documentRef) => ({exists: docs.has(documentRef.path), id: documentRef.path, data: () => docs.get(documentRef.path)}),
      create: (documentRef, data) => docs.set(documentRef.path, data),
      update: (documentRef, data) => docs.set(documentRef.path, {...docs.get(documentRef.path), ...data}),
    })},
  };
}

test("scheduler, manual y retry convergen en un único cargo", async () => {
  const fake = fakeFirestore(activeMonthly);
  const expectedPeriodKey = "2026-09";
  const args = {db: fake.db, clientRef: fake.clientRef, chargeRef: fake.chargeRef, expectedPeriodKey, now: new Date("2026-08-22T00:00:00Z"), movement: {tipoMovimiento: "cargo"}, updatedAt: "server-time"};
  const scheduler = await createRecurringChargeTransaction(args);
  const manual = await createRecurringChargeTransaction(args);
  const retry = await createRecurringChargeTransaction(args);
  assert.deepEqual([scheduler.created, manual.code, retry.code], [true, "ALREADY_BILLED_PERIOD", "ALREADY_BILLED_PERIOD"]);
  assert.equal([...fake.docs.keys()].filter((key) => key === "charge").length, 1);
  assert.equal(deterministicChargeId("tenant", expectedPeriodKey), deterministicChargeId("tenant", expectedPeriodKey));
});

test("un período anual también queda protegido contra reintentos", async () => {
  const annual = {...activeMonthly, billingCycle: "annual", nextBillingDate: "2027-08-01"};
  const fake = fakeFirestore(annual);
  const firstEvaluation = evaluateBillingCandidate(annual, new Date("2027-07-22T00:00:00Z"));
  const restartedEvaluation = evaluateBillingCandidate(
    {...annual, billingCycleSequence: 999},
    new Date("2027-07-22T00:00:00Z")
  );
  assert.equal(firstEvaluation.period.periodKey, "2027-08-01-ANUAL");
  assert.equal(restartedEvaluation.period.periodKey, firstEvaluation.period.periodKey);
  assert.equal(
    deterministicChargeId("tenant", firstEvaluation.period.periodKey),
    deterministicChargeId("tenant", restartedEvaluation.period.periodKey)
  );
  const chargeId = deterministicChargeId("tenant", firstEvaluation.period.periodKey);
  const args = {
    db: fake.db, clientRef: fake.clientRef, chargeRef: {path: chargeId},
    expectedPeriodKey: firstEvaluation.period.periodKey, now: new Date("2027-07-22T00:00:00Z"),
    movement: {tipoMovimiento: "cargo"}, updatedAt: "server-time",
  };
  const scheduler = await createRecurringChargeTransaction({...args, movement: {origen: "scheduler"}});
  const manual = await createRecurringChargeTransaction({...args, movement: {origen: "manual"}});
  const retryAfterRestart = await createRecurringChargeTransaction({...args, movement: {origen: "retry"}});
  assert.deepEqual(
    [scheduler.created, manual.code, retryAfterRestart.code],
    [true, "ALREADY_BILLED_PERIOD", "ALREADY_BILLED_PERIOD"]
  );
  assert.equal([...fake.docs.keys()].filter((key) => key === chargeId).length, 1);
});
