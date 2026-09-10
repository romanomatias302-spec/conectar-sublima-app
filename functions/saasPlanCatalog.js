"use strict";
/* eslint-disable require-jsdoc, max-len */

const SAAS_PLAN_CATALOG = Object.freeze({
  start: Object.freeze({id: "start", name: "Start"}),
  profesional: Object.freeze({id: "profesional", name: "Profesional"}),
  profesional_plus: Object.freeze({
    id: "profesional_plus",
    name: "Profesional Plus",
  }),
  empresa: Object.freeze({id: "empresa", name: "Empresa"}),
});

const BILLING_CYCLES = Object.freeze(["monthly", "annual"]);

function getSaasPlan(planId) {
  return SAAS_PLAN_CATALOG[String(planId || "").trim().toLowerCase()] || null;
}

function isSupportedBillingCycle(value) {
  return BILLING_CYCLES.includes(String(value || "").trim().toLowerCase());
}

module.exports = {
  BILLING_CYCLES,
  getSaasPlan,
  isSupportedBillingCycle,
  SAAS_PLAN_CATALOG,
};
