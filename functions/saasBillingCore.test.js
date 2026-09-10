"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {authorizeSaasOwner, validateBillableClient} = require("./saasBillingCore");
const {SUPPORTED_CURRENCIES} = require("./saasCurrencies");

test("suscripción paga sin precio se rechaza con error estructurado", () => {
  const result = validateBillableClient({planId: "start", billingCycle: "monthly", currency: "ARS"});
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["INVALID_PRICE"]);
});

test("trial con precio cero es válido y no facturable", () => {
  assert.deepEqual(validateBillableClient({subscriptionStatus: "trial", price: 0}), {valid: true, trial: true, errors: []});
});

test("suscripción paga exige plan, ciclo y moneda válidos", () => {
  const result = validateBillableClient({
    planId: "desconocido",
    billingCycle: "semanal",
    currency: "ABC",
    price: 10,
  });
  assert.deepEqual(result.errors, ["INVALID_PLAN", "INVALID_CURRENCY", "INVALID_BILLING_CYCLE"]);
});

test("backend acepta las seis monedas representables con precio manual válido", () => {
  assert.deepEqual(SUPPORTED_CURRENCIES, ["ARS", "USD", "MXN", "COP", "PEN", "CLP"]);
  for (const currency of SUPPORTED_CURRENCIES) {
    assert.equal(validateBillableClient({planId: "start", billingCycle: "monthly", currency, price: 1}).valid, true);
  }
});

test("solo un custom claim superadmin autoriza la operación", () => {
  assert.equal(authorizeSaasOwner(null).authorized, false);
  assert.equal(authorizeSaasOwner({uid: "u", token: {rol: "usuario"}}).authorized, false);
  assert.equal(authorizeSaasOwner({uid: "a", token: {rol: "admin"}}).authorized, false);
  assert.equal(authorizeSaasOwner({uid: "s", token: {superadmin: true}}).authorized, true);
  assert.equal(authorizeSaasOwner({uid: "s", token: {}}, {rol: "superadmin"}).authorized, true);
  assert.equal(authorizeSaasOwner({uid: "u", token: {queryToken: "cualquier-valor"}}).authorized, false);
});
