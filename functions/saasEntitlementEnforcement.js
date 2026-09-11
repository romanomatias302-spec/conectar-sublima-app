"use strict";
/* eslint-disable require-jsdoc, max-len */

const crypto = require("node:crypto");
const {resolveSaasEntitlements} = require("./saasPlanCatalog");

const USER_LIMIT_CODE = "SAAS_USER_LIMIT_REACHED";
const BRANCH_LIMIT_CODE = "SAAS_BRANCH_LIMIT_REACHED";
const DEFAULT_INVITED_PERMISSIONS = Object.freeze({
  inicio: {ver: true, verPedidos: true, verClientes: false, verIngresos: false, verProduccion: true, verAtrasados: true, verGrafico: true, verCuelloBotella: true},
  clientes: {ver: false, crear: false, editar: false, eliminar: false},
  pedidos: {ver: true, crear: false, editar: false, eliminar: false},
  produccion: {ver: true, mover: true, editarDetalle: true, asignarUsuario: false},
  ventas: {ver: false, crear: false, editar: false, eliminar: false},
  movimientos: {ver: false},
  configuracion: {ver: false},
});

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function invitationReservesSeat(invitation = {}, now = new Date(), activeEmails = new Set()) {
  if (invitation.estado !== "pendiente") return false;
  const expiration = toDate(invitation.expiraAt);
  if (!expiration || expiration.getTime() <= now.getTime()) return false;
  return !activeEmails.has(normalizedEmail(invitation.email));
}

function calculateEntitlementUsage({client = {}, users = [], invitations = [], branches = [], now = new Date()}) {
  const entitlements = resolveSaasEntitlements(client);
  const activeUsers = users.filter((user) =>
    user.activo === true && String(user.rol || "").toLowerCase() !== "superadmin");
  const activeEmails = new Set(activeUsers.map((user) => normalizedEmail(user.email)).filter(Boolean));
  const pendingInvitations = invitations.filter((invitation) =>
    invitationReservesSeat(invitation, now, activeEmails));
  const activeBranches = branches.filter((branch) => branch.activa !== false);
  return {
    entitlements,
    activeUsers: activeUsers.length,
    pendingInvitations: pendingInvitations.length,
    usedUserSeats: activeUsers.length + pendingInvitations.length,
    activeBranches: activeBranches.length,
  };
}

function assertCapacity(usage, resource) {
  const users = resource === "users";
  const unlimited = users ? usage.entitlements.unlimitedUsers : usage.entitlements.unlimitedBranches;
  const limit = users ? usage.entitlements.maxUsers : usage.entitlements.maxBranches;
  const used = users ? usage.usedUserSeats : usage.activeBranches;
  if (unlimited) return;
  if (!usage.entitlements.isKnownPlan || !Number.isInteger(limit) || used >= limit) {
    const error = new Error(users ? USER_LIMIT_CODE : BRANCH_LIMIT_CODE);
    error.code = users ? USER_LIMIT_CODE : BRANCH_LIMIT_CODE;
    error.details = {used, limit, planName: usage.entitlements.planName};
    throw error;
  }
}

function canDowngradeToPlan({currentUsers = 0, pendingInvitations = 0, currentBranches = 0}, targetPlan) {
  const entitlements = resolveSaasEntitlements({planId: targetPlan});
  if (!entitlements.isKnownPlan) return {allowed: false, reason: "UNKNOWN_PLAN"};
  const users = Number(currentUsers) + Number(pendingInvitations);
  const userExceeded = !entitlements.unlimitedUsers && users > entitlements.maxUsers;
  const branchesExceeded = !entitlements.unlimitedBranches && Number(currentBranches) > entitlements.maxBranches;
  return {allowed: !userExceeded && !branchesExceeded, userExceeded, branchesExceeded, entitlements};
}

function createSaasEntitlementService({db, FieldValue, Timestamp, now = () => new Date()}) {
  const clients = db.collection("clientes-saas");
  const users = db.collection("usuarios");
  const invitations = db.collection("invitaciones_usuarios");
  const branches = db.collection("sucursales");
  const locks = db.collection("saas_entitlement_locks");

  async function transactionContext(transaction, tenantId) {
    const lockRef = locks.doc(tenantId);
    const clientRef = clients.doc(tenantId);
    const [lockSnapshot, clientSnapshot, usersSnapshot, invitationsSnapshot, branchesSnapshot] = await Promise.all([
      transaction.get(lockRef),
      transaction.get(clientRef),
      transaction.get(users.where("clienteId", "==", tenantId)),
      transaction.get(invitations.where("clienteId", "==", tenantId).where("estado", "==", "pendiente")),
      transaction.get(branches.where("clienteId", "==", tenantId)),
    ]);
    if (!clientSnapshot.exists) {
      const error = new Error("SAAS_CLIENT_NOT_FOUND");
      error.code = "SAAS_CLIENT_NOT_FOUND";
      throw error;
    }
    const mapDocs = (snapshot) => snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    const userRows = mapDocs(usersSnapshot);
    const invitationRows = mapDocs(invitationsSnapshot);
    const branchRows = mapDocs(branchesSnapshot);
    return {
      usage: calculateEntitlementUsage({
        client: {id: clientSnapshot.id, ...clientSnapshot.data()},
        users: userRows,
        invitations: invitationRows,
        branches: branchRows,
        now: now(),
      }),
      users: userRows,
      invitations: invitationRows,
      branches: branchRows,
      client: {id: clientSnapshot.id, ...clientSnapshot.data()},
      touchLock() {
        transaction.set(lockRef, {
          clienteId: tenantId,
          revision: Number(lockSnapshot.data()?.revision || 0) + 1,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      },
    };
  }

  return {
    async createInvitation({tenantId, name, email, role, createdBy}) {
      const token = crypto.randomBytes(32).toString("hex");
      const ref = invitations.doc(token);
      return db.runTransaction(async (transaction) => {
        const context = await transactionContext(transaction, tenantId);
        assertCapacity(context.usage, "users");
        const emailValue = normalizedEmail(email);
        if (context.users.some((user) => user.activo === true &&
            normalizedEmail(user.email) === emailValue)) {
          const error = new Error("USER_ALREADY_ACTIVE");
          error.code = "USER_ALREADY_ACTIVE";
          throw error;
        }
        const validDuplicate = context.invitations.some((invitation) =>
          normalizedEmail(invitation.email) === emailValue &&
          invitationReservesSeat(invitation, now(), new Set()));
        if (validDuplicate) {
          const error = new Error("INVITATION_ALREADY_PENDING");
          error.code = "INVITATION_ALREADY_PENDING";
          throw error;
        }
        context.touchLock();
        const expiration = new Date(now().getTime() + 7 * 86400000);
        transaction.create(ref, {
          clienteId: tenantId, nombre: String(name || "").trim(), email: emailValue,
          rol: ["admin", "usuario"].includes(role) ? role : "usuario",
          token, estado: "pendiente", createdAt: FieldValue.serverTimestamp(),
          expiraAt: Timestamp.fromDate(expiration), creadoPorUid: createdBy || null,
          usadoAt: null, usuarioCreadoUid: null,
        });
        return {token, expiration, usage: {...context.usage, usedUserSeats: context.usage.usedUserSeats + 1}};
      });
    },

    async cancelInvitation({invitationId}) {
      const ref = invitations.doc(invitationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw Object.assign(new Error("INVITATION_NOT_FOUND"), {code: "INVITATION_NOT_FOUND"});
        const invitation = snapshot.data();
        const context = await transactionContext(transaction, invitation.clienteId);
        context.touchLock();
        if (invitation.estado === "pendiente") {
          transaction.update(ref, {estado: "cancelada", cancelledAt: FieldValue.serverTimestamp()});
        }
        return {tenantId: invitation.clienteId};
      });
    },

    async acceptInvitation({invitationId, uid, authEmail, displayName}) {
      const ref = invitations.doc(invitationId);
      return db.runTransaction(async (transaction) => {
        const invitationSnapshot = await transaction.get(ref);
        if (!invitationSnapshot.exists) throw Object.assign(new Error("INVITATION_NOT_FOUND"), {code: "INVITATION_NOT_FOUND"});
        const invitation = invitationSnapshot.data();
        const context = await transactionContext(transaction, invitation.clienteId);
        if (!invitationReservesSeat(invitation, now(), new Set())) {
          throw Object.assign(new Error("INVITATION_NOT_VALID"), {code: "INVITATION_NOT_VALID"});
        }
        if (normalizedEmail(invitation.email) !== normalizedEmail(authEmail)) {
          throw Object.assign(new Error("INVITATION_EMAIL_MISMATCH"), {code: "INVITATION_EMAIL_MISMATCH"});
        }
        if (context.users.some((user) => user.activo === true &&
            normalizedEmail(user.email) === normalizedEmail(invitation.email))) {
          throw Object.assign(new Error("USER_ALREADY_ACTIVE"), {code: "USER_ALREADY_ACTIVE"});
        }
        const userRef = users.doc(uid);
        const existingUser = await transaction.get(userRef);
        if (existingUser.exists) throw Object.assign(new Error("USER_ALREADY_EXISTS"), {code: "USER_ALREADY_EXISTS"});
        context.touchLock();
        transaction.create(userRef, {
          nombre: String(displayName || invitation.nombre || "").trim(),
          email: normalizedEmail(invitation.email), rol: invitation.rol || "usuario",
          activo: true, clienteId: invitation.clienteId,
          permisos: DEFAULT_INVITED_PERMISSIONS,
          invitacionId: invitationId,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(ref, {
          estado: "usada", usadoAt: FieldValue.serverTimestamp(), usuarioCreadoUid: uid,
        });
        return {tenantId: invitation.clienteId, usage: context.usage};
      });
    },

    async setUserActive({tenantId, uid, active}) {
      const userRef = users.doc(uid);
      return db.runTransaction(async (transaction) => {
        const context = await transactionContext(transaction, tenantId);
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists || snapshot.data().clienteId !== tenantId) {
          throw Object.assign(new Error("USER_NOT_FOUND"), {code: "USER_NOT_FOUND"});
        }
        if (active && snapshot.data().activo !== true) assertCapacity(context.usage, "users");
        context.touchLock();
        transaction.update(userRef, {activo: active, updatedAt: FieldValue.serverTimestamp()});
        return {usage: context.usage};
      });
    },

    async ensurePrincipalBranch({tenantId}) {
      const ref = branches.doc(`${tenantId}_principal`);
      return db.runTransaction(async (transaction) => {
        const context = await transactionContext(transaction, tenantId);
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) return {created: false};
        assertCapacity(context.usage, "branches");
        context.touchLock();
        transaction.create(ref, {
          clienteId: tenantId, codigo: "principal", nombre: "Sucursal principal",
          direccion: "", activa: true, esPrincipal: true,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        return {created: true};
      });
    },

    async createBranch({tenantId, name, address}) {
      const ref = branches.doc();
      return db.runTransaction(async (transaction) => {
        const context = await transactionContext(transaction, tenantId);
        assertCapacity(context.usage, "branches");
        context.touchLock();
        transaction.create(ref, {
          clienteId: tenantId, codigo: "", nombre: String(name || "").trim(),
          direccion: String(address || "").trim(), activa: true, esPrincipal: false,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        return {id: ref.id};
      });
    },

    async setBranchActive({tenantId, branchId, active}) {
      const ref = branches.doc(branchId);
      return db.runTransaction(async (transaction) => {
        const context = await transactionContext(transaction, tenantId);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data().clienteId !== tenantId) {
          throw Object.assign(new Error("BRANCH_NOT_FOUND"), {code: "BRANCH_NOT_FOUND"});
        }
        if (snapshot.data().esPrincipal && !active) {
          throw Object.assign(new Error("PRINCIPAL_BRANCH_REQUIRED"), {code: "PRINCIPAL_BRANCH_REQUIRED"});
        }
        if (active && snapshot.data().activa === false) assertCapacity(context.usage, "branches");
        context.touchLock();
        transaction.update(ref, {activa: active, updatedAt: FieldValue.serverTimestamp()});
        return {usage: context.usage};
      });
    },
  };
}

module.exports = {
  assertCapacity,
  BRANCH_LIMIT_CODE,
  calculateEntitlementUsage,
  canDowngradeToPlan,
  createSaasEntitlementService,
  invitationReservesSeat,
  USER_LIMIT_CODE,
};
