import {invitationReservesUserSeat} from "./saasEntitlementUsage";

export const userSeatId = (uid) => `user:${uid}`;
export const invitationSeatId = (id) => `invitation:${id}`;
export const canConfirmCapacitySelection = (selectedCount, limit) =>
  Number.isInteger(limit) && selectedCount <= limit;

export function initialUserSeatSelection(users = [], invitations = []) {
  return [
    ...users.filter((user) => user.activo === true && user.rol !== "superadmin")
      .map((user) => userSeatId(user.uid)),
    ...invitations.filter((invitation) => invitationReservesUserSeat(invitation))
      .map((invitation) => invitationSeatId(invitation.id)),
  ];
}

export function buildUserCapacityChanges({users = [], invitations = [], selectedIds = [], currentUid = ""}) {
  const selected = new Set(selectedIds);
  if (currentUid && !selected.has(userSeatId(currentUid))) {
    throw new Error("CURRENT_USER_MUST_REMAIN_ACTIVE");
  }
  return {
    deactivateUserIds: users
      .filter((user) => user.activo === true && user.rol !== "superadmin" && !selected.has(userSeatId(user.uid)))
      .map((user) => user.uid),
    cancelInvitationIds: invitations
      .filter((invitation) => invitationReservesUserSeat(invitation) && !selected.has(invitationSeatId(invitation.id)))
      .map((invitation) => invitation.id),
  };
}

export function initialBranchSelection(branches = []) {
  return branches.filter((branch) => branch.activa !== false).map((branch) => branch.firebaseId || branch.id);
}

export function buildBranchCapacityChanges({branches = [], selectedIds = []}) {
  const selected = new Set(selectedIds);
  const principalDeselected = branches.some((branch) =>
    branch.activa !== false && branch.esPrincipal === true && !selected.has(branch.firebaseId || branch.id));
  if (principalDeselected) throw new Error("PRINCIPAL_BRANCH_MUST_REMAIN_ACTIVE");
  return branches
    .filter((branch) => branch.activa !== false && !branch.esPrincipal && !selected.has(branch.firebaseId || branch.id))
    .map((branch) => branch.firebaseId || branch.id);
}
