import {canAccessWithProfile} from "./saasAccess";

test("un usuario inactivo o sin estado activo no puede acceder", () => {
  expect(canAccessWithProfile({activo: false})).toBe(false);
  expect(canAccessWithProfile({})).toBe(false);
});

test("un usuario reactivado vuelve a poder acceder", () => {
  expect(canAccessWithProfile({activo: true})).toBe(true);
});
