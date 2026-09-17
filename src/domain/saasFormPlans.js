import {resolveSaasPlanLabel} from "./saasPanel";

export function formPlanSelection(client) {
  const label = resolveSaasPlanLabel(client);
  if (label === "Personalizado") return "custom";
  if (label === "Legacy anual") return "legacy_annual";
  if (label.startsWith("Legacy")) return "legacy_monthly";
  return client.planId || "trial";
}

export function selectHistoricalFormPlan(form, selection) {
  if (selection === "custom") return {...form, planId: "legacy", planNombre: "Personalizado", plan: "Personalizado",
    subscriptionStatus: form.subscriptionStatus === "trial" ? "active" : form.subscriptionStatus,
    ...(form.planId === "trial" ? {billingCycle: "", frecuenciaCobro: "", diasCiclo: 0} : {})};
  const annual = selection === "legacy_annual";
  return {...form, planId: "legacy", planNombre: annual ? "Anual" : "Mensual", plan: annual ? "Anual" : "Mensual",
    subscriptionStatus: form.subscriptionStatus === "trial" ? "active" : form.subscriptionStatus,
    billingCycle: annual ? "annual" : "monthly", frecuenciaCobro: annual ? "anual" : "mensual", diasCiclo: annual ? 365 : 30};
}

export function preserveHistoricalCommercialFields(payload, previous, dirty) {
  if (!previous || dirty || !["custom", "legacy_monthly", "legacy_annual"].includes(formPlanSelection(previous))) return payload;
  const result = {...payload};
  for (const key of ["planId", "plan", "planNombre", "billingCycle", "frecuenciaCobro", "diasCiclo", "currency", "billingCurrency", "price", "planPrecio", "mantenimientoMensual", "subscriptionStatus", "estadoSuscripcion", "estado", "billingAnchorDate", "nextBillingDate", "fechaProximoCargo", "fechaVencimiento"]) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) result[key] = previous[key];
    else delete result[key];
  }
  return result;
}
