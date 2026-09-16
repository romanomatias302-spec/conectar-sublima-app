import {httpsCallable} from "firebase/functions";
import {cambiarEstadoSucursalSaas, cambiarEstadoUsuarioSaas} from "./saasEntitlements";

jest.mock("../firebase", () => ({functions: {}}));
jest.mock("firebase/functions", () => ({httpsCallable: jest.fn()}));

test.each([
  [cambiarEstadoUsuarioSaas, {clienteId: "tenant", uid: "u", activo: true}, "SAAS_USER_LIMIT_REACHED", "usuarios", 5],
  [cambiarEstadoSucursalSaas, {clienteId: "tenant", sucursalId: "s", activa: true}, "SAAS_BRANCH_LIMIT_REACHED", "sucursales", 2],
])("muestra un error operativo al rechazar una reactivación", async (operation, payload, code, resources, limit) => {
  httpsCallable.mockReturnValue(jest.fn().mockRejectedValue({details: {code, limit, planName: "Profesional"}}));
  await expect(operation(payload)).rejects.toThrow(new RegExp(`permite ${limit} ${resources}`, "i"));
});
