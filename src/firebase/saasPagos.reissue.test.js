const mockDocs = new Map();
let mockTransactionQueue = Promise.resolve();

function mockKey(reference) {
  return `${reference.collection}/${reference.id}`;
}

function mockSnapshot(reference) {
  const data = mockDocs.get(mockKey(reference));
  return {
    id: reference.id,
    exists: () => Boolean(data),
    data: () => data,
  };
}

jest.mock("../firebase", () => ({db: {}}));
jest.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({name}),
  doc: (_db, collectionName, id) => ({collection: collectionName, id}),
  serverTimestamp: () => "server-time",
  where: (...args) => args,
  query: (collectionRef) => collectionRef,
  getDoc: async (reference) => mockSnapshot(reference),
  getDocs: async (collectionRef) => ({
    docs: [...mockDocs.entries()]
      .filter(([key]) => key.startsWith(`${collectionRef.name}/`))
      .map(([key, data]) => ({
        id: key.slice(key.indexOf("/") + 1),
        data: () => data,
      })),
  }),
  addDoc: async () => {
    throw new Error("No se esperaba addDoc");
  },
  updateDoc: async (reference, patch) => {
    const key = mockKey(reference);
    mockDocs.set(key, {...mockDocs.get(key), ...patch});
  },
  runTransaction: async (_db, callback) => {
    const run = mockTransactionQueue.then(() => callback({
      get: async (reference) => mockSnapshot(reference),
      set: (reference, data) => mockDocs.set(mockKey(reference), data),
      update: (reference, patch) => {
        const key = mockKey(reference);
        mockDocs.set(key, {...mockDocs.get(key), ...patch});
      },
    }));
    mockTransactionQueue = run.catch(() => {});
    return run;
  },
}));

import {registrarMovimientoSaas} from "./saasPagos";

const clientId = "tenant";
const baseChargeId = "cargo_tenant_2026-09";

function activeClient() {
  return {
    id: clientId,
    nombre: "Tenant",
    billingCycle: "monthly",
    billingCurrency: "ARS",
    nextBillingDate: "2026-10-15",
    fechaProximoCargo: "2026-10-15",
    fechaVencimiento: "2026-10-23",
    billingCycleSequence: 3,
    subscriptionStatus: "active",
    saldoCuentaCorriente: 0,
  };
}

function chargeInput(client = activeClient()) {
  return {
    clienteSaas: client,
    tipoMovimiento: "cargo",
    monto: 100,
    fechaPago: "2026-09-15",
    medioPago: "manual",
    concepto: "mensualidad",
    periodoFacturado: "2026-09",
  };
}

beforeEach(() => {
  mockDocs.clear();
  mockTransactionQueue = Promise.resolve();
  mockDocs.set(`clientes-saas/${clientId}`, activeClient());
});

test("cargo vigente bloquea una segunda emisión", async () => {
  mockDocs.set(`saas_pagos/${baseChargeId}`, {tipoMovimiento: "cargo", anulado: false});
  await expect(registrarMovimientoSaas(chargeInput())).rejects.toThrow(
    "Ya existe un cargo para este cliente y período."
  );
  expect(mockDocs.has(`saas_pagos/${baseChargeId}_r1`)).toBe(false);
});

test("cargo anulado permite reemitir con ID propio sin mover el calendario anterior", async () => {
  mockDocs.set(`saas_pagos/${baseChargeId}`, {tipoMovimiento: "cargo", anulado: true});
  await registrarMovimientoSaas(chargeInput());

  expect(mockDocs.get(`saas_pagos/${baseChargeId}`).anulado).toBe(true);
  expect(mockDocs.get(`saas_pagos/${baseChargeId}_r1`)).toMatchObject({
    anulado: false,
    idempotencyKey: `${baseChargeId}_r1`,
    reemisionDeCargoId: baseChargeId,
    currency: "ARS",
    correspondeAlCicloActual: false,
  });
  expect(mockDocs.get(`clientes-saas/${clientId}`)).toMatchObject({
    nextBillingDate: "2026-10-15",
    fechaProximoCargo: "2026-10-15",
    fechaVencimiento: "2026-10-23",
    billingCycleSequence: 3,
  });
});

test("varios anulados generan una secuencia sin sobrescribir historial", async () => {
  mockDocs.set(`saas_pagos/${baseChargeId}`, {
    tipoMovimiento: "cargo",
    anulado: true,
    ultimaReemisionCargoId: `${baseChargeId}_r1`,
    reemisionSecuencia: 1,
  });
  mockDocs.set(`saas_pagos/${baseChargeId}_r1`, {tipoMovimiento: "cargo", anulado: true});

  await registrarMovimientoSaas(chargeInput());

  expect(mockDocs.get(`saas_pagos/${baseChargeId}_r1`).anulado).toBe(true);
  expect(mockDocs.get(`saas_pagos/${baseChargeId}_r2`).reemisionDeCargoId).toBe(baseChargeId);
});

test("doble clic y concurrencia crean una sola reemisión vigente", async () => {
  mockDocs.set(`saas_pagos/${baseChargeId}`, {tipoMovimiento: "cargo", anulado: true});

  const results = await Promise.allSettled([
    registrarMovimientoSaas(chargeInput()),
    registrarMovimientoSaas(chargeInput()),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect([...mockDocs.keys()].filter((key) => key.startsWith(`saas_pagos/${baseChargeId}_r`)))
    .toEqual([`saas_pagos/${baseChargeId}_r1`]);
});
