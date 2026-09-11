"use strict";
/* eslint-disable require-jsdoc, max-len */

const AUTOMATIC_ACTIONS = new Set([
  "PAYMENT_APPROVED",
  "PAYMENT_REJECTED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK",
  "SUBSCRIPTION_CANCELLED",
  "CHARGE_DATE_CHANGED",
]);

function tenantIdentityIsValid(tenant) {
  if (!tenant?.id) return false;
  const embedded = String(tenant.clienteId || "").trim();
  return !embedded || embedded === tenant.id;
}

function uniqueTenants(tenants = []) {
  return [...new Map(tenants.filter(Boolean).map((item) => [item.id, item])).values()];
}

async function resolveHotmartTenant(event, repository) {
  const explicitTenant = event.explicitTenantId ?
    await repository.getTenant(event.explicitTenantId) : null;
  const subscriptionMatches = event.subscriptionId ?
    uniqueTenants(await repository.findTenantsBySubscription(event.subscriptionId)) : [];

  if (explicitTenant) {
    if (!tenantIdentityIsValid(explicitTenant)) {
      return {status: "PENDING_RECONCILIATION", reasons: ["TENANT_IDENTITY_MISMATCH"]};
    }
    if (subscriptionMatches.some((tenant) => tenant.id !== explicitTenant.id)) {
      return {
        status: "PENDING_RECONCILIATION",
        reasons: ["SUBSCRIPTION_ASSOCIATED_TO_ANOTHER_TENANT"],
      };
    }
    const tenantEmail = String(
        explicitTenant.emailNormalizado || explicitTenant.email || "",
    ).trim().toLowerCase();
    const storedAssociationKey = String(
        explicitTenant.hotmartAssociationKey || "",
    ).trim();
    const associationKeyMatches = storedAssociationKey &&
      storedAssociationKey === String(event.trackingExternalCode || "").trim();
    const buyerMatches = tenantEmail && tenantEmail === event.buyerEmail;
    if (!associationKeyMatches && !buyerMatches) {
      return {
        status: "PENDING_RECONCILIATION",
        reasons: ["EXPLICIT_ASSOCIATION_NOT_VERIFIED"],
      };
    }
    return {status: "RESOLVED", tenant: explicitTenant, source: "explicit_tracking"};
  }

  if (event.explicitTenantId && !explicitTenant) {
    return {status: "PENDING_RECONCILIATION", reasons: ["TENANT_NOT_FOUND"]};
  }
  if (subscriptionMatches.length > 1) {
    return {status: "PENDING_RECONCILIATION", reasons: ["AMBIGUOUS_SUBSCRIPTION"]};
  }
  if (subscriptionMatches.length === 1) {
    const tenant = subscriptionMatches[0];
    if (!tenantIdentityIsValid(tenant)) {
      return {status: "PENDING_RECONCILIATION", reasons: ["TENANT_IDENTITY_MISMATCH"]};
    }
    return {status: "RESOLVED", tenant, source: "subscription"};
  }

  if (!event.buyerEmail) {
    return {status: "PENDING_RECONCILIATION", reasons: ["TENANT_NOT_FOUND"]};
  }
  const emailMatches = uniqueTenants(
      await repository.findTenantsByNormalizedEmail(event.buyerEmail),
  );
  if (emailMatches.length === 0) {
    return {status: "PENDING_RECONCILIATION", reasons: ["TENANT_NOT_FOUND"]};
  }
  if (emailMatches.length > 1) {
    return {status: "PENDING_RECONCILIATION", reasons: ["AMBIGUOUS_EMAIL"]};
  }
  if (!tenantIdentityIsValid(emailMatches[0])) {
    return {status: "PENDING_RECONCILIATION", reasons: ["TENANT_IDENTITY_MISMATCH"]};
  }
  return {status: "RESOLVED", tenant: emailMatches[0], source: "unique_email"};
}

function associationIssues(event, tenant, resolutionSource = "") {
  const reasons = [];
  const provider = String(tenant.billingProvider || tenant.metodoCobro || "")
      .trim().toLowerCase();
  const currentSubscription = String(
      tenant.hotmartSubscriptionId || tenant.providerSubscriptionId || "",
  ).trim();
  const status = String(
      tenant.subscriptionStatus || tenant.estadoSuscripcion || tenant.estado || "",
  ).trim().toLowerCase();
  const active = !["cancelled", "cancelado", "inactivo"].includes(status);

  if (provider && !["hotmart", "manual"].includes(provider) && active) {
    reasons.push("ACTIVE_BILLING_PROVIDER_CONFLICT");
  }
  if (currentSubscription && event.subscriptionId &&
      currentSubscription !== event.subscriptionId && active) {
    reasons.push("SECOND_ACTIVE_SUBSCRIPTION");
  }
  const tenantCurrency = String(
      tenant.billingCurrency || tenant.currency || "USD",
  )
      .trim().toUpperCase();
  if (event.action === "PAYMENT_APPROVED" && tenantCurrency &&
      event.currency && tenantCurrency !== event.currency) {
    reasons.push("TENANT_CURRENCY_MISMATCH");
  }
  const currentPlan = String(tenant.planId || "").trim().toLowerCase();
  if (event.action === "PAYMENT_APPROVED" && currentPlan === "legacy") {
    reasons.push("LEGACY_AUTO_CONVERSION_BLOCKED");
  }
  if (event.action === "PAYMENT_APPROVED" && currentPlan === "trial" &&
      resolutionSource !== "explicit_tracking") {
    reasons.push("TRIAL_AUTO_CONVERSION_BLOCKED");
  }
  if (event.action === "PAYMENT_APPROVED" && currentPlan &&
      !["trial", "legacy", event.planId].includes(currentPlan)) {
    reasons.push("TENANT_PLAN_MISMATCH");
  }
  const currentCycle = String(tenant.billingCycle || "").trim().toLowerCase();
  if (event.action === "PAYMENT_APPROVED" && currentCycle &&
      currentCycle !== event.billingCycle) {
    reasons.push("TENANT_BILLING_CYCLE_MISMATCH");
  }
  return reasons;
}

async function processHotmartEvent({event, repository, notifications = null}) {
  const existing = await repository.ensureEvent(event);
  if (existing?.status === "PROCESSED") {
    return {ok: true, duplicate: true, status: "PROCESSED"};
  }

  const structuralIssues = event.issues.map((issue) => issue.code);
  if (!AUTOMATIC_ACTIONS.has(event.action)) {
    if (!structuralIssues.includes("UNSUPPORTED_EVENT")) {
      structuralIssues.push("EVENT_REQUIRES_MANUAL_RECONCILIATION");
    }
  }
  if (structuralIssues.length > 0) {
    await repository.markPending(event, structuralIssues);
    return {ok: true, status: "PENDING_RECONCILIATION", reasons: structuralIssues};
  }

  const resolution = await resolveHotmartTenant(event, repository);
  if (resolution.status !== "RESOLVED") {
    await repository.markPending(event, resolution.reasons);
    return {ok: true, status: resolution.status, reasons: resolution.reasons};
  }
  const {tenant} = resolution;
  const hasExistingSubscription = String(
      tenant.hotmartSubscriptionId || tenant.providerSubscriptionId || "",
  ).trim() === event.subscriptionId;
  const conflicts = associationIssues(event, tenant, resolution.source);
  if (event.action !== "PAYMENT_APPROVED" &&
      resolution.source === "unique_email" && !hasExistingSubscription) {
    conflicts.push("EVENT_REQUIRES_EXISTING_ASSOCIATION");
  }
  if (conflicts.length > 0) {
    await repository.markPending(event, conflicts, tenant.id);
    return {ok: true, status: "PENDING_RECONCILIATION", reasons: conflicts};
  }

  let result;
  if (event.action === "PAYMENT_APPROVED") {
    result = await repository.applyApprovedPayment(event, tenant);
    if (result.pendingReason) {
      await repository.markPending(event, [result.pendingReason], tenant.id);
      return {
        ok: true,
        status: "PENDING_RECONCILIATION",
        reasons: [result.pendingReason],
      };
    }
    if (result.created && notifications) {
      const notification = result.partial ? notifications.paymentPartial :
        notifications.paymentReceived;
      await notification(result.client, result.payment);
      if (result.reactivated) {
        await notifications.accountReactivated(result.client, event.eventId);
      }
    }
  } else if (event.action === "PAYMENT_REJECTED") {
    result = await repository.recordRejectedPayment(event, tenant);
    if (result.pastDue && notifications) {
      await notifications.accountPastDue(result.client, result.charge);
    }
    if (result.suspended && notifications) {
      await notifications.accountSuspended(result.client, event.eventId);
    }
  } else if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK"]
      .includes(event.action)) {
    result = await repository.reverseApprovedPayment(event, tenant);
    if (result.pendingReason) {
      await repository.markPending(event, [result.pendingReason], tenant.id);
      return {
        ok: true,
        status: "PENDING_RECONCILIATION",
        reasons: [result.pendingReason],
      };
    }
  } else if (event.action === "SUBSCRIPTION_CANCELLED") {
    result = await repository.recordSubscriptionCancellation(event, tenant);
    if (result.changed && notifications) {
      await notifications.subscriptionCancelled(result.client, event.eventId);
    }
  } else if (event.action === "CHARGE_DATE_CHANGED") {
    result = await repository.recordChargeDateChange(event, tenant);
  }

  if (result?.pendingReason) {
    await repository.markPending(event, [result.pendingReason], tenant.id);
    return {
      ok: true,
      status: "PENDING_RECONCILIATION",
      reasons: [result.pendingReason],
    };
  }

  await repository.markProcessed(event, tenant.id, result || {});
  return {
    ok: true,
    status: "PROCESSED",
    tenantId: tenant.id,
    duplicate: result?.duplicate === true,
  };
}

module.exports = {
  associationIssues,
  processHotmartEvent,
  resolveHotmartTenant,
  tenantIdentityIsValid,
};
