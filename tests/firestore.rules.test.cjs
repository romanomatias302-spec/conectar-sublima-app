'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-zalfro-rules';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const DATE_FROM = '2026-08-01';
const DATE_TO_EXCLUSIVE = '2026-09-01';

let environment;

function authenticatedDb(uid) {
  return environment.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
}

function paymentsQuery(db, tenant) {
  return query(collectionGroup(db, 'pagos'), where('clienteId', '==', tenant));
}

function activePaymentsQuery(db, tenant) {
  return query(
    collectionGroup(db, 'pagos'),
    where('clienteId', '==', tenant),
    where('estadoPagoRegistro', '==', 'activo'),
    where('fechaPago', '>=', DATE_FROM),
    where('fechaPago', '<', DATE_TO_EXCLUSIVE),
    orderBy('fechaPago', 'asc')
  );
}

test.before(async () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

test.beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'clientes-saas', TENANT_A), { estado: 'activo' }),
      setDoc(doc(db, 'clientes-saas', TENANT_B), { estado: 'activo' }),
      setDoc(doc(db, 'usuarios', 'reader-a'), {
        activo: true,
        clienteId: TENANT_A,
        rol: 'usuario',
        permisos: {
          ventas: { ver: true, crear: false, editar: false },
          inicio: { verIngresos: false },
        },
      }),
      setDoc(doc(db, 'usuarios', 'without-sales-access'), {
        activo: true,
        clienteId: TENANT_A,
        rol: 'usuario',
        permisos: {
          ventas: { ver: false, crear: false, editar: false },
          inicio: { verIngresos: false },
        },
      }),
      setDoc(doc(db, 'usuarios', 'superadmin'), {
        activo: true,
        rol: 'superadmin',
        permisos: {},
      }),
      setDoc(doc(db, 'usuarios', 'admin-a'), {
        activo: true,
        clienteId: TENANT_A,
        rol: 'admin',
        permisos: {},
      }),
      setDoc(doc(db, 'usuarios', 'inactive-a'), {
        activo: false,
        clienteId: TENANT_A,
        rol: 'usuario',
        email: 'inactive@example.test',
      }),
      setDoc(doc(db, 'sucursales', 'inactive-branch-a'), {
        activa: false,
        clienteId: TENANT_A,
        nombre: 'Inactiva',
      }),
      setDoc(doc(db, 'invitaciones_usuarios', 'pending-a'), {
        clienteId: TENANT_A,
        nombre: 'Pendiente',
        email: 'pending@example.test',
        rol: 'usuario',
        estado: 'pendiente',
        token: 'pending-a',
        createdAt: new Date('2026-09-10T00:00:00Z'),
        expiraAt: new Date('2099-09-17T00:00:00Z'),
      }),
      setDoc(doc(db, 'ventas', 'sale-a'), { clienteId: TENANT_A }),
      setDoc(doc(db, 'ventas', 'sale-b'), { clienteId: TENANT_B }),
      setDoc(doc(db, 'ventas', 'sale-a', 'pagos', 'payment-a'), {
        clienteId: TENANT_A,
        ventaId: 'sale-a',
        estadoPagoRegistro: 'activo',
        fechaPago: '2026-08-15',
        monto: 100,
      }),
      setDoc(doc(db, 'ventas', 'sale-b', 'pagos', 'payment-b'), {
        clienteId: TENANT_B,
        ventaId: 'sale-b',
        estadoPagoRegistro: 'activo',
        fechaPago: '2026-08-16',
        monto: 200,
      }),
      setDoc(doc(db, 'saas_notifications_outbox', 'notification-a'), {
        clienteId: TENANT_A,
        eventType: 'PAYMENT_RECEIVED',
        status: 'pending',
      }),
    ]);
  });
});

test.after(async () => {
  await environment.cleanup();
});

test('tenant A puede consultar únicamente pagos del tenant A', async () => {
  const snapshot = await assertSucceeds(getDocs(paymentsQuery(authenticatedDb('reader-a'), TENANT_A)));
  assert.equal(snapshot.size, 1);
  assert.equal(snapshot.docs[0].id, 'payment-a');
});

test('tenant A no puede consultar pagos del tenant B', async () => {
  await assertFails(getDocs(paymentsQuery(authenticatedDb('reader-a'), TENANT_B)));
});

test('query sin filtro clienteId es rechazada para usuario tenant', async () => {
  const db = authenticatedDb('reader-a');
  await assertFails(getDocs(query(
    collectionGroup(db, 'pagos'),
    where('estadoPagoRegistro', '==', 'activo')
  )));
});

test('query aislada por tenant, estado activo y rango de fecha funciona', async () => {
  const snapshot = await assertSucceeds(
    getDocs(activePaymentsQuery(authenticatedDb('reader-a'), TENANT_A))
  );
  assert.equal(snapshot.size, 1);
  assert.equal(snapshot.docs[0].data().monto, 100);
});

test('usuario sin acceso a ventas no puede consultar pagos', async () => {
  await assertFails(getDocs(paymentsQuery(authenticatedDb('without-sales-access'), TENANT_A)));
});

test('superadmin conserva el acceso definido por canReadVentas', async () => {
  const db = authenticatedDb('superadmin');
  const snapshot = await assertSucceeds(getDocs(collectionGroup(db, 'pagos')));
  assert.equal(snapshot.size, 2);
});

test('la regla collectionGroup no amplía permisos de escritura', async () => {
  const db = authenticatedDb('reader-a');
  const existing = doc(db, 'ventas', 'sale-a', 'pagos', 'payment-a');
  const newPayment = doc(collection(db, 'ventas', 'sale-a', 'pagos'));
  await assertFails(updateDoc(existing, { monto: 999 }));
  await assertFails(deleteDoc(existing));
  await assertFails(setDoc(newPayment, {
    clienteId: TENANT_A,
    estadoPagoRegistro: 'activo',
    fechaPago: '2026-08-20',
    monto: 50,
  }));
});

test('admin tenant no puede alterar plan, precio ni estado comercial SaaS', async () => {
  const ref = doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_A);
  await assertFails(updateDoc(ref, {planId: 'empresa', price: 1}));
  await assertFails(updateDoc(ref, {billingCurrency: 'ARS'}));
  await assertFails(updateDoc(ref, {currency: 'ARS'}));
  await assertFails(updateDoc(ref, {subscriptionStatus: 'active'}));
  await assertFails(updateDoc(ref, {maxUsers: 999, maxBranches: 999}));
  await assertFails(updateDoc(ref, {entitlements: {unlimitedUsers: true}}));
  await assertFails(updateDoc(ref, {pendingPlanId: 'start'}));
  await assertFails(updateDoc(ref, {pendingBillingCycle: 'annual'}));
  await assertFails(updateDoc(ref, {pendingPrice: 1}));
  await assertFails(updateDoc(ref, {pendingBillingCurrency: 'ARS'}));
  await assertFails(updateDoc(ref, {pendingPlanChangeType: 'downgrade'}));
});

const operationalCounters = ['ultimoNumeroVenta', 'ultimoNumeroRecibo', 'ultimoNumeroPedido', 'ultimoNumeroCotizacion'];
const sensitiveTenantFields = {
  saldoCuentaCorriente: 0, nextBillingDate: '2099-01-01',
  fechaProximoCargo: '2099-01-01', fechaVencimiento: '2099-01-01',
  billingProvider: 'hotmart', metodoCobro: 'manual', billingAnchorDate: '2099-01-01',
  diasGracia: 999, ultimoPeriodoFacturado: '2099-01', billingCycleSequence: 999,
  hotmartSubscriptionId: 'test-subscription', providerSubscriptionId: 'test-provider',
  hotmartSubscriberCode: 'test-subscriber', hotmartLastTransactionId: 'test-transaction',
  hotmartLastEventId: 'test-event', hotmartSubscriptionStatus: 'ACTIVE', hotmartCancelled: true,
  pendingPlanId: 'empresa', pendingBillingCycle: 'annual', pendingPrice: 1,
  pendingBillingCurrency: 'ARS', pendingPlanChangeType: 'downgrade', pendingUnknown: true,
  trialEndDate: '2099-01-01', trialStartDate: '2099-01-01',
  suspensionReason: 'test', fechaSuspension: '2099-01-01', motivoSuspension: 'test',
  fechaReactivacion: '2099-01-01', suspendidoAt: '2099-01-01',
  estadoCuenta: 'al_dia', fechaAlta: '2099-01-01', diasCiclo: 999,
  costoInstalacion: 0, ultimoPago: '2099-01-01', ultimoPagoMonto: 999, ultimoPagoMedio: 'test',
};

test('admin tenant conserva configuración y todos los contadores operativos', async () => {
  const ref = doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_A);
  for (const patch of [
    {nombreVisible: 'Comercio'}, {logoUrl: 'https://example.test/logo.png'},
    {moneda: 'ARS', localeMoneda: 'es-AR', timezone: 'America/Argentina/Buenos_Aires'},
    {productosBaseInicializados: true},
    ...operationalCounters.map(key => ({[key]: 1, updatedAt: new Date()})),
  ]) await assertSucceeds(updateDoc(ref, patch));
});

for (const [field, value] of Object.entries(sensitiveTenantFields)) {
  test(`admin tenant no puede crear, cambiar ni eliminar ${field}`, async () => {
    const ref = doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_A);
    await assertFails(updateDoc(ref, {[field]: value}));
    await environment.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'clientes-saas', TENANT_A), {[field]: 'existing-value'});
    });
    await assertFails(updateDoc(ref, {[field]: value}));
    await assertFails(updateDoc(ref, {[field]: deleteField()}));
  });
}

test('admin tenant rechaza campo desconocido y actualización mixta', async () => {
  const ref = doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_A);
  await assertFails(updateDoc(ref, {campoDesconocido: true}));
  await assertFails(updateDoc(ref, {nombreVisible: 'Comercio', saldoCuentaCorriente: 0}));
});

for (const planId of ['legacy', 'custom']) {
  test(`configuración operativa preserva campos adicionales de ${planId} aun suspendido`, async () => {
    const existing = {estado: 'suspendido', planId, plan: planId === 'legacy' ? 'Mensual' : 'Personalizado',
      billingCycle: 'monthly', price: 123, saldoCuentaCorriente: 456,
      campoHistorico: {conservar: true}, fechaProximoCargo: '2026-10-01'};
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'clientes-saas', TENANT_A), existing);
    });
    const ref = doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_A);
    const patch = {logoUrl: 'https://example.test/logo.png', moneda: 'ARS'};
    await assertSucceeds(updateDoc(ref, patch));
    assert.deepEqual((await getDoc(ref)).data(), {...existing, ...patch});
  });
}

test('usuario común conserva cada contador sólo con el permiso correspondiente', async () => {
  const permissions = [
    {ventas: {crear: true}}, {ventas: {editar: true}},
    {pedidos: {crear: true}}, {ventas: {crearCotizacion: true}},
  ];
  for (let index = 0; index < operationalCounters.length; index += 1) {
    await environment.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'usuarios', 'reader-a'), {permisos: permissions[index]});
    });
    const ref = doc(authenticatedDb('reader-a'), 'clientes-saas', TENANT_A);
    await assertSucceeds(updateDoc(ref, {[operationalCounters[index]]: index + 1, updatedAt: new Date()}));
    await assertFails(updateDoc(ref, {nombreVisible: 'No permitido'}));
    await assertFails(updateDoc(ref, {saldoCuentaCorriente: 0}));
    await assertFails(updateDoc(ref, {[operationalCounters[index]]: 99, nombreVisible: 'No permitido'}));
    await assertFails(updateDoc(doc(authenticatedDb('without-sales-access'), 'clientes-saas', TENANT_A),
      {[operationalCounters[index]]: 99}));
  }
});

test('superadmin conserva escritura financiera, contrato, suspensión y downgrade', async () => {
  await assertSucceeds(updateDoc(doc(authenticatedDb('superadmin'), 'clientes-saas', TENANT_A), {
    ...sensitiveTenantFields, planId: 'empresa', billingCycle: 'annual',
    billingCurrency: 'USD', currency: 'USD', price: 999,
    estado: 'suspendido', estadoSuscripcion: 'suspendida', subscriptionStatus: 'suspended',
    suspendidoManual: true, suspendidoPorSistema: false,
  }));
});

test('allow-list operativa no autoriza otro tenant, anónimo ni admin inactivo', async () => {
  await assertFails(updateDoc(doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_B), {nombreVisible: 'No'}));
  await assertFails(updateDoc(doc(environment.unauthenticatedContext().firestore(), 'clientes-saas', TENANT_A), {moneda: 'ARS'}));
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'usuarios', 'admin-a'), {activo: false});
  });
  await assertFails(updateDoc(doc(authenticatedDb('admin-a'), 'clientes-saas', TENANT_A), {logoUrl: 'https://example.test/logo.png'}));
});

test('altas y reactivaciones con cupo sólo pueden pasar por Functions', async () => {
  for (const uid of ['admin-a', 'superadmin']) {
    const db = authenticatedDb(uid);
    await assertFails(setDoc(doc(db, 'usuarios', `direct-${uid}`), {
      activo: true, clienteId: TENANT_A, rol: 'usuario', email: `${uid}@example.test`,
    }));
    await assertFails(updateDoc(doc(db, 'usuarios', 'inactive-a'), {activo: true}));
    await assertFails(setDoc(doc(db, 'sucursales', `direct-${uid}`), {
      activa: true, clienteId: TENANT_A, nombre: 'Directa',
    }));
    await assertFails(updateDoc(doc(db, 'sucursales', 'inactive-branch-a'), {activa: true}));
    await assertFails(setDoc(doc(db, 'invitaciones_usuarios', `direct-${uid}`), {
      clienteId: TENANT_A, nombre: 'Directa', email: `${uid}@example.test`,
      rol: 'usuario', estado: 'pendiente', token: `direct-${uid}`,
    }));
    await assertFails(updateDoc(doc(db, 'invitaciones_usuarios', 'pending-a'), {
      estado: 'cancelada',
    }));
  }
});

test('ediciones operativas sin consumo de cupo permanecen disponibles', async () => {
  const db = authenticatedDb('admin-a');
  await assertSucceeds(updateDoc(doc(db, 'usuarios', 'inactive-a'), {nombre: 'Nuevo nombre'}));
  await assertSucceeds(updateDoc(doc(db, 'sucursales', 'inactive-branch-a'), {nombre: 'Renombrada'}));
});

test('superadmin conserva administración de contrato SaaS', async () => {
  const ref = doc(authenticatedDb('superadmin'), 'clientes-saas', TENANT_A);
  await assertSucceeds(updateDoc(ref, {planId: 'start', price: 19000}));
  await assertSucceeds(updateDoc(ref, {
    pendingPlanId: 'start',
    pendingBillingCycle: 'monthly',
    pendingPrice: 19000,
    pendingBillingCurrency: 'ARS',
    pendingPlanChangeType: 'downgrade',
  }));
});

test('outbox SaaS sólo puede leerse desde frontend por superadmin', async () => {
  const path = ['saas_notifications_outbox', 'notification-a'];
  await assertFails(getDoc(doc(authenticatedDb('admin-a'), ...path)));
  await assertFails(getDoc(doc(authenticatedDb('reader-a'), ...path)));
  await assertSucceeds(getDoc(doc(authenticatedDb('superadmin'), ...path)));
});

test('ningún frontend puede crear ni cambiar estados de la outbox SaaS', async () => {
  const newData = {
    clienteId: TENANT_A,
    eventType: 'CLIENT_CREATED',
    status: 'sent',
  };
  for (const uid of ['admin-a', 'reader-a', 'superadmin']) {
    const db = authenticatedDb(uid);
    await assertFails(setDoc(doc(db, 'saas_notifications_outbox', `new-${uid}`),
      newData));
    await assertFails(updateDoc(doc(db, 'saas_notifications_outbox',
      'notification-a'), {status: 'sent'}));
    await assertFails(deleteDoc(doc(db, 'saas_notifications_outbox',
      'notification-a')));
  }
});
