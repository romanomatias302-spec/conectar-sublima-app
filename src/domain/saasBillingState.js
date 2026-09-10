function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addCycle(date, cycle) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (cycle === "annual") {
    const nextYear = year + 1;
    const maxDay = new Date(Date.UTC(nextYear, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(nextYear, month, Math.min(day, maxDay)));
  }
  const absoluteMonth = year * 12 + month + 1;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = absoluteMonth % 12;
  const maxDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(nextYear, nextMonth, Math.min(day, maxDay)));
}

export function nextSaasBillingDate(anchorDate, cycle) {
  const anchor = typeof anchorDate === "string" ? new Date(`${anchorDate}T00:00:00Z`) : anchorDate;
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime()) || !["monthly", "annual"].includes(cycle)) return "";
  return formatDate(addCycle(anchor, cycle));
}

export function deterministicSaasChargeId(clientId, period) {
  const safeClient = String(clientId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safePeriod = String(period || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `cargo_${safeClient}_${safePeriod}`;
}

export function recurringSaasPeriodKey(client = {}, referenceDate = new Date()) {
  const billingDate = String(client.nextBillingDate || client.fechaProximoCargo || "").slice(0, 10);
  const fallbackDate = referenceDate instanceof Date
    ? formatDate(referenceDate)
    : String(referenceDate || "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(billingDate) ? billingDate : fallbackDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const rawCycle = String(client.billingCycle || client.frecuenciaCobro || "").toLowerCase();
  if (["annual", "anual"].includes(rawCycle)) return `${date}-ANUAL`;
  if (["monthly", "mensual"].includes(rawCycle)) return date.slice(0, 7);
  return "";
}

export function buildRecurringChargeAdvancePatch(client = {}, periodKey, referenceDate = new Date()) {
  const rawCycle = String(client.billingCycle || client.frecuenciaCobro || "").toLowerCase();
  const cycle = ["annual", "anual"].includes(rawCycle)
    ? "annual"
    : ["monthly", "mensual"].includes(rawCycle) ? "monthly" : "";
  const rawBillingDate = String(client.nextBillingDate || client.fechaProximoCargo || "").slice(0, 10);
  const fallbackDate = referenceDate instanceof Date ? formatDate(referenceDate) : String(referenceDate || "").slice(0, 10);
  const billingDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBillingDate) ? rawBillingDate : fallbackDate;
  if (!cycle || !periodKey || !/^\d{4}-\d{2}-\d{2}$/.test(billingDate)) return null;
  const nextBillingDate = nextSaasBillingDate(billingDate, cycle);
  const due = new Date(`${billingDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + Math.max(0, Number(client.diasGracia ?? 7)));
  return {
    ultimoPeriodoFacturado: periodKey,
    billingCycleSequence: Number(client.billingCycleSequence || 0) + 1,
    nextBillingDate,
    fechaProximoCargo: nextBillingDate,
    fechaVencimiento: formatDate(due),
  };
}

export function buildSaasReactivationPatch(client = {}, balance, now = new Date()) {
  if (Number(balance) > 0 || client.suspendidoManual === true || client.suspendidoPorSistema !== true) return null;
  const rawCycle = String(client.billingCycle || client.frecuenciaCobro || "").toLowerCase();
  const cycle = ["annual", "anual"].includes(rawCycle) ? "annual" : ["monthly", "mensual"].includes(rawCycle) ? "monthly" : "";
  const isTrial = client.planId === "trial" || ["trial", "prueba"].includes(String(client.subscriptionStatus || client.estadoSuscripcion || "").toLowerCase());
  if (!cycle || isTrial) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextBillingDate = formatDate(addCycle(today, cycle));
  return {
    estado: "activo", estadoSuscripcion: "activa", subscriptionStatus: "active",
    suspendidoPorSistema: false, motivoSuspension: "", fechaReactivacion: formatDate(today),
    billingAnchorDate: formatDate(today), nextBillingDate, fechaProximoCargo: nextBillingDate,
    billingCycleSequence: 0,
  };
}
