import {
  calculateSaasResourceUsage,
  canDowngradeToPlan,
  formatPlanUsage,
  invitationReservesUserSeat,
} from "./saasEntitlementUsage";

const now = new Date("2026-09-10T12:00:00Z");
const invitation = (overrides = {}) => ({
  estado: "pendiente", email: "new@example.com",
  expiraAt: new Date("2026-09-11T12:00:00Z"), ...overrides,
});

test.each([
  ["start", 2, 1], ["profesional", 5, 2], ["profesional_plus", 10, 5],
])("%s aplica límites de usuarios y sucursales", (planId, maxUsers, maxBranches) => {
  const users = Array.from({length: maxUsers}, (_, index) => ({activo: true, email: `u${index}@example.com`}));
  const branches = Array.from({length: maxBranches}, () => ({activa: true}));
  const usage = calculateSaasResourceUsage({client: {planId}, users, branches, now});
  expect(usage.canAddUser).toBe(false);
  expect(usage.canAddBranch).toBe(false);
});

test.each(["empresa", "legacy", "trial"])("%s permanece ilimitado", (planId) => {
  const usage = calculateSaasResourceUsage({
    client: {planId}, users: Array(20).fill({activo: true}),
    branches: Array(20).fill({activa: true}), now,
  });
  expect(usage.canAddUser).toBe(true);
  expect(usage.canAddBranch).toBe(true);
  expect(formatPlanUsage(20, null, true)).toContain("Ilimitados");
});

test("invitación válida reserva cupo; vencida o aceptada no cuenta", () => {
  expect(invitationReservesUserSeat(invitation(), now)).toBe(true);
  expect(invitationReservesUserSeat(invitation({expiraAt: new Date("2026-09-09")}), now)).toBe(false);
  expect(invitationReservesUserSeat(invitation({estado: "usada"}), now)).toBe(false);
  const usage = calculateSaasResourceUsage({
    client: {planId: "start"}, users: [{activo: true, email: "new@example.com"}],
    invitations: [invitation()], now,
  });
  expect(usage.usedUsers).toBe(1);
});

test("inactivos no cuentan y over-limit conserva uso pero bloquea altas", () => {
  const usage = calculateSaasResourceUsage({
    client: {planId: "start"},
    users: [{activo: true}, {activo: true}, {activo: true}, {activo: false}],
    branches: [{activa: true}, {activa: false}], now,
  });
  expect(usage.usedUsers).toBe(3);
  expect(usage.usersOverLimit).toBe(true);
  expect(usage.canAddUser).toBe(false);
  expect(usage.activeBranches).toBe(1);
});

test("downgrade futuro exige uso compatible", () => {
  expect(canDowngradeToPlan({usedUsers: 3, activeBranches: 1}, "start")).toBe(false);
  expect(canDowngradeToPlan({usedUsers: 2, activeBranches: 1}, "start")).toBe(true);
});

test("legacy over-limit conserva recursos y al pasar a Start bloquea nuevas altas", () => {
  const users = Array.from({length: 8}, (_, index) => ({
    activo: true, email: `legacy-${index}@example.com`,
  }));
  const branches = Array.from({length: 4}, () => ({activa: true}));
  const legacyUsage = calculateSaasResourceUsage({
    client: {planId: "legacy"}, users, branches, now,
  });
  const startUsage = calculateSaasResourceUsage({
    client: {planId: "start"}, users, branches, now,
  });
  expect(legacyUsage.canAddUser).toBe(true);
  expect(startUsage.usedUsers).toBe(8);
  expect(startUsage.activeBranches).toBe(4);
  expect(startUsage.usersOverLimit).toBe(true);
  expect(startUsage.branchesOverLimit).toBe(true);
  expect(startUsage.canAddUser).toBe(false);
  expect(startUsage.canAddBranch).toBe(false);
});
