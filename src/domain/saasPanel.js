import {normalizeBillingCycle} from "./saasPlans";

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

export function resolveSaasCurrency(record = {}, fallback = "") {
  const currency = String(
    record.billingCurrency ||
    record.currency ||
    fallback ||
    ""
  ).trim().toUpperCase();

  return currency || "";
}

export function resolveSaasMovementCurrency(record = {}) {
  return resolveSaasCurrency(record) ||
    String(record.moneda || "").trim().toUpperCase();
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
    trial: "Prueba gratis 7 días",
  };
  if (labels[planId]) return labels[planId];
  const rawPlan = String(client.planNombre || client.plan || "").trim();
  if ((!planId || planId === "legacy") && normalizeSaasText(rawPlan) === "personalizado") return "Personalizado";
  if (!planId && (normalizeSaasText(rawPlan).startsWith("prueba") || normalizeSaasText(rawPlan) === "trial")) return "Prueba gratis 7 días";
  const cycle = normalizeSaasText(client.billingCycle || client.frecuenciaCobro);
  if (planId === "legacy" || normalizeSaasText(rawPlan).includes("mensual") || normalizeSaasText(rawPlan).includes("anual")) {
    if (["annual", "anual"].includes(cycle) || normalizeSaasText(rawPlan).includes("anual")) return "Legacy anual";
    if (["monthly", "mensual"].includes(cycle) || normalizeSaasText(rawPlan).includes("mensual")) return "Legacy mensual";
    return "Legacy";
  }
  return rawPlan || "Sin plan";
}

export function resolveSaasClientStatus(client = {}) {
  const values = [client.subscriptionStatus, client.estadoSuscripcion, client.estado].map(normalizeSaasText).filter(Boolean);
  if (values.some((v) => ["cancelled", "canceled", "cancelado", "cancelada"].includes(v))) return "canceled";
  if (client.activo === false || values.some((v) => ["inactive", "inactivo", "inactiva"].includes(v))) return "inactive";
  if (client.suspendidoManual === true || client.suspendidoPorSistema === true || values.some((v) => ["suspended", "suspendido", "suspendida"].includes(v))) return "suspended";
  if (values.some((v) => ["past_due", "grace", "gracia", "mora"].includes(v))) return "grace";
  if (normalizeSaasText(client.planId) === "trial" || resolveSaasPlanLabel(client) === "Prueba gratis 7 días" || values.some((v) => ["trial", "prueba"].includes(v))) return "trial";
  if (!values.length || values.some((v) => ["active", "activo", "activa"].includes(v))) return "active";
  return "inactive";
}
export const SAAS_STATUS_LABELS = {active: "Activo", grace: "En gracia", suspended: "Suspendido", canceled: "Cancelado", inactive: "Inactivo", trial: "Prueba"};

export function classifySaasClient(client = {}, now = new Date()) {
  const status = resolveSaasClientStatus(client);
  const trial = status === "trial";
  if (trial) return {group: "trial", label: "Prueba", churn: null, suspensionDays: null};
  if (["canceled", "inactive"].includes(status)) {
    return {group: "cancelled", label: SAAS_STATUS_LABELS[status], churn: null, suspensionDays: null};
  }
  const suspended = status === "suspended";
  if (suspended) {
    const suspendedAt = asDate(client.fechaSuspension || client.suspendidoAt);
    const current = asDate(now);
    const days = suspendedAt && current
      ? Math.max(0, Math.floor((current.getTime() - suspendedAt.getTime()) / 86400000))
      : null;
    if (days === null) return {group: "suspended", label: "Suspendido", churn: "unclassified", suspensionDays: null};
    if (days <= 30) return {group: "suspended", label: "Suspendido", churn: "risk", suspensionDays: days};
    if (days <= 60) return {group: "suspended", label: "Suspendido", churn: "recovery", suspensionDays: days};
    return {group: "churn", label: "Suspendido", churn: "not_recovered", suspensionDays: days};
  }
  if (status === "grace") return {group: "grace", label: "En gracia", churn: null, suspensionDays: null};
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
    const currency = resolveSaasCurrency(client, "USD");
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
    const currency = resolveSaasMovementCurrency(movement);
    if (!currency) {
      paymentsWithoutCurrency += 1;
      continue;
    }
    addCurrency(collected, currency, Number(movement.monto || 0));
  }
  return {counts, churn, mrr, debt, collected, activePayments, paymentsWithoutCurrency};
}

export function initialSaasBillingRecordStatus(client = {}, movements = []) {
  const planId = normalizeSaasText(client.planId);
  const classification = classifySaasClient(client);
  const modernPaidPlan = RECURRING_PLAN_IDS.has(planId);
  const paidLegacy = planId === "legacy" && hasRecurringSaasSubscription(client) && Number(resolveSaasPrice(client) || 0) > 0;
  const applicable = (modernPaidPlan || paidLegacy) && !["trial", "cancelled"].includes(classification.group);
  if (!applicable) return {applicable: false, complete: true, needsAttention: false};
  const movementEvidence = movements.some((movement) =>
    movement.clienteSaasId === client.id && movement.anulado !== true && movement.estado !== "anulado" &&
    ["cargo", "pago"].includes(movement.tipoMovimiento));
  const complete = Boolean(client.ultimoPeriodoFacturado || client.ultimoPago || movementEvidence);
  return {applicable: true, complete, needsAttention: !complete};
}

export function saasBalanceStatus(client = {}) {
  const raw = Number(client.saldoCuentaCorriente ?? 0);
  const balance = Number.isFinite(raw) ? raw : 0;
  return {balance, label: balance > 0 ? "Con deuda" : balance < 0 ? "Crédito a favor" : "Al día",
    color: balance > 0 ? "#dc2626" : balance < 0 ? "#2563eb" : "#15803d"};
}

export function isCommerciallyActivePaidClient(client = {}) {
    if (!["active", "grace"].includes(classifySaasClient(client).group)) return false;
    if (!["monthly", "annual"].includes(resolveActiveSaasBillingCycle(client))) return false;
    const name = normalizeSaasText(client.planNombre || client.plan);
    if (["personalizado", "sin plan"].includes(name) || name.includes("instalacion") || name.includes("prueba")) return false;
    const id = normalizeSaasText(client.planId);
    return RECURRING_PLAN_IDS.has(id) || resolveSaasPlanLabel(client).startsWith("Legacy");
}

export function getActivePaidSaasClients(clients = []) {
  return clients.filter(isCommerciallyActivePaidClient);
}

export function buildPaidSaasSummary(clients = []) {
  const active = getActivePaidSaasClients(clients);
  const monthly = {}, annual = {}, countries = new Map();
  for (const client of active) {
    const cycle = resolveActiveSaasBillingCycle(client);
    const price = resolveSaasPrice(client);
    if (price !== null && price > 0 && ["monthly", "annual"].includes(cycle)) {
      addCurrency(cycle === "monthly" ? monthly : annual, resolveSaasCurrency(client), price);
    }
    const country = String(client.pais || "").trim() || "Sin país";
    const plan = resolveSaasPlanLabel(client);
    const row = countries.get(country) || {country, total: 0, monthly: 0, annual: 0, plans: {}};
    row[cycle] += 1;
    row.total += 1; row.plans[plan] = (row.plans[plan] || 0) + 1;
    countries.set(country, row);
  }
  const columns = [...new Set(active.map(resolveSaasPlanLabel))].sort();
  const rows = [...countries.values()].sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
  const totals = {total: active.length, monthly: 0, annual: 0, plans: {}};
  for (const row of rows) { totals.monthly += row.monthly; totals.annual += row.annual; }
  for (const row of rows) for (const plan of columns) totals.plans[plan] = (totals.plans[plan] || 0) + (row.plans[plan] || 0);
  return {active, monthly, annual, columns, rows, totals};
}

export function sumSaasPlanRows(rows = []) {
  return rows.reduce((total, row) => {
    for (const key of ["total", "active", "grace", "suspended", "trial"]) total[key] += row[key] || 0;
    return total;
  }, {total: 0, active: 0, grace: 0, suspended: 0, trial: 0});
}

export function restoreSaasSection(storage, search = "") {
  const urlTab = new URLSearchParams(search).get("tab");
  if (SAAS_TABS.includes(urlTab)) return urlTab;
  try {
    const saved = storage?.getItem("duenoSaasSeccionActiva");
    return SAAS_TABS.includes(saved) ? saved : "clientes";
  } catch { return "clientes"; }
}

export function persistSaasSection(storage, section) {
  if (!SAAS_TABS.includes(section)) return;
  try { storage?.setItem("duenoSaasSeccionActiva", section); } catch { /* Storage no disponible. */ }
}

export function indexInitialSaasBilling(clients = [], movements = []) {
  const recorded = new Set(movements.filter((m) => m.anulado !== true && m.estado !== "anulado" &&
    ["cargo", "pago"].includes(m.tipoMovimiento)).map((m) => m.clienteSaasId));
  return Object.fromEntries(clients.map((client) => [client.id,
    initialSaasBillingRecordStatus(client, recorded.has(client.id) ? [{clienteSaasId: client.id, tipoMovimiento: "cargo"}] : [])]));
}

export function groupActiveClientsByCountryAndPlan(clients = []) {
  const countries = new Map();
  for (const client of getActiveSaasClients(clients)) {
    const country = String(client.pais || "").trim() || "Sin país";
    const plan = resolveSaasPlanLabel(client).startsWith("Legacy") ? "Legacy" : resolveSaasPlanLabel(client);
    const row = countries.get(country) || {country, total: 0, plans: {}};
    row.total += 1;
    row.plans[plan] = (row.plans[plan] || 0) + 1;
    countries.set(country, row);
  }
  return [...countries.values()].sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
}

export function summarizeSaasMovements(movements = []) {
  const expected = {}, collected = {}, pending = {};
  let withoutCurrency = 0;
  for (const movement of movements) {
    if (movement.anulado === true || movement.estado === "anulado" || !["cargo", "pago"].includes(movement.tipoMovimiento)) continue;
    const currency = resolveSaasMovementCurrency(movement);
    if (!currency) { withoutCurrency += 1; continue; }
    addCurrency(movement.tipoMovimiento === "cargo" ? expected : collected, currency, Number(movement.monto));
  }
  for (const currency of new Set([...Object.keys(expected), ...Object.keys(collected)])) {
    pending[currency] = (expected[currency] || 0) - (collected[currency] || 0);
  }
  return {expected, collected, pending, withoutCurrency};
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
      else if (filters.state === "suspended" && resolveSaasClientStatus(client) !== "suspended") return false;
      else if (!["mora", "saldo_favor", "suspended"].includes(filters.state) && classification.group !== filters.state) return false;
    }
    if (
      Array.isArray(filters.plan) &&
      filters.plan.length > 0 &&
      !filters.plan.includes(resolveSaasPlanLabel(client))
    ) {
      return false;
    }
    if (filters.country && filters.country !== "todos" && String(client.pais || "") !== filters.country) return false;
    if (
      filters.currency &&
      filters.currency !== "todos" &&
      resolveSaasCurrency(client, "USD") !== filters.currency
    ) {
      return false;
    }
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
