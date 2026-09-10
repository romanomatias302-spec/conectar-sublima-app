import {normalizeBillingCycle, normalizeSubscriptionStatus} from "./saasPlans";

export const SAAS_TABS = ["clientes", "estadisticas", "comercial", "auditoria"];

export function normalizeSaasText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function asDate(value) {
  if (!value) return null;
  const raw = typeof value?.toDate === "function"
    ? value.toDate()
    : value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : null;
}

export function resolveSaasCurrency(record = {}) {
  const currency = String(record.currency || record.moneda || "").trim().toUpperCase();
  return currency || "";
}

export function resolveSaasPrice(client = {}) {
  const value = Number(client.price ?? client.planPrecio ?? client.mantenimientoMensual);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatSaasMoney(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!currency || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount).replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR", {maximumFractionDigits: 2})}`;
  }
}

export function resolveSaasPlanLabel(client = {}) {
  const planId = normalizeSaasText(client.planId);
  const labels = {
    start: "Start",
    profesional: "Profesional",
    profesional_plus: "Profesional Plus",
    empresa: "Empresa",
    trial: "Prueba",
  };
  if (labels[planId]) return labels[planId];
  const rawPlan = String(client.planNombre || client.plan || "").trim();
  const cycle = normalizeSaasText(client.billingCycle || client.frecuenciaCobro);
  if (planId === "legacy" || normalizeSaasText(rawPlan).includes("mensual") || normalizeSaasText(rawPlan).includes("anual")) {
    if (["annual", "anual"].includes(cycle) || normalizeSaasText(rawPlan).includes("anual")) return "Legacy anual";
    if (["monthly", "mensual"].includes(cycle) || normalizeSaasText(rawPlan).includes("mensual")) return "Legacy mensual";
    return "Legacy";
  }
  return rawPlan || "Sin plan";
}

export function classifySaasClient(client = {}, now = new Date()) {
  const subscription = normalizeSubscriptionStatus(
    client.subscriptionStatus || client.estadoSuscripcion || client.estado,
    client
  );
  const state = normalizeSaasText(client.estado);
  const plan = normalizeSaasText(client.planNombre || client.plan);
  const trial = normalizeSaasText(client.planId) === "trial" || subscription === "trial" || plan.includes("prueba");
  if (trial) return {group: "trial", label: "Prueba", churn: null, suspensionDays: null};
  if (["cancelled", "cancelado"].includes(subscription) || state === "inactivo") {
    return {group: "cancelled", label: "Inactivo / cancelado", churn: null, suspensionDays: null};
  }
  const suspended = client.suspendidoManual === true || client.suspendidoPorSistema === true ||
    ["suspended", "suspendida", "suspendido"].includes(subscription) || state === "suspendido";
  if (suspended) {
    const suspendedAt = asDate(client.fechaSuspension || client.suspendidoAt);
    const current = asDate(now);
    const days = suspendedAt && current
      ? Math.max(0, Math.floor((current.getTime() - suspendedAt.getTime()) / 86400000))
      : null;
    if (days === null) return {group: "suspended", label: "Suspendido", churn: "unclassified", suspensionDays: null};
    if (days <= 30) return {group: "suspended", label: "Suspendido reciente", churn: "risk", suspensionDays: days};
    if (days <= 60) return {group: "suspended", label: "En recuperación", churn: "recovery", suspensionDays: days};
    return {group: "churn", label: "No recuperado", churn: "not_recovered", suspensionDays: days};
  }
  if (["past_due", "gracia"].includes(subscription)) return {group: "grace", label: "En gracia", churn: null, suspensionDays: null};
  return {group: "active", label: "Activo", churn: null, suspensionDays: null};
}

const RECURRING_PLAN_IDS = new Set(["start", "profesional", "profesional_plus", "empresa"]);

function isOneTimeSaasPlan(client = {}) {
  const plan = normalizeSaasText(client.planNombre || client.plan);
  return plan.includes("instalacion") || plan.includes("pago unico");
}

export function resolveActiveSaasBillingCycle(client = {}) {
  if (isOneTimeSaasPlan(client)) return "";
  const explicitCycle = normalizeBillingCycle(client.billingCycle || client.frecuenciaCobro);
  if (explicitCycle) return explicitCycle;
  const plan = normalizeSaasText(client.planNombre || client.plan);
  if (plan === "mensual") return "monthly";
  if (plan === "anual") return "annual";
  return "";
}

function hasRecurringSaasSubscription(client = {}) {
  if (isOneTimeSaasPlan(client)) return false;
  const planId = normalizeSaasText(client.planId);
  if (RECURRING_PLAN_IDS.has(planId)) return true;
  const cycle = resolveActiveSaasBillingCycle(client);
  if (planId === "legacy") return Boolean(cycle);
  const plan = normalizeSaasText(client.planNombre || client.plan);
  if (["mensual", "anual"].includes(plan)) return true;
  if (plan === "personalizado") return Boolean(normalizeBillingCycle(client.billingCycle || client.frecuenciaCobro));
  return false;
}

export function getActiveSaasClients(clients = [], now = new Date()) {
  return clients.filter((client) =>
    classifySaasClient(client, now).group === "active" && hasRecurringSaasSubscription(client)
  );
}

export function groupActiveSubscriptionsByBillingCycle(clients = [], now = new Date()) {
  return getActiveSaasClients(clients, now).reduce((groups, client) => {
    const cycle = resolveActiveSaasBillingCycle(client);
    if (cycle === "monthly") groups.monthly += 1;
    else if (cycle === "annual") groups.annual += 1;
    else groups.withoutCycle += 1;
    return groups;
  }, {monthly: 0, annual: 0, withoutCycle: 0});
}

export function groupActiveClientsByCountry(clients = [], now = new Date()) {
  const grouped = getActiveSaasClients(clients, now).reduce((result, client) => {
    const country = String(client.pais || "").trim() || "Sin país";
    result[country] = (result[country] || 0) + 1;
    return result;
  }, {});
  return Object.entries(grouped)
    .map(([country, total]) => ({country, total}))
    .sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
}

function recurringMonthlyValue(client) {
  const price = resolveSaasPrice(client);
  if (price === null || price <= 0) return 0;
  const cycle = normalizeSaasText(client.billingCycle || client.frecuenciaCobro);
  const plan = normalizeSaasText(client.planNombre || client.plan);
  if (plan.includes("instalacion") || plan.includes("pago unico")) return 0;
  if (["annual", "anual"].includes(cycle) || plan.includes("anual")) return price / 12;
  if (["monthly", "mensual"].includes(cycle) || plan.includes("mensual")) return price;
  return 0;
}

function addCurrency(target, currency, amount) {
  if (!currency || !Number.isFinite(amount) || amount === 0) return;
  target[currency] = (target[currency] || 0) + amount;
}

export function buildSaasPanelMetrics(clients = [], movements = [], now = new Date()) {
  const counts = {active: 0, grace: 0, suspended: 0, churn: 0, trial: 0, cancelled: 0};
  const churn = {risk: 0, recovery: 0, not_recovered: 0, unclassified: 0};
  const mrr = {active: {}, grace: {}, recoverable: {}};
  const debt = {};
  for (const client of clients) {
    const classification = classifySaasClient(client, now);
    counts[classification.group] = (counts[classification.group] || 0) + 1;
    if (classification.churn) churn[classification.churn] += 1;
    const currency = resolveSaasCurrency(client);
    const monthly = recurringMonthlyValue(client);
    if (classification.group === "active") addCurrency(mrr.active, currency, monthly);
    if (classification.group === "grace") addCurrency(mrr.grace, currency, monthly);
    if (classification.group === "suspended" && ["risk", "recovery"].includes(classification.churn)) {
      addCurrency(mrr.recoverable, currency, monthly);
    }
    const balance = Number(client.saldoCuentaCorriente || 0);
    if (balance > 0) addCurrency(debt, currency, balance);
  }

  const collected = {};
  let activePayments = 0;
  let paymentsWithoutCurrency = 0;
  for (const movement of movements) {
    if (movement.anulado === true || movement.estado === "anulado" || movement.tipoMovimiento !== "pago") continue;
    activePayments += 1;
    const currency = resolveSaasCurrency(movement);
    if (!currency) {
      paymentsWithoutCurrency += 1;
      continue;
    }
    addCurrency(collected, currency, Number(movement.monto || 0));
  }
  return {counts, churn, mrr, debt, collected, activePayments, paymentsWithoutCurrency};
}

export function matchesSaasClientSearch(client = {}, search = "") {
  const needle = normalizeSaasText(search);
  if (!needle) return true;
  return [
    client.nombre,
    client.nombreCliente,
    client.empresa,
    client.email,
    client.id,
    client.clienteId,
    client.pais,
    resolveSaasPlanLabel(client),
  ].some((value) => normalizeSaasText(value).includes(needle));
}

export function filterSaasClients(clients = [], filters = {}, now = new Date()) {
  return clients.filter((client) => {
    if (!matchesSaasClientSearch(client, filters.search)) return false;
    const classification = classifySaasClient(client, now);
    if (filters.state && filters.state !== "todos") {
      if (filters.state === "mora" && Number(client.saldoCuentaCorriente || 0) <= 0) return false;
      else if (filters.state === "saldo_favor" && Number(client.saldoCuentaCorriente || 0) >= 0) return false;
      else if (!["mora", "saldo_favor"].includes(filters.state) && classification.group !== filters.state) return false;
    }
    if (filters.plan && filters.plan !== "todos" && resolveSaasPlanLabel(client) !== filters.plan) return false;
    if (filters.country && filters.country !== "todos" && String(client.pais || "") !== filters.country) return false;
    if (filters.currency && filters.currency !== "todos" && resolveSaasCurrency(client) !== filters.currency) return false;
    return true;
  });
}

export function getSaasTabFromSearch(search = "") {
  const tab = new URLSearchParams(search).get("tab") || "clientes";
  return SAAS_TABS.includes(tab) ? tab : "clientes";
}

export function syncSaasTabFromLocation(locationLike, setTab) {
  const tab = getSaasTabFromSearch(locationLike?.search || "");
  setTab(tab);
  return tab;
}

export function buildSaasTabUrl(locationLike, tab) {
  const validTab = SAAS_TABS.includes(tab) ? tab : "clientes";
  const params = new URLSearchParams(locationLike.search || "");
  params.set("tab", validTab);
  return `${locationLike.pathname || "/"}?${params.toString()}${locationLike.hash || ""}`;
}

const REFRESH_SCOPES = {
  payment: ["clients", "movements"],
  voidMovement: ["clients", "movements"],
  recurringCharge: ["clients", "movements"],
  plan: ["clients"],
  client: ["clients"],
  suspension: ["clients"],
};

export async function refreshAfterSaasMutation(kind, loaders = {}) {
  const scopes = REFRESH_SCOPES[kind] || [];
  await Promise.all(scopes.map((scope) => loaders[scope]?.()));
  return scopes;
}

export function isInteractiveSaasTarget(target, row = null) {
  const interactive = target?.closest?.("button, a, input, select, textarea, [role='button']");
  return Boolean(interactive && interactive !== row);
}

export function activateSaasClientRow(event, client, onOpen) {
  if (isInteractiveSaasTarget(event?.target, event?.currentTarget)) return false;
  onOpen(client);
  return true;
}
