'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseArgs,
  classifySubPayment,
  classifyEmbeddedPayment,
  classifyKnownPayment,
  runAudit,
  runKnownPaymentsDiagnostic,
  createReadOnlyAdapter,
  printKnownPaymentsReport,
} = require('./auditoria-pagos.cjs');

function paginate(rows, cursor, size) {
  const sorted = [...rows].sort((left, right) => left.id.localeCompare(right.id));
  const start = cursor === null ? 0 : sorted.findIndex(row => row.id === cursor) + 1;
  return sorted.slice(start, start + size);
}

function memoryAdapter({ tenants = [], sales = [], payments = {}, movements = [] }) {
  return Object.freeze({
    pageTenants: (tenantId, cursor, size) => Promise.resolve(paginate(
      tenantId ? tenants.filter(item => item.id === tenantId) : tenants,
      cursor,
      size
    )),
    pageSales: (tenant, cursor, size) => Promise.resolve(paginate(
      tenant ? sales.filter(sale => sale.data.clienteId === tenant) : sales,
      cursor,
      size
    )),
    pagePayments: (saleId, cursor, size) => Promise.resolve(paginate(payments[saleId] || [], cursor, size)),
    pageMovements: (tenant, cursor, size) => Promise.resolve(paginate(
      tenant ? movements.filter(movement => movement.data.clienteId === tenant) : movements,
      cursor,
      size
    )),
    getSale: saleId => Promise.resolve(sales.find(sale => sale.id === saleId) || null),
    getPayment: (saleId, paymentId) => Promise.resolve(
      (payments[saleId] || []).find(payment => payment.id === paymentId) || null
    ),
  });
}

const tenant = { id: 'tenant-a', data: { nombre: 'Tenant A', estado: 'activo' } };

test('CLI solo admite tenant individual o inventario global y no posee apply', () => {
  assert.equal(parseArgs([
    '--project', 'conectarsublimados-7881e', '--tenant', 'tenant-a', '--page-size', '25',
  ]).tenant, 'tenant-a');
  assert.equal(parseArgs([
    '--project', 'conectarsublimados-7881e', '--inventory-global',
  ]).global, true);
  assert.equal(parseArgs([
    '--project', 'conectarsublimados-7881e', '--inspect-known-payments',
  ]).inspectKnown, true);
  assert.throws(() => parseArgs([
    '--project', 'conectarsublimados-7881e', '--tenant', 'tenant-a', '--apply',
  ]), /desconocido/);
});

test('clasifica subdocumentos aptos, normalizables e inválidos sin inferir identidad', () => {
  assert.equal(classifySubPayment({ data: {
    clienteId: 'tenant-a', fechaPago: '2026-09-03', monto: 10, estadoPagoRegistro: 'activo',
  } }, 'tenant-a').classification, 'LISTO_PARA_COLLECTION_GROUP');
  assert.equal(classifySubPayment({ data: {
    fechaPago: '2026-09-03', monto: 10, estadoPagoRegistro: 'activo',
  } }, 'tenant-a').classification, 'LEGACY_NORMALIZABLE');
  assert.equal(classifySubPayment({ data: {
    clienteId: 'tenant-a', fechaPago: '2026-09-03', monto: 10,
  } }, 'tenant-a').classification, 'AMBIGUO');
  assert.equal(classifySubPayment({ data: {
    clienteId: 'tenant-a', fechaPago: '2026-09-03', monto: 10, anulado: true,
  } }, 'tenant-a').classification, 'LEGACY_NORMALIZABLE');
  assert.equal(classifySubPayment({ data: {
    clienteId: 'tenant-a', fechaPago: null, monto: 10, estadoPagoRegistro: 'activo',
  } }, 'tenant-a').classification, 'INVALIDO');
});

test('solo un ID estable demuestra el duplicado embebido/subcolección', () => {
  const sub = [{ id: 'p-1', data: {
    fechaPago: '2026-09-03', monto: 10, medioPago: 'efectivo', estadoPagoRegistro: 'activo',
  } }];
  assert.equal(classifyEmbeddedPayment({ data: {
    firebaseId: 'p-1', fechaPago: '2026-09-03', monto: 10,
    medioPago: 'efectivo', estadoPagoRegistro: 'activo',
  } }, sub).classification, 'LEGACY_NORMALIZABLE');
  assert.equal(classifyEmbeddedPayment({ data: {
    fechaPago: '2026-09-03', monto: 10, medioPago: 'efectivo', estadoPagoRegistro: 'activo',
  } }, sub).classification, 'AMBIGUO');
});

test('diagnóstico dirigido no presume activo y no inventa una fecha faltante', async () => {
  const sales = [
    { id: '39iO7tiIMJa9k2X3K8Vw', data: {
      clienteId: 'elgol', estadoVenta: 'activa', total: 30, clienteNombre: 'NO_IMPRIMIR_CLIENTE',
    } },
    { id: 'ugBXc7nUUqkHlvkY7dl4', data: { clienteId: 'elgol3', estadoVenta: 'activa', total: 40 } },
  ];
  const base = {
    clienteId: 'elgol', fechaPago: '2026-09-03', monto: 10, observacion: 'NO_IMPRIMIR_OBSERVACION',
  };
  const payments = {
    '39iO7tiIMJa9k2X3K8Vw': [
      { id: 'ICYOFj9oi7vZSPb1kwC7', data: { ...base } },
      { id: 'KW3vecpp6BMBYveP2K9Q', data: { ...base } },
      { id: 'oP0yX3PUyJVs0B2hB4SK', data: { ...base } },
    ],
    'ugBXc7nUUqkHlvkY7dl4': [
      { id: 'zrCmHAg2jRv3Ov1wQk8K', data: {
        clienteId: 'elgol3', fechaPago: null, monto: 40, estadoPagoRegistro: 'activo',
      } },
    ],
  };
  const result = await runKnownPaymentsDiagnostic({
    project: 'conectarsublimados-7881e', database: '(default)', global: false,
    inspectKnown: true, tenant: null, pageSize: 2, detailLimit: 10,
  }, memoryAdapter({
    tenants: [
      { id: 'elgol', data: {
        nombreVisible: 'El Gol', estado: 'activo', timezone: 'America/Argentina/Buenos_Aires',
        moneda: 'ARS', logoUrl: 'data:image/png;base64,CONTENIDO_ENORME', configuracion: { privada: true },
      } },
      { id: 'elgol3', data: { estado: 'activo' } },
    ],
    sales,
    payments,
    movements: [{ id: 'mov-1', data: {
      clienteId: 'elgol', origenRefId: '39iO7tiIMJa9k2X3K8Vw', subtipo: 'cobro_venta',
      monto: 10, fecha: '2026-09-03', descripcion: 'NO_IMPRIMIR_DESCRIPCION',
    } }],
  }));
  assert.deepEqual(result.cases.map(item => item.classification), [
    'AMBIGUO', 'AMBIGUO', 'AMBIGUO', 'NO_NORMALIZABLE',
  ]);
  assert.equal(result.definitive, true);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /logoUrl|base64|CONTENIDO_ENORME|configuracion|privada|NO_IMPRIMIR/);
  assert.deepEqual(result.cases[0].tenant, {
    id: 'elgol', nombreVisible: 'El Gol', estado: 'activo',
    timezone: 'America/Argentina/Buenos_Aires', moneda: 'ARS',
  });
  const output = [];
  printKnownPaymentsReport(result, line => output.push(line));
  assert.doesNotMatch(output.join('\n'), /logoUrl|base64|CONTENIDO_ENORME|configuracion|privada|NO_IMPRIMIR/);
});

test('venta anulada aporta evidencia estable para completar estado anulado', () => {
  const result = classifyKnownPayment({
    target: { tenant: 'tenant-a', saleId: 'v-1', paymentId: 'p-1' },
    sale: { data: { clienteId: 'tenant-a', estadoVenta: 'anulada' } },
    payment: { data: { clienteId: 'tenant-a', fechaPago: '2026-09-03', monto: 10 } },
    movements: [],
  });
  assert.equal(result.classification, 'NORMALIZABLE_SEGURO');
  assert.deepEqual(result.suggestedChanges, { ventaId: 'v-1', estadoPagoRegistro: 'anulado' });
});

test('audita paginado, relaciones confiables, huérfanos y estados contradictorios', async () => {
  const result = await runAudit({
    project: 'conectarsublimados-7881e', database: '(default)', global: true,
    tenant: null, pageSize: 2, detailLimit: 50,
  }, memoryAdapter({
    tenants: [tenant],
    sales: [
      { id: 'v-1', data: { clienteId: 'tenant-a', pagos: [
        { firebaseId: 'p-1', clienteId: 'tenant-a', fechaPago: '2026-09-03',
          monto: 10, medioPago: 'efectivo', estadoPagoRegistro: 'activo' },
        { fechaPago: '2026-09-03', monto: 10, medioPago: 'efectivo' },
      ] } },
      { id: 'v-2', data: { clienteId: 'tenant-huerfano' } },
    ],
    payments: {
      'v-1': [
        { id: 'p-1', data: { clienteId: 'tenant-a', fechaPago: '2026-09-03',
          monto: 10, medioPago: 'efectivo', estadoPagoRegistro: 'activo' } },
        { id: 'p-2', data: { fechaPago: '2026-09-03', monto: 20,
          medioPago: 'tarjeta', estadoPagoRegistro: 'anulado' } },
      ],
    },
    movements: [
      { id: 'm-1', data: { clienteId: 'tenant-a', subtipo: 'cobro_venta',
        origenRefId: 'v-1', pagoRefId: 'p-1', fecha: '2026-09-03', monto: 10,
        medioPago: 'efectivo', estadoMovimiento: 'activo', activo: true } },
      { id: 'm-2', data: { clienteId: 'tenant-a', subtipo: 'cobro_venta',
        origenRefId: 'v-1', pagoRefId: 'p-2', fecha: '2026-09-03', monto: 20,
        medioPago: 'tarjeta', estadoMovimiento: 'activo', activo: true } },
      { id: 'm-3', data: { clienteId: 'tenant-a', subtipo: 'cobro_venta',
        origenRefId: 'v-1', pagoRefId: '', fecha: '2026-09-03', monto: 10,
        medioPago: 'efectivo', estadoMovimiento: 'activo' } },
      { id: 'm-4', data: { clienteId: 'tenant-huerfano', subtipo: 'cobro_venta',
        origenRefId: 'v-2', fecha: '2026-09-01', monto: 99 } },
    ],
  }));
  assert.equal(result.definitive, true);
  const row = result.tenants.find(item => item.clienteId === 'tenant-a');
  assert.equal(row.metricas.ventasConAmbasRepresentaciones, 1);
  assert.equal(row.metricas.pagosSubcoleccion, 2);
  assert.equal(row.metricas.pagosEmbebidos, 2);
  assert.equal(row.metricas.pagosConMovimientoRelacionado, 2);
  assert.equal(row.metricas.pagosSinMovimientoRelacionado, 0);
  assert.equal(row.metricas.anulacionesInconsistentes, 1);
  assert.equal(row.metricas.duplicadosSeguros, 1);
  assert.equal(row.metricas.duplicadosAmbiguos, 1);
  assert.equal(row.metricas.movimientosHuerfanos, 1);
  const orphan = result.tenants.find(item => item.clienteId === 'tenant-huerfano');
  assert.equal(orphan.registrado, false);
  assert.equal(orphan.metricas.movimientosHuerfanos, 1);
});

test('modo tenant no incorpora documentos de otros tenants', async () => {
  const result = await runAudit({
    project: 'conectarsublimados-7881e', database: '(default)', global: false,
    tenant: 'tenant-a', pageSize: 1, detailLimit: 10,
  }, memoryAdapter({
    tenants: [tenant, { id: 'tenant-b', data: { estado: 'activo' } }],
    sales: [
      { id: 'a', data: { clienteId: 'tenant-a' } },
      { id: 'b', data: { clienteId: 'tenant-b' } },
    ],
    movements: [
      { id: 'a', data: { clienteId: 'tenant-a', subtipo: 'otro' } },
      { id: 'b', data: { clienteId: 'tenant-b', subtipo: 'cobro_venta' } },
    ],
  }));
  assert.deepEqual(result.tenants.map(row => row.clienteId), ['tenant-a']);
  assert.equal(result.totals.ventasExaminadas, 1);
  assert.equal(result.totals.movimientosCobroVenta, 0);
});

test('adaptador público expone solo lecturas necesarias', () => {
  const chain = {
    collection() { return this; }, doc() { return this; }, select() { return this; },
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    startAfter() { return this; }, get: async () => ({ docs: [] }),
  };
  const adapter = createReadOnlyAdapter(chain, { documentId: () => '__name__' });
  assert.deepEqual(Object.keys(adapter).sort(), [
    'getPayment', 'getSale', 'pageMovements', 'pagePayments', 'pageSales', 'pageTenants',
  ]);
  const source = fs.readFileSync(path.join(__dirname, 'auditoria-pagos.cjs'), 'utf8');
  assert.doesNotMatch(source, /\.(?:update|create|delete|batch|runTransaction|bulkWriter)\s*\(/);
  assert.doesNotMatch(source, /\b(?:updateDoc|setDoc|addDoc|writeBatch|runTransaction|BulkWriter)\b/);
});
