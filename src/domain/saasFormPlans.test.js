import {formPlanSelection, selectHistoricalFormPlan, preserveHistoricalCommercialFields} from "./saasFormPlans";
import {filterSaasClients} from "./saasPanel";

test.each([["Mensual", "legacy_monthly"], ["Anual", "legacy_annual"], ["Personalizado", "custom"]])("abrir y guardar %s preserva el modelo histórico", (plan, selection) => {
  const previous = {plan, planNombre: plan, planPrecio: 99, frecuenciaCobro: "especial"};
  expect(formPlanSelection(previous)).toBe(selection);
  const payload = preserveHistoricalCommercialFields({planId: "legacy", planNombre: "otro", billingCycle: "monthly", planPrecio: 0}, previous, false);
  expect(payload.plan).toBe(plan);
  expect(payload.planNombre).toBe(plan);
  expect(payload.planPrecio).toBe(99);
  expect(payload.frecuenciaCobro).toBe("especial");
  expect(payload.planId).toBeUndefined();
  expect(payload.billingCycle).toBeUndefined();
});

test("selección de Personalizado no inventa ciclo y conserva precio especial", () => {
  expect(selectHistoricalFormPlan({planId: "legacy", price: 79, billingCycle: "trimestral"}, "custom"))
    .toMatchObject({planId: "legacy", price: 79, billingCycle: "trimestral", planNombre: "Personalizado"});
});

test.each(["start", "profesional", "profesional_plus", "empresa", "trial"])("selector moderno mantiene %s", (planId) => {
  expect(formPlanSelection({planId})).toBe(planId);
});

test("preset mensual incluye Legacy mensual y excluye especiales; manual elige Personalizado", () => {
  const clients = [{id: "m", plan: "Mensual"}, {id: "a", plan: "Anual"},
    {id: "c", planId: "legacy", planNombre: "Personalizado", billingCycle: "monthly"},
    {id: "t", planId: "trial"}, {id: "s", planId: "start", billingCycle: "monthly"}];
  expect(filterSaasClients(clients, {paidMonthly: true}).map((c) => c.id)).toEqual(["m", "s"]);
  expect(filterSaasClients(clients, {plan: ["Personalizado", "Legacy anual"]}).map((c) => c.id)).toEqual(["a", "c"]);
});

test("preset mensual evalúa cada cliente, no el label compartido", () => {
  const clients = [
    {id: "monthly", planId: "start", billingCycle: "monthly", subscriptionStatus: "active"},
    {id: "annual", planId: "start", billingCycle: "annual", subscriptionStatus: "active"},
    {id: "suspended", planId: "start", billingCycle: "monthly", subscriptionStatus: "suspended"},
    {id: "cancelled", planId: "start", billingCycle: "monthly", subscriptionStatus: "cancelled"},
    {id: "canceled", planId: "start", billingCycle: "monthly", subscriptionStatus: "canceled"},
    {id: "inactive", planId: "start", billingCycle: "monthly", estado: "inactivo"},
    {id: "grace", planId: "profesional", billingCycle: "monthly", subscriptionStatus: "past_due"},
    {id: "plus", planId: "profesional_plus", billingCycle: "monthly"},
    {id: "company", planId: "empresa", billingCycle: "monthly"},
    {id: "legacy", plan: "Mensual", estadoSuscripcion: "gracia"},
    {id: "legacyAnnual", plan: "Anual"},
    {id: "trial", planId: "trial", billingCycle: "monthly"},
    {id: "custom", planId: "legacy", planNombre: "Personalizado", billingCycle: "monthly"},
    {id: "installation", planNombre: "instalacion", billingCycle: "monthly"},
    {id: "unknown", billingCycle: "monthly"},
  ];
  expect(filterSaasClients(clients, {paidMonthly: true}).map((c) => c.id))
    .toEqual(["monthly", "grace", "plus", "company", "legacy"]);
  expect(filterSaasClients(clients, {plan: ["Start"]}).map((c) => c.id))
    .toEqual(["monthly", "annual", "suspended", "cancelled", "canceled", "inactive"]);
  expect(filterSaasClients(clients.filter((c) => ["annual", "trial", "custom"].includes(c.id)), {paidMonthly: true}))
    .toEqual([]);
});
