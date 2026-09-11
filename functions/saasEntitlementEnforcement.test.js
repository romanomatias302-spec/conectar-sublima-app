"use strict";
/* eslint-disable require-jsdoc, max-len, curly, brace-style, block-spacing */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertCapacity,
  calculateEntitlementUsage,
  canDowngradeToPlan,
  createSaasEntitlementService,
  invitationReservesSeat,
} = require("./saasEntitlementEnforcement");

const now = new Date("2026-09-10T12:00:00Z");
const pending = (overrides = {}) => ({
  estado: "pendiente", email: "pending@example.com",
  expiraAt: new Date("2026-09-11T12:00:00Z"), ...overrides,
});

for (const [planId, users, branches] of [
  ["start", 2, 1], ["profesional", 5, 2], ["profesional_plus", 10, 5],
]) test(`${planId} rechaza el siguiente recurso al alcanzar sus límites`, () => {
  const usage = calculateEntitlementUsage({
    client: {planId}, users: Array(users).fill({activo: true}),
    branches: Array(branches).fill({activa: true}), now,
  });
  assert.throws(() => assertCapacity(usage, "users"), {code: "SAAS_USER_LIMIT_REACHED"});
  assert.throws(() => assertCapacity(usage, "branches"), {code: "SAAS_BRANCH_LIMIT_REACHED"});
});

for (const planId of ["empresa", "legacy", "trial"]) test(`${planId} no impone límites`, () => {
  const usage = calculateEntitlementUsage({
    client: {planId}, users: Array(50).fill({activo: true}),
    branches: Array(50).fill({activa: true}), now,
  });
  assert.doesNotThrow(() => assertCapacity(usage, "users"));
  assert.doesNotThrow(() => assertCapacity(usage, "branches"));
});

test("invitación válida reserva; vencida, cancelada o aceptada no duplica", () => {
  assert.equal(invitationReservesSeat(pending(), now), true);
  assert.equal(invitationReservesSeat(pending({expiraAt: new Date("2026-09-09")}), now), false);
  assert.equal(invitationReservesSeat(pending({estado: "cancelada"}), now), false);
  const usage = calculateEntitlementUsage({
    client: {planId: "start"}, users: [{activo: true, email: "pending@example.com"}],
    invitations: [pending()], now,
  });
  assert.equal(usage.usedUserSeats, 1);
});

test("inactivos no cuentan; over-limit se conserva pero bloquea nuevas altas", () => {
  const usage = calculateEntitlementUsage({
    client: {planId: "start"},
    users: [{activo: true}, {activo: true}, {activo: true}, {activo: false}],
    branches: [{activa: true}, {activa: false}], now,
  });
  assert.equal(usage.activeUsers, 3);
  assert.equal(usage.activeBranches, 1);
  assert.throws(() => assertCapacity(usage, "users"), {code: "SAAS_USER_LIMIT_REACHED"});
});

test("helper de downgrade futuro valida ambos recursos", () => {
  assert.equal(canDowngradeToPlan({currentUsers: 3, currentBranches: 1}, "start").allowed, false);
  assert.equal(canDowngradeToPlan({currentUsers: 2, currentBranches: 1}, "start").allowed, true);
});

function fakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed));
  let sequence = 0;
  let queue = Promise.resolve();
  const snapshot = (path) => ({
    id: path.split("/").at(-1), exists: docs.has(path), data: () => docs.get(path),
  });
  const query = (name, filters = []) => ({
    _query: true, name, filters,
    where(field, operator, value) {
      return query(name, [...filters, [field, operator, value]]);
    },
  });
  const document = (path) => ({id: path.split("/").at(-1), path});
  const db = {
    collection(name) {
      return {
        doc(id = `auto-${++sequence}`) { return document(`${name}/${id}`); },
        where(field, operator, value) { return query(name, [[field, operator, value]]); },
      };
    },
    runTransaction(callback) {
      const run = queue.then(() => callback({
        async get(reference) {
          if (!reference._query) return snapshot(reference.path);
          const rows = [...docs.entries()].filter(([path, data]) =>
            path.startsWith(`${reference.name}/`) && reference.filters.every(([field, operator, value]) => operator === "==" && data[field] === value));
          return {docs: rows.map(([path]) => snapshot(path))};
        },
        create(reference, data) { if (docs.has(reference.path)) throw new Error("exists"); docs.set(reference.path, data); },
        set(reference, data) { docs.set(reference.path, {...(docs.get(reference.path) || {}), ...data}); },
        update(reference, data) { docs.set(reference.path, {...docs.get(reference.path), ...data}); },
      }));
      queue = run.catch(() => {});
      return run;
    },
  };
  return {db, docs};
}

function service(seed) {
  const fake = fakeFirestore(seed);
  return {
    ...fake,
    service: createSaasEntitlementService({
      db: fake.db,
      FieldValue: {serverTimestamp: () => "server-time"},
      Timestamp: {fromDate: (date) => date},
      now: () => now,
    }),
  };
}

test("dos invitaciones concurrentes no superan el límite", async () => {
  const {service: enforcement} = service({
    "clientes-saas/tenant": {planId: "start"},
    "usuarios/admin": {clienteId: "tenant", activo: true, rol: "admin", email: "admin@example.com"},
  });
  const results = await Promise.allSettled([
    enforcement.createInvitation({tenantId: "tenant", name: "A", email: "a@example.com"}),
    enforcement.createInvitation({tenantId: "tenant", name: "B", email: "b@example.com"}),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "SAAS_USER_LIMIT_REACHED");
});

test("dos sucursales concurrentes y reactivación respetan el límite", async () => {
  const first = service({"clientes-saas/tenant": {planId: "start"}});
  const results = await Promise.allSettled([
    first.service.createBranch({tenantId: "tenant", name: "A"}),
    first.service.createBranch({tenantId: "tenant", name: "B"}),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);

  const second = service({
    "clientes-saas/tenant": {planId: "start"},
    "sucursales/active": {clienteId: "tenant", activa: true},
    "sucursales/inactive": {clienteId: "tenant", activa: false},
  });
  await assert.rejects(
      second.service.setBranchActive({tenantId: "tenant", branchId: "inactive", active: true}),
      {code: "SAAS_BRANCH_LIMIT_REACHED"},
  );
});

test("recursos de otro tenant no consumen cupo ni pueden modificarse", async () => {
  const {service: enforcement} = service({
    "clientes-saas/tenant-a": {planId: "start"},
    "clientes-saas/tenant-b": {planId: "start"},
    "usuarios/admin-a": {
      clienteId: "tenant-a", activo: true, rol: "admin", email: "a@example.com",
    },
    "usuarios/user-b": {
      clienteId: "tenant-b", activo: true, rol: "usuario", email: "b@example.com",
    },
    "sucursales/branch-b": {clienteId: "tenant-b", activa: true},
  });
  await assert.doesNotReject(() => enforcement.createInvitation({
    tenantId: "tenant-a", name: "Nuevo", email: "new@example.com",
  }));
  await assert.rejects(() => enforcement.setUserActive({
    tenantId: "tenant-a", uid: "user-b", active: false,
  }), {code: "USER_NOT_FOUND"});
  await assert.rejects(() => enforcement.setBranchActive({
    tenantId: "tenant-a", branchId: "branch-b", active: false,
  }), {code: "BRANCH_NOT_FOUND"});
});

test("desactivar recursos y cancelar invitaciones sigue permitido sobre límite", async () => {
  const {service: enforcement, docs} = service({
    "clientes-saas/tenant": {planId: "start"},
    "usuarios/a": {clienteId: "tenant", activo: true, rol: "admin", email: "a@example.com"},
    "usuarios/b": {clienteId: "tenant", activo: true, rol: "usuario", email: "b@example.com"},
    "usuarios/c": {clienteId: "tenant", activo: true, rol: "usuario", email: "c@example.com"},
    "sucursales/principal": {clienteId: "tenant", activa: true, esPrincipal: true},
    "sucursales/extra": {clienteId: "tenant", activa: true, esPrincipal: false},
    "invitaciones_usuarios/pending": {
      clienteId: "tenant", estado: "pendiente", email: "new@example.com",
      expiraAt: new Date("2026-09-11T12:00:00Z"),
    },
  });
  await assert.doesNotReject(() => enforcement.setUserActive({
    tenantId: "tenant", uid: "c", active: false,
  }));
  await assert.doesNotReject(() => enforcement.setBranchActive({
    tenantId: "tenant", branchId: "extra", active: false,
  }));
  await assert.doesNotReject(() => enforcement.cancelInvitation({
    invitationId: "pending",
  }));
  assert.equal(docs.get("usuarios/c").activo, false);
  assert.equal(docs.get("sucursales/extra").activa, false);
  assert.equal(docs.get("invitaciones_usuarios/pending").estado, "cancelada");
});

test("aceptar invitación convierte la reserva sin duplicar un usuario activo", async () => {
  const base = {
    "clientes-saas/tenant": {planId: "start"},
    "invitaciones_usuarios/pending": {
      clienteId: "tenant", estado: "pendiente", rol: "usuario",
      nombre: "Nuevo", email: "new@example.com",
      expiraAt: new Date("2026-09-11T12:00:00Z"),
    },
  };
  const first = service(base);
  await assert.doesNotReject(() => first.service.acceptInvitation({
    invitationId: "pending", uid: "new-user",
    authEmail: "new@example.com", displayName: "Nuevo",
  }));
  assert.equal(first.docs.get("usuarios/new-user").activo, true);
  assert.equal(first.docs.get("invitaciones_usuarios/pending").estado, "usada");

  const second = service({
    ...base,
    "usuarios/existing": {
      clienteId: "tenant", activo: true, rol: "usuario", email: "new@example.com",
    },
  });
  await assert.rejects(() => second.service.acceptInvitation({
    invitationId: "pending", uid: "another-user",
    authEmail: "new@example.com", displayName: "Otro",
  }), {code: "USER_ALREADY_ACTIVE"});
});
