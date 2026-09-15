import {
  evaluateSaasPlanChange,
  isSaasCapacityDowngrade,
  pendingPlanEntitlements,
  pendingPlanFields,
} from "./saasPlanChange";
import {resolveSaasEntitlements} from "./saasPlans";

test("upgrade y downgrade dentro del límite se aplican inmediatamente", () => {
  expect(evaluateSaasPlanChange({currentClient: {planId: "start"}, targetPlanId: "profesional", usage: {usedUsers: 2, activeBranches: 1}}).pendingRequired).toBe(false);
  expect(evaluateSaasPlanChange({currentClient: {planId: "profesional_plus"}, targetPlanId: "profesional", usage: {usedUsers: 5, activeBranches: 2}}).pendingRequired).toBe(false);
});

test("downgrade con sobrecupo queda pendiente sin cambiar el plan efectivo", () => {
  const current = {planId: "profesional_plus"};
  const result = evaluateSaasPlanChange({currentClient: current, targetPlanId: "profesional", usage: {usedUsers: 10, activeBranches: 5}});
  expect(result).toMatchObject({downgrade: true, pendingRequired: true, usersExceeded: true, branchesExceeded: true});
  const pending = pendingPlanFields({planId: "profesional", billingCycle: "monthly", price: 39, billingCurrency: "USD"});
  expect(pending.pendingPlanId).toBe("profesional");
  expect(resolveSaasEntitlements({...current, ...pending}).planId).toBe("profesional_plus");
  expect(pendingPlanEntitlements({...current, ...pending}).planId).toBe("profesional");
});

test("legacy a plan moderno usa el mismo mecanismo y legacy continúa ilimitado mientras está pendiente", () => {
  expect(isSaasCapacityDowngrade({planId: "legacy"}, "start")).toBe(true);
  const client = {planId: "legacy", pendingPlanId: "start"};
  expect(resolveSaasEntitlements(client).unlimitedUsers).toBe(true);
  expect(pendingPlanEntitlements(client).maxUsers).toBe(2);
});

test("el estado pendiente conserva moneda y precio futuros separados", () => {
  expect(pendingPlanFields({planId: "start", billingCycle: "annual", price: 200, billingCurrency: "ARS"}))
    .toEqual({pendingPlanId: "start", pendingBillingCycle: "annual", pendingPrice: 200, pendingBillingCurrency: "ARS", pendingPlanChangeType: "downgrade"});
});

test("billing y moneda operativa continúan leyendo únicamente valores efectivos", () => {
  const effective = resolveSaasEntitlements({
    planId: "profesional_plus", price: 79, billingCurrency: "USD", moneda: "ARS",
    pendingPlanId: "start", pendingPrice: 19, pendingBillingCurrency: "ARS",
  });
  expect(effective).toMatchObject({planId: "profesional_plus", price: 79, currency: "USD"});
});
