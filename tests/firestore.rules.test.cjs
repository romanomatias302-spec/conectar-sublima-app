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
  doc,
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
