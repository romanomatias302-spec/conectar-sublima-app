import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const MESSAGES = {
  SAAS_USER_LIMIT_REACHED: "Alcanzaste el límite de usuarios de tu plan.",
  SAAS_BRANCH_LIMIT_REACHED: "Alcanzaste el límite de sucursales de tu plan.",
  INVITATION_ALREADY_PENDING: "Ya existe una invitación pendiente para ese email.",
  INVITATION_NOT_VALID: "La invitación venció o ya no está disponible.",
};

function entitlementError(error, operation, data = {}) {
  const code = error?.details?.code || error?.message || "";
  const details = error?.details || {};
  const resource = code === "SAAS_USER_LIMIT_REACHED" ? "usuarios" : "sucursales";
  const action = code === "SAAS_USER_LIMIT_REACHED" ?
    "agregar más usuarios" : "crear o reactivar una sucursal";
  const reactivatingUser = operation === "cambiarEstadoUsuarioSaas" && data.activo === true;
  const reactivatingBranch = operation === "cambiarEstadoSucursalSaas" && data.activa === true;
  const limitMessage = ["SAAS_USER_LIMIT_REACHED", "SAAS_BRANCH_LIMIT_REACHED"].includes(code) && Number.isInteger(details.limit)
    ? reactivatingUser
      ? `No hay cupo disponible para reactivar este usuario. Tu plan ${details.planName} permite ${details.limit} usuarios activos. Liberá un cupo o mejorá tu plan.`
      : reactivatingBranch
        ? `No hay cupo disponible para reactivar esta sucursal. Tu plan ${details.planName} permite ${details.limit} sucursales activas. Liberá un cupo o mejorá tu plan.`
        : `Tu plan ${details.planName} incluye hasta ${details.limit} ${resource}. Actualizá tu plan para ${action}.`
    : "";
  const mapped = new Error(limitMessage || MESSAGES[code] || "No se pudo completar la operación.");
  mapped.code = code;
  mapped.details = error?.details || {};
  return mapped;
}

async function call(name, data) {
  try {
    const result = await httpsCallable(functions, name)(data);
    return result.data;
  } catch (error) {
    throw entitlementError(error, name, data);
  }
}

export const crearInvitacionSaas = (data) => call("crearInvitacionUsuarioSaas", data);
export const cancelarInvitacionSaas = (invitacionId) => call("cancelarInvitacionUsuarioSaas", {invitacionId});
export const aceptarInvitacionSaas = (data) => call("aceptarInvitacionUsuarioSaas", data);
export const cambiarEstadoUsuarioSaas = (data) => call("cambiarEstadoUsuarioSaas", data);
export const asegurarSucursalPrincipalSaas = (clienteId) => call("asegurarSucursalPrincipalSaas", {clienteId});
export const crearSucursalSaas = (data) => call("crearSucursalSaas", data);
export const cambiarEstadoSucursalSaas = (data) => call("cambiarEstadoSucursalSaas", data);
export const completarDowngradeSaas = (clienteId) => call("completarDowngradeSaas", {clienteId});
