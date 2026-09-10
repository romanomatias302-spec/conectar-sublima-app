"use strict";
/* eslint-disable require-jsdoc, max-len */

const test = require("node:test");
const assert = require("node:assert/strict");
const {createHotmartWebhookHandler} = require("./hotmartWebhookHandler");

function approvedPayload() {
  return {
    id: "event-1",
    creation_date: Date.parse("2026-09-09T12:00:00Z"),
    event: "PURCHASE_APPROVED",
    version: "2.0.0",
    data: {
      buyer: {email: "owner@example.com"},
      subscription: {subscriber: {code: "SUB-1"}, status: "ACTIVE"},
      purchase: {
        transaction: "HP-1",
        approved_date: Date.parse("2026-09-09T12:00:00Z"),
        price: {value: 100, currency_code: "ARS"},
        tracking: {plan_id: "start", billing_cycle: "monthly"},
      },
    },
  };
}

function responseDouble() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function repositoryDouble() {
  return {
    ensureEvent: async () => ({status: "RECEIVED"}),
    getTenant: async () => null,
    findTenantsBySubscription: async () => [],
    findTenantsByNormalizedEmail: async () => [],
    markPending: async () => {},
  };
}

test("endpoint acepta sólo POST autenticado con Hottok", async () => {
  const logger = {warn() {}, info() {}, error() {}};
  const handler = createHotmartWebhookHandler({
    expectedHottok: "secret",
    repository: repositoryDouble(),
    logger,
  });
  const wrongMethod = responseDouble();
  await handler({method: "GET", headers: {}}, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  const unauthorized = responseDouble();
  await handler({method: "POST", headers: {}, body: approvedPayload()}, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  const accepted = responseDouble();
  await handler({
    method: "POST",
    headers: {"x-hotmart-hottok": "secret"},
    body: approvedPayload(),
  }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.status, "PENDING_RECONCILIATION");
});

test("payload inválido no llega al repositorio", async () => {
  let called = false;
  const repository = repositoryDouble();
  repository.ensureEvent = async () => {
    called = true;
  };
  const handler = createHotmartWebhookHandler({
    expectedHottok: "secret",
    repository,
    logger: {warn() {}, info() {}, error() {}},
  });
  const response = responseDouble();
  await handler({
    method: "POST",
    headers: {"x-hotmart-hottok": "secret"},
    body: {event: "PURCHASE_APPROVED", version: "1.0.0"},
  }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});
