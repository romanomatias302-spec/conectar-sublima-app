// Comparación offline contra el snapshot local auditado; no es una prueba
// del runtime productivo. No importa ni modifica Functions de esta rama.
const test = require("node:test");
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const snapshot = "c7a8a24b623f216d7f7b74fc436f37d2cbdc500e";
function loadSnapshot(file, dependencies = {}) {
  const source = execFileSync("git", ["show", `${snapshot}:functions/${file}`], {cwd: root, encoding: "utf8"});
  const module = {exports: {}};
  new Function("require", "module", "exports", source)(
    (name) => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}
const catalog = loadSnapshot("saasPlanCatalog.js");
const enforcement = loadSnapshot("saasEntitlementEnforcement.js", {"./saasPlanCatalog": catalog});
const helperSource = fs.readFileSync(path.join(root, "src/modulos/superadmin/clienteSaasPlanCompatibility.js"), "utf8");
const normalize = new Function(helperSource.replace("export function", "function") + "\nreturn camposPlanParaEnforcement;")();
const usage = (client, extra = {}) => enforcement.calculateEntitlementUsage({client, ...extra});

test("reproduce trial sin ID: plan desconocido, no límite numérico cero", () => {
  const result = usage({planNombre: "Prueba gratis 7 días", estadoSuscripcion: "prueba"});
  assert.equal(result.entitlements.isKnownPlan, false);
  assert.equal(result.entitlements.maxUsers, null);
  assert.throws(() => enforcement.assertCapacity(result, "users"), {code: "SAAS_USER_LIMIT_REACHED"});
});
for (const [name, limit] of [["Prueba gratis 7 días", null], ["Start", 2], ["Profesional", 5], ["Profesional Plus", 10], ["Empresa", null]]) {
  test(`${name}: capacidad correcta después del guardado compatible`, () => {
    const client = {planNombre: name, ...normalize(name, {planId: "start"})};
    const result = usage(client);
    assert.equal(result.entitlements.maxUsers, limit);
    assert.equal(result.entitlements.unlimitedUsers, limit === null);
    assert.doesNotThrow(() => enforcement.assertCapacity(result, "users"));
    if (limit !== null) {
      const full = usage(client, {users: Array.from({length: limit}, () => ({activo: true, rol: "admin"}))});
      assert.throws(() => enforcement.assertCapacity(full, "users"), {code: "SAAS_USER_LIMIT_REACHED"});
    }
  });
}
test("legacy conserva fallback y recursos inactivos/cancelados no consumen cupo", () => {
  const result = usage({planNombre: "Mensual", ...normalize("Mensual", {planNombre: "Mensual"})}, {
    users: [{activo: false}, {activo: true, rol: "superadmin"}],
    invitations: [{estado: "cancelada", expiraAt: new Date(Date.now() + 86400000)}],
  });
  assert.equal(result.entitlements.planId, "legacy");
  assert.equal(result.usedUserSeats, 0);
});
test("tenant trial nuevo puede crear efectivamente su primera invitación", async () => {
  const rows = {"clientes-saas/new": {planNombre: "Prueba gratis 7 días", ...normalize("Prueba gratis 7 días")}};
  const ref = (collection, id) => ({key: `${collection}/${id}`});
  const db = {
    collection: (name) => ({doc: (id) => ref(name, id), where: () => ({where() {return this;}, query: true})}),
    runTransaction: async (callback) => callback({
      get: async (r) => r.query ? {docs: []} : {exists: Boolean(rows[r.key]), data: () => rows[r.key]},
      set: (r, data) => {rows[r.key] = data;},
      create: (r, data) => {assert.equal(rows[r.key], undefined); rows[r.key] = data;},
    }),
  };
  const service = enforcement.createSaasEntitlementService({db,
    FieldValue: {serverTimestamp: () => new Date()}, Timestamp: {fromDate: (date) => date}});
  const result = await service.createInvitation({tenantId: "new", name: "Admin", email: "admin@example.com", role: "admin"});
  assert.equal(rows[`invitaciones_usuarios/${result.token}`].estado, "pendiente");
  assert.equal(result.usage.usedUserSeats, 1);
});
