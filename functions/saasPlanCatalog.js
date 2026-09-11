"use strict";
/* eslint-disable require-jsdoc, max-len */

const SAAS_PLAN_CATALOG = Object.freeze({
  trial: Object.freeze({
    id: "trial", name: "Prueba gratis 7 días", maxUsers: null, maxBranches: null,
    unlimitedUsers: true, unlimitedBranches: true,
  }),
  legacy: Object.freeze({
    id: "legacy", name: "Legacy", maxUsers: null, maxBranches: null,
    unlimitedUsers: true, unlimitedBranches: true,
  }),
  start: Object.freeze({
    id: "start", name: "Start", maxUsers: 2, maxBranches: 1,
    unlimitedUsers: false, unlimitedBranches: false,
  }),
  profesional: Object.freeze({
    id: "profesional", name: "Profesional", maxUsers: 5, maxBranches: 2,
    unlimitedUsers: false, unlimitedBranches: false,
  }),
  profesional_plus: Object.freeze({
    id: "profesional_plus",
    name: "Profesional Plus",
    maxUsers: 10,
    maxBranches: 5,
    unlimitedUsers: false,
    unlimitedBranches: false,
  }),
  empresa: Object.freeze({
    id: "empresa", name: "Empresa", maxUsers: null, maxBranches: null,
    unlimitedUsers: true, unlimitedBranches: true,
  }),
});

const BILLING_CYCLES = Object.freeze(["monthly", "annual"]);

function getSaasPlan(planId) {
  return SAAS_PLAN_CATALOG[String(planId || "").trim().toLowerCase()] || null;
}

function isSupportedBillingCycle(value) {
  return BILLING_CYCLES.includes(String(value || "").trim().toLowerCase());
}

function resolveSaasEntitlements(client = {}) {
  const explicit = String(client.planId || "").trim().toLowerCase();
  const legacyName = String(client.planNombre || client.plan || "")
      .trim().toLowerCase();
  const historical = [
    "mensual", "monthly", "anual", "annual", "instalacion", "instalación",
    "personalizado",
  ].includes(legacyName);
  const plan = SAAS_PLAN_CATALOG[explicit] ||
    (historical ? SAAS_PLAN_CATALOG.legacy : null);
  return {
    planId: plan?.id || "unknown",
    planName: plan?.name || client.planNombre || client.plan || "Sin plan",
    maxUsers: plan?.maxUsers ?? null,
    maxBranches: plan?.maxBranches ?? null,
    unlimitedUsers: plan?.unlimitedUsers === true,
    unlimitedBranches: plan?.unlimitedBranches === true,
    isLegacy: plan?.id === "legacy",
    isKnownPlan: Boolean(plan),
  };
}

module.exports = {
  BILLING_CYCLES,
  getSaasPlan,
  isSupportedBillingCycle,
  resolveSaasEntitlements,
  SAAS_PLAN_CATALOG,
};
