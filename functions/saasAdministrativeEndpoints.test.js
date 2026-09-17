"use strict";
/* eslint-disable require-jsdoc, max-len */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Carga los exports reales, sin inicializar Firebase ni contactar servicios.
function fixture(profile = null) {
  let writes = 0;
  const write = () => { writes += 1; throw new Error("UNEXPECTED_WRITE"); };
  const today = new Date().toISOString().slice(0, 10);
  const clients = {
    paid: {nombre: "Paid", planId: "start", billingCycle: "monthly", billingCurrency: "USD", price: 19, nextBillingDate: today, fechaAlta: today},
    trial: {nombre: "Trial", planId: "trial", frecuenciaCobro: "prueba", fechaAlta: "2000-01-01", fechaVencimiento: "2000-01-08"},
  };
  const snapshot = (id, data) => ({id, exists: Boolean(data), data: () => data, ref: {update: write}});
  const db = {
    collection: (name) => ({
      doc: (id) => ({get: async () => snapshot(id, name === "usuarios" ? profile : clients[id]), update: write, set: write}),
      get: async () => ({docs: Object.entries(clients).map(([id, data]) => snapshot(id, data))}),
      add: write,
      where: () => ({where() {return this;}, limit() {return this;}, get: async () => ({docs: []})}),
    }),
    runTransaction: write,
  };
  const wrap = (type) => (...args) => ({type, handler: args[args.length - 1]});
  const stubs = {
    "firebase-functions/v2/https": {onCall: wrap("onCall"), onRequest: wrap("onRequest"), HttpsError},
    "firebase-functions/v2/scheduler": {onSchedule: wrap("scheduler")},
    "firebase-functions/params": {defineSecret: () => ({value: () => ""})},
    "firebase-admin": {initializeApp() {}, firestore: Object.assign(() => db, {FieldValue: {serverTimestamp: () => "timestamp"}, Timestamp: {}}), storage: () => { throw new Error("UNEXPECTED_STORAGE"); }},
    sharp: () => { throw new Error("UNEXPECTED_IMAGE_OPERATION"); },
    mercadopago: {},
    "./hotmartFirestoreRepository": {createHotmartFirestoreRepository: () => ({})},
    "./hotmartWebhookHandler": {createHotmartWebhookHandler: () => async () => {}},
    "./saasNotificationHooks": {createSaasNotificationHooks: () => ({})},
    "./saasEntitlementEnforcement": {createSaasEntitlementService: () => ({})},
  };
  const context = vm.createContext({exports: {}, console: {log() {}, warn() {}, error() {}}, require: (name) => stubs[name] || require(name), Buffer, URL, Date});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "index.js"), "utf8"), context);
  return {context, endpoints: context.exports, writes: () => writes};
}

const names = ["probarCargosSaasAutomaticos", "probarCargoClienteSaas", "ejecutarCargosSaasAhoraSeguro", "migrarMiniaturasProduccionSeguro"];
for (const name of names) {
  for (const [role, auth, profile, code] of [
    ["anónimo", null, null, "unauthenticated"],
    ["usuario", {uid: "u", token: {}}, {rol: "usuario", activo: true}, "permission-denied"],
    ["admin tenant", {uid: "u", token: {}}, {rol: "admin", activo: true}, "permission-denied"],
  ]) {
    test(`${name}: rechaza ${role}`, async () => {
      const f = fixture(profile);
      assert.equal(f.endpoints[name].type, "onCall");
      await assert.rejects(f.endpoints[name].handler({auth, data: {id: "paid", clienteId: "paid"}}), {code});
      assert.equal(f.writes(), 0);
    });
  }
}

test("diagnóstico global acepta dueño por perfil, simula cargos/trial sin escribir", async () => {
  const f = fixture({rol: "superadmin"});
  const result = await f.endpoints.probarCargosSaasAutomaticos.handler({auth: {uid: "s", token: {}}});
  assert.equal(result.modoPrueba, true);
  assert.equal(result.simulados.length, 1);
  assert.equal(result.cargosEmitidos, 0);
  assert.equal(result.pruebasSuspendidas, 1);
  assert.equal(result.omitidos[0].accion, "simular_suspension_prueba");
  assert.equal(f.writes(), 0);
});

test("diagnóstico individual acepta claim superadmin y no escribe en pago/trial", async () => {
  const f = fixture();
  const auth = {uid: "s", token: {superadmin: true}};
  const paid = await f.endpoints.probarCargoClienteSaas.handler({auth, data: {id: "paid"}});
  assert.equal(paid.action, "CHARGE");
  const trial = await f.endpoints.probarCargoClienteSaas.handler({auth, data: {id: "trial"}});
  assert.equal(trial.resultado.accion, "simular_suspension_prueba");
  await assert.rejects(f.endpoints.probarCargoClienteSaas.handler({auth, data: {}}), {code: "invalid-argument"});
  await assert.rejects(f.endpoints.probarCargoClienteSaas.handler({auth, data: {id: "missing"}}), {code: "not-found"});
  assert.equal(f.writes(), 0);
});

test("callables y scheduler delegan a los mismos internos; exports HTTP legacy retirados", async () => {
  const f = fixture({rol: "superadmin"});
  vm.runInContext("var billingCalls = []; procesarCargosSaas = async (options) => { billingCalls.push(options.modoPrueba); return options; }; migrarMiniaturasProduccion = async (options) => options;", f.context);
  const auth = {uid: "s", token: {}};
  const real = await f.endpoints.ejecutarCargosSaasAhoraSeguro.handler({auth});
  assert.equal(real.modoPrueba, false);
  const diagnostic = await f.endpoints.probarCargosSaasAutomaticos.handler({auth});
  assert.equal(diagnostic.modoPrueba, true);
  const migration = await f.endpoints.migrarMiniaturasProduccionSeguro.handler({auth, data: {clienteId: "paid", modo: "todos"}});
  assert.equal(migration.clienteId, "paid");
  assert.equal(migration.soloUna, false);
  assert.equal(f.endpoints.ejecutarCargosSaasAhora, undefined);
  assert.equal(f.endpoints.ejecutarCargosSaasAhoraSeguro.type, "onCall");
  assert.equal(f.endpoints.migrarMiniaturasProduccion, undefined);
  assert.equal(f.endpoints.emitirCargosSaasAutomaticos.type, "scheduler");
  await f.endpoints.emitirCargosSaasAutomaticos.handler();
  assert.deepEqual(Array.from(f.context.billingCalls), [false, true, false]);
});
