import {resolveSaasEntitlements} from "./saasPlans";

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function invitationReservesUserSeat(invitation = {}, now = new Date(), activeEmails = new Set()) {
  const expiration = dateValue(invitation.expiraAt);
  const email = String(invitation.email || "").trim().toLowerCase();
  return invitation.estado === "pendiente" && Boolean(expiration) &&
    expiration.getTime() > now.getTime() && !activeEmails.has(email);
}

export function calculateSaasResourceUsage({client = {}, users = [], invitations = [], branches = [], now = new Date()}) {
  const entitlements = resolveSaasEntitlements(client);
  const activeUsers = users.filter((user) => user.activo === true && user.rol !== "superadmin");
  const activeEmails = new Set(activeUsers.map((user) => String(user.email || "").trim().toLowerCase()).filter(Boolean));
  const pendingInvitations = invitations.filter((invitation) =>
    invitationReservesUserSeat(invitation, now, activeEmails));
  const activeBranches = branches.filter((branch) => branch.activa !== false);
  const usedUsers = activeUsers.length + pendingInvitations.length;
  return {
    entitlements,
    activeUsers: activeUsers.length,
    pendingInvitations: pendingInvitations.length,
    usedUsers,
    activeBranches: activeBranches.length,
    canAddUser: entitlements.unlimitedUsers ||
      (Number.isInteger(entitlements.maxUsers) && usedUsers < entitlements.maxUsers),
    canAddBranch: entitlements.unlimitedBranches ||
      (Number.isInteger(entitlements.maxBranches) && activeBranches.length < entitlements.maxBranches),
    usersOverLimit: !entitlements.unlimitedUsers && Number.isInteger(entitlements.maxUsers) && usedUsers > entitlements.maxUsers,
    branchesOverLimit: !entitlements.unlimitedBranches && Number.isInteger(entitlements.maxBranches) && activeBranches.length > entitlements.maxBranches,
  };
}

export function formatPlanUsage(used, limit, unlimited) {
  return unlimited ? `${used} utilizados · Ilimitados` : `${used} de ${limit} utilizados`;
}

export function planLimitMessage(entitlements, resource, overLimit = false) {
  const noun = resource === "users" ? "usuarios" : "sucursales";
  const verb = resource === "users" ? "agregar nuevos usuarios" : "crear o reactivar sucursales";
  if (overLimit) return `Superaste el límite del plan actual. No podés ${verb}.`;
  const limit = resource === "users" ? entitlements.maxUsers : entitlements.maxBranches;
  return `Tu plan ${entitlements.planName} incluye hasta ${limit} ${noun}. Actualizá tu plan para ${verb}.`;
}

export function canDowngradeToPlan(usage, targetPlanId) {
  const target = resolveSaasEntitlements({planId: targetPlanId});
  if (!target.isKnownPlan) return false;
  return (target.unlimitedUsers || usage.usedUsers <= target.maxUsers) &&
    (target.unlimitedBranches || usage.activeBranches <= target.maxBranches);
}
