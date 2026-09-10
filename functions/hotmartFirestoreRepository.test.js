"use strict";
/* eslint-disable require-jsdoc, max-len */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createHotmartFirestoreRepository,
  movementTotals,
  providerPeriodKey,
  stableId,
} = require("./hotmartFirestoreRepository");

function fakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const snapshot = (path) => {
    const data = docs.get(path);
    return {
      id: path.split("/").at(-1),
      exists: data !== undefined,
      data: () => data,
    };
  };
  const documentReference = (path) => ({
    id: path.split("/").at(-1),
    path,
    async get() {
      return snapshot(path);
    },
    async create(data) {
      if (docs.has(path)) {
        const error = new Error("already exists");
        error.code = 6;
        throw error;
      }
      docs.set(path, data);
    },
    async set(data, options) {
      docs.set(path, options?.merge ? {...(docs.get(path) || {}), ...data} : data);
    },
    async update(data) {
      docs.set(path, {...docs.get(path), ...data});
    },
  });
  const collectionReference = (name) => ({
    doc: (id) => documentReference(`${name}/${id}`),
    where(field, operator, value) {
      const filters = [[field, operator, value]];
      const query = {
        where(nextField, nextOperator, nextValue) {
          filters.push([nextField, nextOperator, nextValue]);
          return query;
        },
        async get() {
          const queryDocs = [...docs.entries()]
              .filter(([path]) => path.startsWith(`${name}/`))
              .filter(([, data]) => filters.every(([key, op, expected]) =>
                op === "==" && data[key] === expected))
              .map(([path]) => snapshot(path));
          return {docs: queryDocs, empty: queryDocs.length === 0};
        },
      };
      return query;
    },
  });
  const db = {
    collection: collectionReference,
    async runTransaction(callback) {
      return callback({
        get: async (reference) => reference.get(),
        create: (reference, data) => {
          if (docs.has(reference.path)) throw new Error("duplicate transaction create");
          docs.set(reference.path, data);
        },
        update: (reference, data) => docs.set(
            reference.path,
            {...docs.get(reference.path), ...data},
        ),
      });
    },
  };
  return {db, docs};
}

function approvedEvent(overrides = {}) {
  return {
    eventId: "event-1",
    eventType: "PURCHASE_APPROVED",
    action: "PAYMENT_APPROVED",
    transactionId: "HP-1",
    subscriptionId: "SUB-1",
    planId: "start",
    planName: "Start",
    billingCycle: "monthly",
    amount: 100,
    currency: "ARS",
    occurredAt: new Date("2026-09-09T00:00:00Z"),
    nextChargeAt: new Date("2026-10-09T00:00:00Z"),
    subscriptionStatus: "ACTIVE",
    issues: [],
    ...overrides,
  };
}

function createRepository(seed = {}) {
  const fake = fakeFirestore(seed);
  const repository = createHotmartFirestoreRepository({
    db: fake.db,
    FieldValue: {serverTimestamp: () => "server-time"},
    recalculate: async () => {},
    now: () => new Date("2026-09-09T00:00:00Z"),
  });
  return {...fake, repository};
}

test("pago aprobado crea cargo y pago determinísticos una sola vez", async () => {
  const tenant = {
    id: "tenant-1",
    nombre: "Tenant",
    planId: "start",
    billingCycle: "monthly",
    currency: "ARS",
  };
  const {docs, repository} = createRepository({
    "clientes-saas/tenant-1": {...tenant},
  });
  const first = await repository.applyApprovedPayment(approvedEvent(), tenant);
  const retry = await repository.applyApprovedPayment(approvedEvent({eventId: "retry"}), tenant);
  assert.equal(first.created, true);
  assert.equal(retry.duplicate, true);
  const paymentId = stableId("hotmart_payment", "HP-1");
  const payment = docs.get(`saas_pagos/${paymentId}`);
  assert.equal(payment.provider, "hotmart");
  assert.equal(payment.providerTransactionId, "HP-1");
  assert.equal(payment.providerSubscriptionId, "SUB-1");
  assert.equal(payment.providerEventId, "event-1");
  assert.equal(payment.monto, 100);
  assert.equal(payment.currency, "ARS");
  assert.equal([...docs.keys()].filter((key) => key.startsWith("saas_pagos/")).length, 2);
});

test("si ya existe cargo pendiente aplica el monto real sin crear otro cargo", async () => {
  const tenant = {id: "tenant-1", nombre: "Tenant", saldoCuentaCorriente: 150};
  const {docs, repository} = createRepository({
    "clientes-saas/tenant-1": {...tenant},
    "saas_pagos/cargo-old": {
      clienteSaasId: "tenant-1",
      tipoMovimiento: "cargo",
      monto: 150,
      periodoFacturado: "2026-08",
      anulado: false,
    },
  });
  const result = await repository.applyApprovedPayment(approvedEvent(), tenant);
  assert.equal(result.created, true);
  const payment = docs.get(`saas_pagos/${stableId("hotmart_payment", "HP-1")}`);
  assert.equal(payment.periodoFacturado, "2026-08");
  assert.equal(payment.monto, 100);
  assert.equal([...docs.keys()].filter((key) => key.startsWith("saas_pagos/")).length, 2);
});

test("no aplica un pago a una deuda pendiente de otra moneda", async () => {
  const tenant = {id: "tenant-1", nombre: "Tenant", saldoCuentaCorriente: 150};
  const {repository} = createRepository({
    "clientes-saas/tenant-1": {...tenant},
    "saas_pagos/cargo-old": {
      clienteSaasId: "tenant-1",
      tipoMovimiento: "cargo",
      monto: 150,
      currency: "USD",
      periodoFacturado: "2026-08",
      anulado: false,
    },
  });
  const result = await repository.applyApprovedPayment(
      approvedEvent({currency: "ARS"}), tenant,
  );
  assert.equal(result.pendingReason, "PENDING_DEBT_CURRENCY_MISMATCH");
});

test("proveedor de período anual y suma de movimientos son estables", () => {
  assert.equal(providerPeriodKey(approvedEvent({billingCycle: "annual"})), "2026-09-09-ANUAL");
  const docs = [
    {data: () => ({tipoMovimiento: "cargo", monto: 100, periodoFacturado: "p"})},
    {data: () => ({tipoMovimiento: "pago", monto: 40, periodoFacturado: "p"})},
  ];
  const totals = movementTotals(docs);
  assert.equal(totals.total, 60);
  assert.equal(totals.periods.get("p").payments, 40);
});

test("refund y chargeback revierten como máximo una vez la transacción original", async () => {
  const tenant = {id: "tenant-1", nombre: "Tenant"};
  const paymentId = stableId("hotmart_payment", "HP-1");
  const {docs, repository} = createRepository({
    "clientes-saas/tenant-1": tenant,
    [`saas_pagos/${paymentId}`]: {
      clienteSaasId: "tenant-1",
      tipoMovimiento: "pago",
      monto: 100,
      currency: "ARS",
      periodoFacturado: "2026-09",
    },
  });
  const refunded = await repository.reverseApprovedPayment(
      approvedEvent({action: "PAYMENT_REFUNDED"}), tenant,
  );
  const chargebackRetry = await repository.reverseApprovedPayment(
      approvedEvent({action: "PAYMENT_CHARGEBACK", eventId: "event-2"}), tenant,
  );
  assert.equal(refunded.created, true);
  assert.equal(chargebackRetry.duplicate, true);
  assert.equal([...docs.keys()].filter((key) => key.includes("hotmart_reversal")).length, 1);
});
