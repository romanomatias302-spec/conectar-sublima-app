"use strict";

const {SUPPORTED_CURRENCY_SET} = require("./saasCurrencies");

const PAID_PLAN_IDS = new Set(["start", "profesional", "profesional_plus", "empresa", "legacy"]);
const BILLING_CYCLES = new Set(["monthly", "annual", "mensual", "anual"]);

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  const aliases = {activa: "active", activo: "active", prueba: "trial", suspendida: "suspended", suspendido: "suspended", cancelado: "cancelled"};
  return aliases[status] || status;
}

function isTrialClient(client = {}) {
  return normalizeStatus(client.subscriptionStatus || client.estadoSuscripcion) === "trial" ||
    String(client.frecuenciaCobro || "").toLowerCase() === "prueba" ||
    String(client.planNombre || client.plan || "").toLowerCase().includes("prueba");
}

function isPaidSubscription(client = {}) {
  if (isTrialClient(client)) return false;
  const planId = String(client.planId || "").toLowerCase();
  const legacyPlan = String(client.planNombre || client.plan || "").toLowerCase();
  return PAID_PLAN_IDS.has(planId) || Boolean(planId || legacyPlan || client.price != null || client.planPrecio != null || client.mantenimientoMensual != null);
}

function validateBillableClient(client = {}) {
  if (!isPaidSubscription(client)) return {valid: true, trial: isTrialClient(client), errors: []};
  const errors = [];
  const rawPrice = client.price ??
    client.planPrecio ??
    client.mantenimientoMensual;
  const price = Number(rawPrice);

  const currency = String(
    client.billingCurrency ||
    client.currency ||
    "USD"
  ).trim().toUpperCase();
  const cycle = String(client.billingCycle || client.frecuenciaCobro || "").toLowerCase();
  const legacyPlan = String(client.planNombre || client.plan || "").trim().toLowerCase();
  if (client.planId && !PAID_PLAN_IDS.has(String(client.planId).toLowerCase())) errors.push("INVALID_PLAN");
  if (!client.planId && !legacyPlan) errors.push("MISSING_PLAN");
  if (rawPrice === "" || !Number.isFinite(price) || price < 0) {
    errors.push("INVALID_PRICE");
  }
  if (!currency) errors.push("MISSING_CURRENCY");
  else if (!SUPPORTED_CURRENCY_SET.has(currency)) errors.push("INVALID_CURRENCY");
  if (!cycle) errors.push("MISSING_BILLING_CYCLE");
  else if (!BILLING_CYCLES.has(cycle)) errors.push("INVALID_BILLING_CYCLE");
  return {valid: errors.length === 0, trial: false, price, currency, errors};
}

function authorizeSaasOwner(auth, profile = null) {
  if (!auth || !auth.uid) return {authorized: false, code: "UNAUTHENTICATED"};
  const token = auth.token || {};
  if (token.superadmin === true || token.rol === "superadmin" || token.role === "superadmin" || profile?.rol === "superadmin") return {authorized: true};
  return {authorized: false, code: "FORBIDDEN"};
}

module.exports = {authorizeSaasOwner, isPaidSubscription, isTrialClient, validateBillableClient};
