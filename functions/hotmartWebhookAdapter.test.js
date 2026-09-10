"use strict";
/* eslint-disable require-jsdoc, max-len */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeHotmartWebhook,
  secureTokenEquals,
} = require("./hotmartWebhookAdapter");

function approvedPayload(overrides = {}) {
  return {
    id: "event-1",
    creation_date: Date.parse("2026-09-09T12:00:00Z"),
    event: "PURCHASE_APPROVED",
    version: "2.0.0",
    data: {
      product: {id: 123, name: "Nombre no confiable"},
      buyer: {email: " Client@Example.COM "},
      subscription: {subscriber: {code: "SUB-1"}, status: "ACTIVE"},
      purchase: {
        transaction: "HP-1",
        approved_date: Date.parse("2026-09-09T12:00:00Z"),
        recurrency_number: 1,
        price: {value: 17.25, currency_code: "USD"},
        offer: {code: "offer-1"},
        tracking: {plan_id: "start", billing_cycle: "monthly"},
      },
      ...overrides,
    },
  };
}

test("normaliza compra aprobada con IDs reales y monto/moneda informados", () => {
  const event = normalizeHotmartWebhook(approvedPayload());
  assert.equal(event.action, "PAYMENT_APPROVED");
  assert.equal(event.transactionId, "HP-1");
  assert.equal(event.subscriptionId, "SUB-1");
  assert.equal(event.buyerEmail, "client@example.com");
  assert.equal(event.planId, "start");
  assert.equal(event.billingCycle, "monthly");
  assert.equal(event.amount, 17.25);
  assert.equal(event.currency, "USD");
  assert.deepEqual(event.issues, []);
});

test("no usa el nombre visible del producto como plan", () => {
  const payload = approvedPayload();
  payload.data.purchase.tracking.plan_id = "inexistente";
  payload.data.product.name = "Empresa";
  const event = normalizeHotmartWebhook(payload);
  assert.equal(event.planName, "");
  assert.deepEqual(event.issues.map((issue) => issue.code), ["INVALID_PLAN_ID"]);
});

test("plan, ciclo, moneda y monto inválidos requieren conciliación", () => {
  const payload = approvedPayload();
  payload.data.purchase.tracking = {plan_id: "otro", billing_cycle: "weekly"};
  payload.data.purchase.price = {value: 0, currency_code: "EUR"};
  const codes = normalizeHotmartWebhook(payload).issues.map((issue) => issue.code);
  assert.deepEqual(codes, [
    "INVALID_PLAN_ID",
    "INVALID_BILLING_CYCLE",
    "UNSUPPORTED_CURRENCY",
    "INVALID_AMOUNT",
  ]);
});

test("preserva moneda y monto regional sin inferir país ni catálogo", () => {
  for (const currency of ["ARS", "USD", "MXN", "COP", "PEN", "CLP"]) {
    const payload = approvedPayload();
    payload.data.purchase.price = {value: 123.45, currency_value: currency};
    const event = normalizeHotmartWebhook(payload);
    assert.equal(event.currency, currency);
    assert.equal(event.amount, 123.45);
    assert.deepEqual(event.issues, []);
  }
});

test("mapea sólo eventos oficiales implementados", () => {
  const cases = {
    PURCHASE_APPROVED: "PAYMENT_APPROVED",
    PURCHASE_COMPLETE: "PAYMENT_APPROVED",
    PURCHASE_CANCELED: "PURCHASE_CANCELLED",
    PURCHASE_DELAYED: "PAYMENT_REJECTED",
    PURCHASE_REFUNDED: "PAYMENT_REFUNDED",
    PURCHASE_CHARGEBACK: "PAYMENT_CHARGEBACK",
    SUBSCRIPTION_CANCELLATION: "SUBSCRIPTION_CANCELLED",
    SWITCH_PLAN: "PLAN_CHANGED",
    UPDATE_SUBSCRIPTION_CHARGE_DATE: "CHARGE_DATE_CHANGED",
  };
  for (const [type, action] of Object.entries(cases)) {
    const payload = approvedPayload();
    payload.event = type;
    assert.equal(normalizeHotmartWebhook(payload).action, action);
  }
});

test("compra cancelada queda para conciliación y no se confunde con mora", () => {
  const payload = approvedPayload();
  payload.event = "PURCHASE_CANCELED";
  const event = normalizeHotmartWebhook(payload);
  assert.equal(event.action, "PURCHASE_CANCELLED");
  assert.deepEqual(event.issues, []);
});

test("eventos financieros de suscripción exigen subscriber code", () => {
  const payload = approvedPayload();
  delete payload.data.subscription;
  const codes = normalizeHotmartWebhook(payload).issues.map((issue) => issue.code);
  assert.deepEqual(codes, ["MISSING_SUBSCRIPTION_ID"]);
});

test("Hottok usa comparación constante y rechaza vacíos", () => {
  assert.equal(secureTokenEquals("secret", "secret"), true);
  assert.equal(secureTokenEquals("secret", "other"), false);
  assert.equal(secureTokenEquals("", ""), false);
});

module.exports = {approvedPayload};
