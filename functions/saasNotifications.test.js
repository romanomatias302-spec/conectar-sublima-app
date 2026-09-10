/* eslint-disable require-jsdoc */

const assert = require("node:assert/strict");
const test = require("node:test");
const {SAAS_NOTIFICATION_EVENTS} = require("./saasNotificationCatalog");
const {
  buildSaasOutboxRecord,
  calculateNotificationRetry,
} = require("./saasNotificationCore");
const {clientVariables, createSaasNotificationHooks} = require("./saasNotificationHooks");
const {
  enqueueSaasNotification,
  SAAS_NOTIFICATION_OUTBOX,
} = require("./saasNotificationOutbox");
const {SaasNotificationProvider} = require("./saasNotificationProvider");

function fakeFirestore() {
  const documents = new Map();
  return {
    documents,
    collection: (collectionName) => ({
      doc: (id) => ({
        create: async (data) => {
          const path = `${collectionName}/${id}`;
          if (documents.has(path)) {
            const error = new Error("already exists");
            error.code = 6;
            throw error;
          }
          documents.set(path, data);
        },
      }),
    }),
  };
}

const activeClient = {
  id: "tenant-a",
  nombre: "Empresa A",
  nombreCliente: "Ana",
  email: "FACTURACION@EMPRESA.TEST ",
  planNombre: "Profesional",
  billingCycle: "monthly",
  currency: "ARS",
  price: 39000,
};

test("notificaciones resuelven billing sin usar moneda operativa", () => {
  assert.equal(clientVariables({
    billingCurrency: "USD", currency: "ARS", moneda: "MXN",
  }).currency, "USD");
  assert.equal(clientVariables({currency: "ARS", moneda: "MXN"}).currency, "ARS");
  assert.equal(clientVariables({moneda: "MXN"}).currency, "USD");
});

test("el mismo evento crea una sola notificación", async () => {
  const db = fakeFirestore();
  const input = {
    db,
    eventType: SAAS_NOTIFICATION_EVENTS.CLIENT_CREATED,
    clienteId: activeClient.id,
    recipient: activeClient.email,
    variables: {clienteNombre: activeClient.nombreCliente},
  };
  const first = await enqueueSaasNotification(input);
  const retry = await enqueueSaasNotification(input);
  assert.equal(first.created, true);
  assert.equal(retry.duplicate, true);
  assert.equal(db.documents.size, 1);
});

test("welcome se encola una sola vez por cliente", async () => {
  const db = fakeFirestore();
  const hooks = createSaasNotificationHooks({db});
  await hooks.clientCreated(activeClient);
  await hooks.clientCreated(activeClient);
  const records = [...db.documents.values()];
  assert.equal(records.length, 1);
  assert.equal(records[0].templateId, "welcome");
});

test("payment received usa paymentId para su identidad", async () => {
  const db = fakeFirestore();
  const hooks = createSaasNotificationHooks({db});
  const payment = {
    id: "payment-7", monto: 1000, moneda: "ARS", fechaPago: "2026-09-09",
  };
  await hooks.paymentReceived(activeClient, payment);
  await hooks.paymentReceived(activeClient, payment);
  const record = [...db.documents.values()][0];
  assert.match(record.idempotencyKey, /payment-7$/);
  assert.equal(db.documents.size, 1);
});

test("suspensión usa una clave de transición estable", async () => {
  const db = fakeFirestore();
  const hooks = createSaasNotificationHooks({db});
  await hooks.accountSuspended(activeClient, "suspension-2026-09-09");
  await hooks.accountSuspended(activeClient, "suspension-2026-09-09");
  assert.equal(db.documents.size, 1);
  assert.match([...db.documents.values()][0].idempotencyKey,
      /suspension-2026-09-09$/);
});

test("recipient ausente queda skipped sin romper el flujo", async () => {
  const db = fakeFirestore();
  const hooks = createSaasNotificationHooks({db});
  const result = await hooks.paymentReceived({...activeClient, email: ""}, {
    id: "payment-no-email",
    monto: 20,
    moneda: "USD",
    fechaPago: "2026-09-09",
  });
  assert.equal(result.created, true);
  const record = [...db.documents.values()][0];
  assert.equal(record.status, "skipped");
  assert.equal(record.lastErrorCode, "MISSING_RECIPIENT");
});

test("template desconocido falla de forma controlada", () => {
  assert.throws(() => buildSaasOutboxRecord({
    eventType: "UNKNOWN",
    clienteId: "tenant-a",
    recipient: "a@example.test",
  }), (error) => error.code === "UNKNOWN_NOTIFICATION_EVENT");
});

test("payload conserva sólo variables permitidas y no secretos", () => {
  const record = buildSaasOutboxRecord({
    eventType: SAAS_NOTIFICATION_EVENTS.CLIENT_CREATED,
    clienteId: "tenant-a",
    recipient: "a@example.test",
    variables: {
      clienteNombre: "Ana",
      apiKey: "secret-value",
      password: "secret-value",
      nested: {token: "secret-value"},
    },
  });
  assert.deepEqual(record.payload, {clienteNombre: "Ana"});
  assert.doesNotMatch(JSON.stringify(record), /secret-value/);
});

test("outbox usa su colección y el proveedor base no envía", async () => {
  const db = fakeFirestore();
  await createSaasNotificationHooks({db}).clientCreated(activeClient);
  assert.match([...db.documents.keys()][0],
      new RegExp(`^${SAAS_NOTIFICATION_OUTBOX}/`));
  await assert.rejects(
      new SaasNotificationProvider().sendTransactionalEmail({}),
      (error) => error.code === "EMAIL_PROVIDER_NOT_CONFIGURED");
});

test("retry usa backoff y termina al alcanzar el límite", () => {
  const now = new Date("2026-09-09T00:00:00Z");
  assert.equal(calculateNotificationRetry(1, now).nextAttemptAt.toISOString(),
      "2026-09-09T00:05:00.000Z");
  assert.deepEqual(calculateNotificationRetry(5, now), {
    status: "failed", nextAttemptAt: null,
  });
});
