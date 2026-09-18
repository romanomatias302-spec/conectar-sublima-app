"use strict";
/* eslint-disable require-jsdoc, max-len */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture(currency) {
  const records = new Map();
  const client = {nombre: "Test", moneda: "ARS", billingCurrency: "USD", saldoCuentaCorriente: 77, estado: "suspendido"};
  const clientUpdates = [];
  const recalculations = [];
  const reference = (name, id) => ({
    get: async () => ({exists: name === "clientes-saas" || records.has(id), data: () => name === "clientes-saas" ? client : records.get(id)}),
    update: async patch => {clientUpdates.push(patch);},
    id,
  });
  const db = {
    collection: name => ({
      doc: id => reference(name, id),
      where() {return this;}, limit() {return this;},
      get: async () => ({empty: true}),
      add: async () => {throw new Error("Expected idempotent payment");},
    }),
    runTransaction: async callback => callback({
      get: ref => ref.get(),
      set: (ref, data) => {records.set(ref.id, data);},
    }),
  };
  const context = vm.createContext({
    db, admin: {firestore: {FieldValue: {serverTimestamp: () => "timestamp"}}},
    fechaISO: () => "2026-09-17", Date, Intl,
    recalcularEstadoCuentaCliente: async id => {recalculations.push(id);},
    exports: {}, onRequest: (...args) => args.at(-1),
    MP_ACCESS_TOKEN_PROD: {value: () => "test-only"},
    MP_WEBHOOK_SECRET_PROD: {value: () => "test-only"},
    WebhookSignatureValidator: {validate() {}},
    InvalidWebhookSignatureError: class extends Error {},
    console: {log() {}, warn() {}, error() {}},
    fetch: async () => ({ok: true, json: async () => ({
      status: "approved", transaction_amount: 100, currency_id: currency,
      external_reference: "tenant|2026-09",
    })}),
  });
  const source = fs.readFileSync(require.resolve("./index.js"), "utf8");
  // Ejecuta los cuerpos productivos sin inicializar Firebase ni llamar proveedores.
  vm.runInContext(source.slice(source.indexOf("async function registrarPagoSaas("),
    source.indexOf("async function recalcularEstadoCuentaCliente(")), context);
  vm.runInContext(source.slice(source.indexOf("exports.webhookMercadoPagoSaas ="),
    source.indexOf("exports.webhookHotmartSaas =")), context);
  const invoke = async () => {
    let status = 200;
    const res = {status(code) {status = code; return this;}, json(body) {this.body = body;}};
    await context.exports.webhookMercadoPagoSaas({
      query: {"data.id": "payment-test"}, headers: {"x-signature": "test", "x-request-id": "test"},
    }, res);
    assert.equal(status, 200);
    assert.equal(res.body.ok, true);
  };
  return {invoke, records, client, clientUpdates, recalculations};
}

for (const currency of ["USD", "ARS", "PEN"]) {
  test(`webhook persiste moneda real ${currency} e idempotencia sin alterar el recálculo`, async () => {
    const f = fixture(currency);
    await f.invoke();
    await f.invoke();
    assert.equal(f.records.size, 1);
    const payment = f.records.get("mp_payment-test");
    for (const key of ["billingCurrency", "currency", "moneda"]) assert.equal(payment[key], currency);
    assert.equal(payment.monto, 100);
    assert.equal(payment.medioPago, "mercadopago");
    assert.deepEqual(f.recalculations, ["tenant", "tenant"]);
    for (const patch of f.clientUpdates) assert.deepEqual(Object.keys(patch).sort(), ["ultimoPago", "updatedAt"]);
    assert.equal(f.client.saldoCuentaCorriente, 77);
    assert.equal(f.client.estado, "suspendido");
  });
}
for (const currency of [undefined, null, "", "invalid", "ZZZ", 123]) {
  test(`webhook no inventa moneda para ${String(currency)}`, async () => {
    const f = fixture(currency);
    await f.invoke();
    const payment = f.records.get("mp_payment-test");
    for (const key of ["billingCurrency", "currency", "moneda"]) assert.equal(Object.hasOwn(payment, key), false);
  });
}
