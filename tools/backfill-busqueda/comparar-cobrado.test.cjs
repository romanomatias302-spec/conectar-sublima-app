'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PROJECT, DATABASE, parseArgs, activePayment, compareCollected,
} = require('./comparar-cobrado.cjs');

function pagesByCursor(pages) {
  return ({ after }) => {
    const index = after === null ? 0 : Number(after) + 1;
    const documents = pages[index] || [];
    return Promise.resolve({
      documents,
      nextCursor: index + 1 < pages.length ? String(index) : null,
    });
  };
}

function adapter({ sales = [], salePayments = {}, groupPayments = [] }) {
  return {
    readSalesPage: pagesByCursor(sales),
    readSalePaymentsPage: ({ saleId, after }) => pagesByCursor(salePayments[saleId] || [])({ after }),
    readActivePaymentsGroupPage: pagesByCursor(groupPayments),
  };
}

const config = {
  project: PROJECT,
  database: DATABASE,
  tenant: 'tenant-a',
  from: '2026-08-01',
  to: '2026-08-31',
  endExclusive: '2026-09-01',
  pageSize: 2,
};

const payment = (id, overrides = {}) => ({
  id,
  data: {
    clienteId: 'tenant-a', estadoPagoRegistro: 'activo', fechaPago: '2026-08-20', monto: 100,
    ...overrides,
  },
});

test('CLI exige tenant, proyecto fijo y período inclusivo válido', () => {
  assert.deepEqual(parseArgs([
    '--project', PROJECT, '--tenant', 'tenant-a', '--from', '2026-08-01', '--to', '2026-08-31',
  ]), { help: false, ...config, pageSize: 100 });
  assert.throws(() => parseArgs([
    '--project', PROJECT, '--tenant', 'tenant-a', '--from', '2026-08-31', '--to', '2026-08-01',
  ]), /posterior/);
  assert.throws(() => parseArgs([
    '--project', 'otro', '--tenant', 'tenant-a', '--from', '2026-08-01', '--to', '2026-08-31',
  ]), /Proyecto obligatorio/);
});

test('criterio activo conserva compatibilidad legacy y excluye anulados', () => {
  assert.equal(activePayment({}), true);
  assert.equal(activePayment({ estadoPagoRegistro: 'activo' }), true);
  assert.equal(activePayment({ estadoPagoRegistro: 'anulado' }), false);
  assert.equal(activePayment({ activo: false }), false);
  assert.equal(activePayment({ anulado: true }), false);
});

test('métodos equivalen para pago histórico cobrado dentro del período', async () => {
  const item = payment('p1');
  const result = await compareCollected(config, adapter({
    sales: [[{ id: 'v1', data: { clienteId: 'tenant-a' } }]],
    salePayments: { v1: [[item]] },
    groupPayments: [[item]],
  }));
  assert.equal(result.equivalent, true);
  assert.equal(result.oldMethod.activePaymentCount, 1);
  assert.equal(result.oldMethod.totalCollected, 100);
});

test('excluye anulados, otros tenants y fechas fuera del período', async () => {
  const valid = payment('p1');
  const invalid = [
    payment('p2', { estadoPagoRegistro: 'anulado' }),
    payment('p3', { clienteId: 'tenant-b' }),
    payment('p4', { fechaPago: '2026-09-01' }),
  ];
  const result = await compareCollected(config, adapter({
    sales: [[{ id: 'v1', data: { clienteId: 'tenant-a' } }]],
    salePayments: { v1: [[valid, ...invalid]] },
    groupPayments: [[valid]],
  }));
  assert.equal(result.equivalent, true);
  assert.equal(result.oldMethod.activePaymentCount, 1);
});

test('pagina ventas, subcolecciones y collectionGroup sin duplicar', async () => {
  const p1 = payment('p1', { monto: 40 });
  const p2 = payment('p2', { monto: 60 });
  const result = await compareCollected(config, adapter({
    sales: [
      [{ id: 'v1', data: { clienteId: 'tenant-a' } }],
      [{ id: 'v2', data: { clienteId: 'tenant-a' } }],
    ],
    salePayments: { v1: [[p1]], v2: [[p2]] },
    groupPayments: [[p1], [p2]],
  }));
  assert.equal(result.equivalent, true);
  assert.equal(result.oldMethod.salesExamined, 2);
  assert.equal(result.oldMethod.activePaymentCount, 2);
  assert.equal(result.oldMethod.totalCollected, 100);
});

test('detecta diferencia por pago embebido sin subdocumento', async () => {
  const embedded = payment('embedded').data;
  const result = await compareCollected(config, adapter({
    sales: [[{ id: 'v1', data: { clienteId: 'tenant-a', pagos: [embedded] } }]],
    salePayments: { v1: [] },
    groupPayments: [],
  }));
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.difference, { activePaymentCount: -1, totalCollected: -100 });
});
