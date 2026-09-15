import {
  buildBranchCapacityChanges,
  buildUserCapacityChanges,
  canConfirmCapacitySelection,
  initialBranchSelection,
  initialUserSeatSelection,
  invitationSeatId,
  userSeatId,
} from "./saasOverLimitSelection";

const future = "2099-01-01T00:00:00.000Z";

test("el estado inicial conserva todos los recursos y no selecciona automáticamente cuáles quitar", () => {
  const users = [{uid: "owner", activo: true}, {uid: "two", activo: true}];
  const invitations = [{id: "invite", estado: "pendiente", expiraAt: future}];
  const selected = initialUserSeatSelection(users, invitations);
  expect(selected).toEqual([userSeatId("owner"), userSeatId("two"), invitationSeatId("invite")]);
  expect(buildUserCapacityChanges({users, invitations, selectedIds: selected, currentUid: "owner"}))
    .toEqual({deactivateUserIds: [], cancelInvitationIds: []});
});

test("el cliente elige usuarios e invitaciones a conservar sin borrar datos", () => {
  const users = [{uid: "owner", activo: true}, {uid: "two", activo: true}, {uid: "old", activo: false}];
  const invitations = [{id: "invite", estado: "pendiente", expiraAt: future}];
  expect(buildUserCapacityChanges({
    users, invitations, selectedIds: [userSeatId("owner")], currentUid: "owner",
  })).toEqual({deactivateUserIds: ["two"], cancelInvitationIds: ["invite"]});
});

test("el usuario actual debe mantenerse activo", () => {
  expect(() => buildUserCapacityChanges({
    users: [{uid: "owner", activo: true}], selectedIds: [], currentUid: "owner",
  })).toThrow("CURRENT_USER_MUST_REMAIN_ACTIVE");
});

test("sucursales se conservan por defecto y sólo se desactivan las no seleccionadas", () => {
  const branches = [
    {firebaseId: "principal", activa: true, esPrincipal: true},
    {firebaseId: "two", activa: true},
    {firebaseId: "old", activa: false},
  ];
  expect(initialBranchSelection(branches)).toEqual(["principal", "two"]);
  expect(buildBranchCapacityChanges({branches, selectedIds: ["principal"]})).toEqual(["two"]);
});

test("la sucursal principal debe conservarse activa", () => {
  expect(() => buildBranchCapacityChanges({
    branches: [{firebaseId: "principal", activa: true, esPrincipal: true}], selectedIds: [],
  })).toThrow("PRINCIPAL_BRANCH_MUST_REMAIN_ACTIVE");
});

test("una selección sobre el límite no puede confirmarse y una válida sí", () => {
  expect(canConfirmCapacitySelection(6, 5)).toBe(false);
  expect(canConfirmCapacitySelection(5, 5)).toBe(true);
});

test("la selección puede reajustarse sin eliminar usuarios ni sucursales", () => {
  const users = [{uid: "a", activo: true}, {uid: "b", activo: true}, {uid: "c", activo: true}];
  expect(buildUserCapacityChanges({users, selectedIds: [userSeatId("a"), userSeatId("b")]}).deactivateUserIds).toEqual(["c"]);
  expect(buildUserCapacityChanges({users, selectedIds: [userSeatId("a"), userSeatId("c")]}).deactivateUserIds).toEqual(["b"]);
  const branches = [{id: "main", activa: true, esPrincipal: true}, {id: "north", activa: true}, {id: "south", activa: true}];
  expect(buildBranchCapacityChanges({branches, selectedIds: ["main", "south"]})).toEqual(["north"]);
  expect(branches).toHaveLength(3);
});
