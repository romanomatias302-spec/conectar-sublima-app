"use strict";
/* eslint-disable require-jsdoc, max-len */

const crypto = require("node:crypto");
const {SUPPORTED_CURRENCY_SET} = require("./saasCurrencies");
const {
  getSaasPlan,
  isSupportedBillingCycle,
} = require("./saasPlanCatalog");

const HOTMART_EVENTS = Object.freeze({
  PURCHASE_APPROVED: "PURCHASE_APPROVED",
  PURCHASE_COMPLETE: "PURCHASE_COMPLETE",
  PURCHASE_CANCELED: "PURCHASE_CANCELED",
  PURCHASE_DELAYED: "PURCHASE_DELAYED",
  PURCHASE_REFUNDED: "PURCHASE_REFUNDED",
  PURCHASE_CHARGEBACK: "PURCHASE_CHARGEBACK",
  SUBSCRIPTION_CANCELLATION: "SUBSCRIPTION_CANCELLATION",
  SWITCH_PLAN: "SWITCH_PLAN",
  UPDATE_SUBSCRIPTION_CHARGE_DATE: "UPDATE_SUBSCRIPTION_CHARGE_DATE",
});

const EVENT_ACTIONS = Object.freeze({
  [HOTMART_EVENTS.PURCHASE_APPROVED]: "PAYMENT_APPROVED",
  [HOTMART_EVENTS.PURCHASE_COMPLETE]: "PAYMENT_APPROVED",
  // A cancelled purchase is not the same financial signal as an overdue
  // recurring charge. Keep it auditable instead of inventing a debt effect.
  [HOTMART_EVENTS.PURCHASE_CANCELED]: "PURCHASE_CANCELLED",
  [HOTMART_EVENTS.PURCHASE_DELAYED]: "PAYMENT_REJECTED",
  [HOTMART_EVENTS.PURCHASE_REFUNDED]: "PAYMENT_REFUNDED",
  [HOTMART_EVENTS.PURCHASE_CHARGEBACK]: "PAYMENT_CHARGEBACK",
  [HOTMART_EVENTS.SUBSCRIPTION_CANCELLATION]: "SUBSCRIPTION_CANCELLED",
  [HOTMART_EVENTS.SWITCH_PLAN]: "PLAN_CHANGED",
  [HOTMART_EVENTS.UPDATE_SUBSCRIPTION_CHARGE_DATE]: "CHARGE_DATE_CHANGED",
});

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function secureTokenEquals(received, expected) {
  const left = Buffer.from(text(received));
  const right = Buffer.from(text(expected));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function trackingValue(tracking, key) {
  if (!tracking || typeof tracking !== "object" || Array.isArray(tracking)) {
    return "";
  }
  return text(tracking[key]);
}

function extractTracking(data) {
  const tracking = data?.purchase?.tracking || data?.tracking || {};
  return {
    planId: trackingValue(tracking, "plan_id").toLowerCase(),
    billingCycle: trackingValue(tracking, "billing_cycle").toLowerCase(),
    tenantId: firstText(
        trackingValue(tracking, "tenant_id"),
        trackingValue(tracking, "cliente_id"),
    ),
    source: firstText(tracking.source_sck, tracking.source),
    externalCode: text(tracking.external_code),
  };
}

function extractSubscriptionId(data) {
  return firstText(
      data?.subscription?.subscriber?.code,
      data?.subscriber?.code,
      data?.subscription?.subscriber_code,
  );
}

function extractPurchaseCurrency(purchase) {
  return firstText(
      purchase?.price?.currency_code,
      purchase?.price?.currency_value,
      purchase?.currency,
  ).toUpperCase();
}

function validationIssue(code, details = {}) {
  return {code, ...details};
}

function normalizeHotmartWebhook(payload = {}) {
  const data = payload.data || {};
  const purchase = data.purchase || {};
  const eventType = text(payload.event).toUpperCase();
  const action = EVENT_ACTIONS[eventType] || "UNSUPPORTED";
  const tracking = extractTracking(data);
  const plan = getSaasPlan(tracking.planId);
  const amount = numberOrNull(purchase?.price?.value);
  const currency = extractPurchaseCurrency(purchase);
  const transactionId = text(purchase.transaction);
  const eventId = text(payload.id);
  const subscriptionId = extractSubscriptionId(data);
  const buyerEmail = normalizeEmail(
      data?.buyer?.email || data?.subscriber?.email ||
      data?.subscription?.subscriber?.email,
  );
  const occurredAt = dateOrNull(
      purchase.approved_date || purchase.order_date || payload.creation_date,
  );
  const recurrenceNumber = numberOrNull(purchase.recurrency_number);
  const issues = [];

  if (!eventId) issues.push(validationIssue("MISSING_EVENT_ID"));
  if (text(payload.version) !== "2.0.0") {
    issues.push(validationIssue("UNSUPPORTED_WEBHOOK_VERSION"));
  }
  if (action === "UNSUPPORTED") {
    issues.push(validationIssue("UNSUPPORTED_EVENT", {eventType}));
  }

  const purchaseAction = [
    "PAYMENT_APPROVED", "PAYMENT_REJECTED", "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK",
  ].includes(action);
  if (purchaseAction && !transactionId) {
    issues.push(validationIssue("MISSING_TRANSACTION_ID"));
  }
  if (purchaseAction && !subscriptionId) {
    issues.push(validationIssue("MISSING_SUBSCRIPTION_ID"));
  }

  if (action === "PAYMENT_APPROVED") {
    if (!plan) issues.push(validationIssue("INVALID_PLAN_ID"));
    if (!isSupportedBillingCycle(tracking.billingCycle)) {
      issues.push(validationIssue("INVALID_BILLING_CYCLE"));
    }
    if (!SUPPORTED_CURRENCY_SET.has(currency)) {
      issues.push(validationIssue("UNSUPPORTED_CURRENCY", {currency}));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      issues.push(validationIssue("INVALID_AMOUNT"));
    }
    if (!occurredAt) issues.push(validationIssue("INVALID_PURCHASE_DATE"));
  }

  if (action === "PAYMENT_REFUNDED" &&
      text(purchase.status).toUpperCase() === "PARTIALLY_REFUNDED") {
    issues.push(validationIssue("PARTIAL_REFUND_REQUIRES_RECONCILIATION"));
  }

  if (["SUBSCRIPTION_CANCELLED", "CHARGE_DATE_CHANGED", "PLAN_CHANGED"]
      .includes(action) && !subscriptionId) {
    issues.push(validationIssue("MISSING_SUBSCRIPTION_ID"));
  }

  return {
    provider: "hotmart",
    eventId,
    eventType,
    action,
    version: text(payload.version),
    transactionId,
    subscriptionId,
    productId: firstText(data?.product?.id, data?.subscription?.product?.id),
    offerCode: firstText(purchase?.offer?.code, data?.plan?.offer?.code),
    planId: plan?.id || tracking.planId,
    planName: plan?.name || "",
    billingCycle: tracking.billingCycle,
    explicitTenantId: tracking.tenantId,
    buyerEmail,
    amount,
    currency,
    recurrenceNumber,
    occurredAt,
    nextChargeAt: dateOrNull(data?.subscription?.date_next_charge),
    subscriptionStatus: text(data?.subscription?.status).toUpperCase(),
    trackingSource: tracking.source,
    trackingExternalCode: tracking.externalCode,
    issues,
  };
}

function sanitizedEventRecord(event, now = new Date()) {
  return {
    provider: "hotmart",
    providerEventId: event.eventId,
    providerEventType: event.eventType,
    providerTransactionId: event.transactionId || null,
    providerSubscriptionId: event.subscriptionId || null,
    productId: event.productId || null,
    offerCode: event.offerCode || null,
    action: event.action,
    status: "RECEIVED",
    reconciliationReasons: event.issues.map((issue) => issue.code),
    receivedAt: now,
    updatedAt: now,
  };
}

module.exports = {
  EVENT_ACTIONS,
  HOTMART_EVENTS,
  normalizeEmail,
  normalizeHotmartWebhook,
  sanitizedEventRecord,
  secureTokenEquals,
};
