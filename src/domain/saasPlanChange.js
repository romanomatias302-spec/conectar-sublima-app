import {getPlanDefinition, resolveSaasEntitlements} from "./saasPlans";

function lowerCapacity(targetUnlimited, targetLimit, currentUnlimited, currentLimit) {
  if (currentUnlimited) return !targetUnlimited;
  if (targetUnlimited) return false;
  return Number.isInteger(targetLimit) && Number.isInteger(currentLimit) && targetLimit < currentLimit;
}

export function isSaasCapacityDowngrade(currentClient = {}, targetPlanId = "") {
  const current = resolveSaasEntitlements(currentClient);
  const target = resolveSaasEntitlements({planId: targetPlanId});
  if (!target.isKnownPlan || current.planId === target.planId) return false;
  return lowerCapacity(target.unlimitedUsers, target.maxUsers, current.unlimitedUsers, current.maxUsers) ||
    lowerCapacity(target.unlimitedBranches, target.maxBranches, current.unlimitedBranches, current.maxBranches);
}

export function pendingPlanEntitlements(client = {}) {
  if (!client.pendingPlanId) return null;
  const pending = resolveSaasEntitlements({planId: client.pendingPlanId});
  return pending.isKnownPlan ? pending : null;
}

export function evaluateSaasPlanChange({currentClient = {}, targetPlanId = "", usage = {}}) {
  const target = resolveSaasEntitlements({planId: targetPlanId});
  const downgrade = isSaasCapacityDowngrade(currentClient, targetPlanId);
  const usersExceeded = !target.unlimitedUsers && Number(usage.usedUsers || 0) > target.maxUsers;
  const branchesExceeded = !target.unlimitedBranches && Number(usage.activeBranches || 0) > target.maxBranches;
  return {
    target,
    downgrade,
    usersExceeded,
    branchesExceeded,
    pendingRequired: downgrade && (usersExceeded || branchesExceeded),
  };
}

export function pendingPlanFields({planId, billingCycle, price, billingCurrency}) {
  const plan = getPlanDefinition(planId);
  if (!plan) throw new Error("UNKNOWN_PENDING_PLAN");
  return {
    pendingPlanId: plan.id,
    pendingBillingCycle: billingCycle,
    pendingPrice: Number(price),
    pendingBillingCurrency: String(billingCurrency || "USD").toUpperCase(),
    pendingPlanChangeType: "downgrade",
  };
}

export const PENDING_PLAN_FIELD_NAMES = Object.freeze([
  "pendingPlanId",
  "pendingBillingCycle",
  "pendingPrice",
  "pendingBillingCurrency",
  "pendingPlanChangeType",
]);
