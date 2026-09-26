'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSaasMercadoPagoPreferenceHandler,
  payablePeriods,
  resolveSaasBillingCurrency,
} = require('./saasMercadoPagoPreference');

class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function fixture({ profile, client, movements = [], providerResponse } = {}) {
  const reads = [];
  const fetchCalls = [];
  const documents = {
    usuarios: { user: profile },
    'clientes-saas': { tenant: client, other: client },
  };
  const snapshot = (data) => ({ exists: Boolean(data), data: () => data });
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              reads.push(`${name}/${id}`);
              return snapshot(documents[name]?.[id]);
            },
          };
        },
        where(field, operator, value) {
          assert.equal(name, 'saas_pagos');
          assert.equal(field, 'clienteSaasId');
          assert.equal(operator, '==');
          assert.equal(value, 'tenant');
          return {
            async get() {
              reads.push('saas_pagos');
              return { docs: movements.map((movement) => ({ data: () => movement })) };
            },
          };
        },
      };
    },
  };
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options, body: JSON.parse(options.body) });
    if (providerResponse instanceof Error) throw providerResponse;
    return {
      ok: providerResponse?.ok ?? true,
      status: providerResponse?.status ?? 201,
      json: async () =>
        providerResponse?.data || { id: 'preference', init_point: 'https://mp.test/pay' },
    };
  };
  const handler = createSaasMercadoPagoPreferenceHandler({
    db,
    HttpsError,
    fetchImpl,
    getAccessToken: () => 'test-token',
    logger: { error() {} },
  });
  return { handler, fetchCalls, reads };
}

const adminProfile = { rol: 'admin', activo: true, clienteId: 'tenant' };
const eligibleClient = {
  nombre: 'Taller',
  pais: 'Argentina',
  moneda: 'USD',
  billingCurrency: 'ARS',
  billingProvider: 'mercadopago',
};
const debt = [
  { periodoFacturado: '2026-08', tipoMovimiento: 'cargo', monto: 12000 },
  { periodoFacturado: '2026-08', tipoMovimiento: 'pago', monto: 2000 },
];

test('admin activo argentino crea preferencia ARS aunque la moneda operativa sea USD', async () => {
  const f = fixture({ profile: adminProfile, client: eligibleClient, movements: debt });
  const result = await f.handler({
    auth: { uid: 'user', token: {} },
    data: { clienteSaasId: 'tenant' },
  });

  assert.equal(result.initPoint, 'https://mp.test/pay');
  assert.equal(result.monto, 10000);
  assert.equal(result.currency, 'ARS');
  assert.equal(f.fetchCalls.length, 1);
  assert.equal(f.fetchCalls[0].body.items[0].currency_id, 'ARS');
  assert.equal(f.fetchCalls[0].body.items[0].unit_price, 10000);
  assert.equal(f.fetchCalls[0].body.metadata.clienteSaasId, 'tenant');
});

test('permite pagar con Mercado Pago a un cliente con cobro Manual', async () => {
  const client = {
    ...eligibleClient,
    billingProvider: 'manual',
    metodoCobro: 'manual',
  };

  const f = fixture({
    profile: adminProfile,
    client,
    movements: debt,
  });

  const result = await f.handler({
    auth: { uid: 'user', token: {} },
    data: { clienteSaasId: 'tenant' },
  });

  assert.equal(result.currency, 'ARS');
  assert.equal(result.monto, 10000);
  assert.equal(f.fetchCalls.length, 1);
  assert.equal(
    f.fetchCalls[0].body.items[0].currency_id,
    'ARS',
  );
});

for (const [name, request, profile, code] of [
  ['anónimo', { auth: null, data: {} }, null, 'unauthenticated'],
  [
    'usuario común',
    { auth: { uid: 'user', token: {} }, data: {} },
    { rol: 'usuario', activo: true, clienteId: 'tenant' },
    'permission-denied',
  ],
  [
    'admin inactivo',
    { auth: { uid: 'user', token: {} }, data: {} },
    { rol: 'admin', activo: false, clienteId: 'tenant' },
    'permission-denied',
  ],
  [
    'otro tenant',
    { auth: { uid: 'user', token: {} }, data: { clienteSaasId: 'other' } },
    adminProfile,
    'permission-denied',
  ],
]) {
  test(`rechaza ${name}`, async () => {
    const f = fixture({ profile, client: eligibleClient, movements: debt });
    await assert.rejects(f.handler(request), { code });
    assert.equal(f.fetchCalls.length, 0);
  });
}

for (const [name, client, expectedCode] of [
  [
    'facturación USD',
    { ...eligibleClient, billingCurrency: 'USD', currency: 'ARS' },
    'SAAS_PAYMENT_UNSUPPORTED_CURRENCY',
  ],
  ['otro país', { ...eligibleClient, pais: 'Uruguay' }, 'SAAS_PAYMENT_UNSUPPORTED_COUNTRY'],
  [
    'Hotmart',
    { ...eligibleClient, billingProvider: 'hotmart' },
    'SAAS_PAYMENT_UNSUPPORTED_PROVIDER',
  ],
]) {
  test(`rechaza ${name}`, async () => {
    const f = fixture({ profile: adminProfile, client, movements: debt });
    await assert.rejects(
      f.handler({ auth: { uid: 'user' }, data: { clienteSaasId: 'tenant' } }),
      (error) => error.details?.code === expectedCode,
    );
    assert.equal(f.fetchCalls.length, 0);
  });
}

test('rechaza deuda cero sin contactar Mercado Pago', async () => {
  const f = fixture({
    profile: adminProfile,
    client: eligibleClient,
    movements: [
      { periodoFacturado: '2026-08', tipoMovimiento: 'cargo', monto: 100 },
      { periodoFacturado: '2026-08', tipoMovimiento: 'pago', monto: 100 },
    ],
  });
  await assert.rejects(
    f.handler({ auth: { uid: 'user' }, data: { clienteSaasId: 'tenant' } }),
    (error) => error.details?.code === 'SAAS_PAYMENT_NO_DEBT',
  );
  assert.equal(f.fetchCalls.length, 0);
});

test('oculta el detalle de un error de Mercado Pago', async () => {
  const f = fixture({
    profile: adminProfile,
    client: eligibleClient,
    movements: debt,
    providerResponse: { ok: false, status: 500, data: { message: 'provider detail' } },
  });
  await assert.rejects(
    f.handler({ auth: { uid: 'user' }, data: { clienteSaasId: 'tenant' } }),
    (error) =>
      error.code === 'internal' &&
      error.details?.code === 'SAAS_PAYMENT_PROVIDER_ERROR' &&
      !error.message.includes('provider detail'),
  );
});

test('resuelve moneda SaaS sin usar moneda operativa', () => {
  assert.equal(resolveSaasBillingCurrency({ billingCurrency: 'ARS', moneda: 'USD' }), 'ARS');
  assert.equal(resolveSaasBillingCurrency({ currency: 'ARS', moneda: 'USD' }), 'ARS');
  assert.equal(resolveSaasBillingCurrency({ moneda: 'ARS' }), 'USD');
});

test('la deuda omite anulados y elige el período positivo más antiguo', () => {
  assert.deepEqual(
    payablePeriods([
      { periodoFacturado: '2026-09', tipoMovimiento: 'cargo', monto: 50 },
      { periodoFacturado: '2026-08', tipoMovimiento: 'cargo', monto: 100 },
      { periodoFacturado: '2026-08', tipoMovimiento: 'pago', monto: 25 },
      { periodoFacturado: '2026-07', tipoMovimiento: 'cargo', monto: 100, anulado: true },
    ]).map(({ period, balance }) => ({ period, balance })),
    [
      { period: '2026-08', balance: 75 },
      { period: '2026-09', balance: 50 },
    ],
  );
});
