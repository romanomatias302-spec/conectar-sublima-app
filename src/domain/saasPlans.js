export const BILLING_CYCLES = ["monthly", "annual"];
export const SUBSCRIPTION_STATUSES = [
  "trial", "active", "past_due", "suspended", "cancelled",
];
export const SUPPORTED_CURRENCIES = Object.freeze(["ARS", "USD", "MXN", "COP", "PEN", "CLP"]);

export const SAAS_PLAN_CATALOG = Object.freeze({
  legacy: Object.freeze({ id: "legacy", name: "Legacy", selectable: false, maxUsers: null, maxBranches: null, unlimitedUsers: true, unlimitedBranches: true, monthlyPrices: {} }),
  start: Object.freeze({ id: "start", name: "Start", selectable: true, maxUsers: 2, maxBranches: 1, unlimitedUsers: false, unlimitedBranches: false, monthlyPrices: { ARS: 19000, USD: 19 } }),
  profesional: Object.freeze({ id: "profesional", name: "Profesional", selectable: true, maxUsers: 5, maxBranches: 2, unlimitedUsers: false, unlimitedBranches: false, monthlyPrices: { ARS: 39000, USD: 39 } }),
  profesional_plus: Object.freeze({ id: "profesional_plus", name: "Profesional Plus", selectable: true, maxUsers: 10, maxBranches: 5, unlimitedUsers: false, unlimitedBranches: false, monthlyPrices: { ARS: 79000, USD: 79 } }),
  empresa: Object.freeze({ id: "empresa", name: "Empresa", selectable: true, maxUsers: null, maxBranches: null, unlimitedUsers: true, unlimitedBranches: true, monthlyPrices: { ARS: 140000, USD: 140 } }),
});

const LEGACY_TRIAL_NAMES = new Set(["prueba gratis 7 días", "prueba", "trial"]);
const LEGACY_ANNUAL_NAMES = new Set(["anual", "annual"]);
const LEGACY_MONTHLY_NAMES = new Set(["mensual", "monthly", "instalacion", "instalación", "personalizado"]);

export function getPlanDefinition(planId) {
  return SAAS_PLAN_CATALOG[String(planId || "").trim().toLowerCase()] || null;
}

export function getSelectablePlans() {
  return Object.values(SAAS_PLAN_CATALOG).filter((plan) => plan.selectable);
}

export function normalizeBillingCycle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["monthly", "mensual"].includes(normalized)) return "monthly";
  if (["annual", "anual"].includes(normalized)) return "annual";
  return "";
}

export function normalizeSubscriptionStatus(value, client = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  const aliases = { prueba: "trial", activa: "active", activo: "active", gracia: "past_due", mora: "past_due", suspendida: "suspended", suspendido: "suspended", cancelado: "cancelled", cancelada: "cancelled", inactivo: "cancelled" };
  if (SUBSCRIPTION_STATUSES.includes(normalized)) return normalized;
  if (aliases[normalized]) return aliases[normalized];
  if (client.estado === "suspendido") return "suspended";
  return "active";
}

export function resolveSaasEntitlements(client = {}) {
  const rawPlan = String(client.planId || client.planNombre || client.plan || "").trim();
  const rawLower = rawPlan.toLowerCase();
  const trial = LEGACY_TRIAL_NAMES.has(rawLower) || String(client.frecuenciaCobro || "").toLowerCase() === "prueba";
  let planId = getPlanDefinition(client.planId)?.id || "";
  if (!planId && !trial && (LEGACY_MONTHLY_NAMES.has(rawLower) || LEGACY_ANNUAL_NAMES.has(rawLower))) planId = "legacy";
  const plan = getPlanDefinition(planId);
  const legacyCycle = LEGACY_ANNUAL_NAMES.has(rawLower) ? "annual" : LEGACY_MONTHLY_NAMES.has(rawLower) ? "monthly" : "";
  const billingCycle = normalizeBillingCycle(client.billingCycle || client.frecuenciaCobro) || legacyCycle || (trial ? "monthly" : "");
  const subscriptionStatus = trial ? "trial" : normalizeSubscriptionStatus(client.subscriptionStatus || client.estadoSuscripcion, client);
  return {
    planId: trial ? "trial" : planId || "unknown",
    planName: trial ? "Prueba gratis 7 días" : plan?.name || rawPlan || "Sin plan",
    billingCycle,
    currency: String(
      client.billingCurrency ||
      client.currency ||
      "USD"
    ).trim().toUpperCase(),
    price: client.price ?? client.planPrecio ?? client.mantenimientoMensual ?? null,
    subscriptionStatus,
    maxUsers: trial ? null : plan?.maxUsers ?? null,
    maxBranches: trial ? null : plan?.maxBranches ?? null,
    unlimitedUsers: trial || plan?.unlimitedUsers === true,
    unlimitedBranches: trial || plan?.unlimitedBranches === true,
    isLegacy: planId === "legacy",
    isTrial: trial,
    isKnownPlan: Boolean(plan) || trial,
  };
}

export function canAddUser(client, currentUsers) {
  const entitlements = resolveSaasEntitlements(client);
  return entitlements.unlimitedUsers || (Number.isInteger(entitlements.maxUsers) && Number(currentUsers || 0) < entitlements.maxUsers);
}

export function canAddBranch(client, currentBranches) {
  const entitlements = resolveSaasEntitlements(client);
  return entitlements.unlimitedBranches || (Number.isInteger(entitlements.maxBranches) && Number(currentBranches || 0) < entitlements.maxBranches);
}

export function suggestCurrencyForCountry() {
  return "USD";
}

export function resolveCurrencyAfterCountryChange({
  currentCurrency,
  currencyExplicit,
  isNew,
}) {
  if (!isNew || currencyExplicit) return currentCurrency;

  return "USD";
}

export function rehydrateSaasClient(client = {}) {
  const entitlements = resolveSaasEntitlements(client);
  return {
    planId: entitlements.isTrial ? "trial" : entitlements.planId,
    billingCycle: entitlements.billingCycle || "monthly",
    currency: entitlements.currency,
    price: entitlements.isTrial ? 0 : entitlements.price ?? "",
    subscriptionStatus: entitlements.subscriptionStatus,
    isLegacy: entitlements.isLegacy,
  };
}

export function resolveManualSaasPlanId(currentClient = {}, selectedPlanId = "") {
  const selected = String(selectedPlanId || "").trim().toLowerCase();
  if (selected === "trial") return "trial";
  const selectedPlan = getPlanDefinition(selected);
  if (selectedPlan) return selectedPlan.id;
  return resolveSaasEntitlements(currentClient).planId;
}

export function validateSaasSubscription(input = {}) {
  const planId = String(input.planId || "").trim().toLowerCase();
  const isTrial = planId === "trial" || input.subscriptionStatus === "trial";
  const errors = [];
  if (!isTrial && !getPlanDefinition(planId)) errors.push("Seleccioná un plan válido.");
  if (!isTrial && !BILLING_CYCLES.includes(input.billingCycle)) errors.push("Seleccioná un ciclo de facturación válido.");
  if (!SUPPORTED_CURRENCIES.includes(String(input.currency || "").toUpperCase())) errors.push("Seleccioná una moneda válida.");
  const numericPrice = Number(input.price);
  if (!isTrial && (
    input.price === "" ||
    input.price === null ||
    input.price === undefined ||
    !Number.isFinite(numericPrice) ||
    numericPrice < 0
  )) {
    errors.push("El precio no puede ser negativo.");
  }
  return { valid: errors.length === 0, errors, isTrial, price: isTrial ? 0 : numericPrice };
}

export function priceForPlan(planId, currency, billingCycle = "monthly") {
  if (billingCycle !== "monthly") return null;
  return getPlanDefinition(planId)?.monthlyPrices?.[String(currency || "").toUpperCase()] ?? null;
}

export function priceAfterCurrencyChange({planId, currency, billingCycle, currentPrice}) {
  if (["legacy", "trial"].includes(planId)) return currentPrice;
  return priceForPlan(planId, currency, billingCycle) ?? "";
}
