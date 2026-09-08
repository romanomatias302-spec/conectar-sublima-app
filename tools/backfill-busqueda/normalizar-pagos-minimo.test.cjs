'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PROJECT, DATABASE, SALE_ID, PAYMENT_IDS, EXPECTED, DESIRED,
  parseArgs, validatePayment, runNormalization, createAdminAdapter,
} = require('./normalizar-pagos-minimo.cjs');

const updateTime = { marker: 'update-time' };

function payment(overrides = {}) {
  return {
    exists: true,
    updateTime,
    data: { ...EXPECTED, ...overrides },
  };
}

function adapterFor(payments, applyOne = async () => ({ committed: true })) {
  return {
    readSale: async () => ({
      exists: true, updateTime, data: { clienteId: 'elgol', estadoVenta: 'anulada' },
    }),
    readPayment: async (_saleId, paymentId) => payments[paymentId],
    applyOne,
  };
}

test('CLI es dry-run por defecto y apply exige confirmación exacta', () => {
  assert.deepEqual(parseArgs(['--project', PROJECT]), {
    help: false, project: PROJECT, database: DATABASE, apply: false,
  });
  assert.equal(parseArgs([
    '--project', PROJECT, '--apply', '--confirm', 'elgol:3-pagos-anulados',
  ]).apply, true);
  assert.throws(() => parseArgs(['--project', PROJECT, '--apply']), /exige --confirm/);
  assert.throws(() => parseArgs(['--project', PROJECT, '--tenant', 'elgol']), /desconocido/);
});

test('validación acepta solo precondiciones exactas y propone dos campos autorizados', () => {
  const result = validatePayment(payment(), PAYMENT_IDS[0]);
  assert.deepEqual(result.proposedChanges, DESIRED);
  assert.equal(result.expectedResult, 'ACTUALIZAR');
  assert.throws(() => validatePayment(payment({ monto: 99 }), PAYMENT_IDS[0]), /monto cambió/);
  assert.throws(() => validatePayment(payment(), 'zrCmHAg2jRv3Ov1wQk8K'), /allowlist/);
});

test('dry-run inspecciona los tres documentos y no invoca apply', async () => {
  const payments = Object.fromEntries(PAYMENT_IDS.map(id => [id, payment()]));
  let calls = 0;
  const result = await runNormalization(
    { project: PROJECT, database: DATABASE, apply: false },
    adapterFor(payments, async () => { calls += 1; return { committed: true }; }),
    () => {}
  );
  assert.equal(result.writes, 0);
  assert.equal(result.inspected.length, 3);
  assert.equal(calls, 0);
});

test('apply procesa exclusivamente los tres allowlisted y es idempotente', async () => {
  const payments = Object.fromEntries(PAYMENT_IDS.map(id => [id, payment()]));
  const called = [];
  const result = await runNormalization(
    { project: PROJECT, database: DATABASE, apply: true },
    adapterFor(payments, async input => { called.push(input); return { committed: true }; }),
    () => {}
  );
  assert.equal(result.writes, 3);
  assert.deepEqual(called.map(item => item.paymentId), PAYMENT_IDS);
  assert.ok(called.every(item => item.saleId === SALE_ID));

  const normalized = Object.fromEntries(PAYMENT_IDS.map(id => [id, payment(DESIRED)]));
  const second = await runNormalization(
    { project: PROJECT, database: DATABASE, apply: true },
    adapterFor(normalized, async () => { throw new Error('no debe escribir'); }),
    () => {}
  );
  assert.equal(second.writes, 0);
});

test('adaptador Admin usa transacción, relee venta/pago y conserva lastUpdateTime real', async () => {
  const updates = [];
  const timestamp = { marker: 'timestamp-original' };
  const saleSnapshot = {
    exists: true, data: () => ({ clienteId: 'elgol', estadoVenta: 'anulada' }), updateTime: timestamp,
  };
  const paymentSnapshot = {
    exists: true, data: () => ({ ...EXPECTED }), updateTime: timestamp,
  };
  const makeRef = path => ({
    path,
    collection(name) { return makeRef(`${path}/${name}`); },
    doc(id) { return makeRef(`${path}/${id}`); },
    async get() { return path === `ventas/${SALE_ID}` ? saleSnapshot : paymentSnapshot; },
  });
  const db = {
    collection: name => makeRef(name),
    async runTransaction(callback) {
      const result = await callback({
        get: async ref => ref.path === `ventas/${SALE_ID}` ? saleSnapshot : paymentSnapshot,
        update: (...args) => updates.push(args),
      });
      return result;
    },
  };
  const result = await createAdminAdapter(db).applyOne({ saleId: SALE_ID, paymentId: PAYMENT_IDS[0] });
  assert.equal(result.committed, true);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0][1], DESIRED);
  assert.equal(updates[0][2].lastUpdateTime, timestamp);
});
