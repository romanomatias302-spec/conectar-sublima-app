/* eslint-disable require-jsdoc */

const crypto = require("node:crypto");
const {
  getSaasNotificationTemplate,
  SAAS_NOTIFICATION_EVENTS,
} = require("./saasNotificationCatalog");

const OUTBOX_STATUSES = Object.freeze([
  "pending", "processing", "sent", "failed", "cancelled", "skipped",
]);
const MAX_DELIVERY_ATTEMPTS = 5;
const ALLOWED_VARIABLES = new Set([
  "clienteNombre", "empresa", "plan", "billingCycle", "currency", "price",
  "dueDate", "amount", "paymentDate", "trialEndDate",
]);
const CLIENT_SCOPED_EVENTS = new Set([
  SAAS_NOTIFICATION_EVENTS.CLIENT_CREATED,
  SAAS_NOTIFICATION_EVENTS.TRIAL_STARTED,
  SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_ACTIVATED,
]);

function normalizeRecipient(value) {
  const recipient = String(value || "").trim().toLowerCase();
  if (!recipient) return {recipient: null, errorCode: "MISSING_RECIPIENT"};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return {recipient: null, errorCode: "INVALID_RECIPIENT"};
  }
  return {recipient, errorCode: null};
}

function normalizeVariableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  return null;
}

function sanitizeNotificationPayload(variables = {}) {
  return Object.entries(variables).reduce((payload, [key, value]) => {
    if (!ALLOWED_VARIABLES.has(key)) return payload;
    const normalized = normalizeVariableValue(value);
    if (normalized !== null) payload[key] = normalized;
    return payload;
  }, {});
}

function assertRequiredVariables(template, payload) {
  const missing = template.requiredVariables.filter((key) =>
    payload[key] === undefined || payload[key] === "");
  if (missing.length > 0) {
    const message = `Faltan variables requeridas: ${missing.join(", ")}`;
    const error = new Error(message);
    error.code = "MISSING_TEMPLATE_VARIABLES";
    throw error;
  }
}

function buildNotificationIdempotencyKey({eventType, clienteId, entityId}) {
  if (!eventType || !clienteId) {
    const error = new Error("La notificación requiere eventType y clienteId.");
    error.code = "INVALID_NOTIFICATION_IDENTITY";
    throw error;
  }
  if (!CLIENT_SCOPED_EVENTS.has(eventType) && !entityId) {
    const message = `El evento ${eventType} requiere entityId estable.`;
    const error = new Error(message);
    error.code = "MISSING_NOTIFICATION_ENTITY_ID";
    throw error;
  }
  const identity = [
    "saas", "v1", clienteId, eventType, entityId || "singleton",
  ];
  return identity.join(":");
}

function notificationIdFromKey(idempotencyKey) {
  return crypto.createHash("sha256")
      .update(idempotencyKey)
      .digest("hex");
}

function buildSaasOutboxRecord({
  eventType,
  clienteId,
  entityId = "",
  recipient,
  variables = {},
  now = new Date(),
  scheduledAt = now,
}) {
  const template = getSaasNotificationTemplate(eventType);
  const payload = sanitizeNotificationPayload(variables);
  assertRequiredVariables(template, payload);
  const recipientResult = normalizeRecipient(recipient);
  const idempotencyKey = buildNotificationIdempotencyKey({
    eventType, clienteId, entityId,
  });
  const notificationId = notificationIdFromKey(idempotencyKey);
  return {
    notificationId,
    eventType,
    templateId: template.templateId,
    templateVersion: template.version,
    clienteId,
    recipient: recipientResult.recipient,
    payload,
    status: recipientResult.recipient ? "pending" : "skipped",
    attempts: 0,
    createdAt: now,
    scheduledAt,
    sentAt: null,
    provider: null,
    providerMessageId: null,
    lastErrorCode: recipientResult.errorCode,
    idempotencyKey,
  };
}

function calculateNotificationRetry(attempts, now = new Date()) {
  const count = Number(attempts || 0);
  if (count >= MAX_DELIVERY_ATTEMPTS) {
    return {status: "failed", nextAttemptAt: null};
  }
  const delayMinutes = Math.min(24 * 60, 5 * (2 ** Math.max(0, count - 1)));
  return {
    status: "pending",
    nextAttemptAt: new Date(now.getTime() + delayMinutes * 60000),
  };
}

module.exports = {
  buildNotificationIdempotencyKey,
  buildSaasOutboxRecord,
  calculateNotificationRetry,
  MAX_DELIVERY_ATTEMPTS,
  normalizeRecipient,
  notificationIdFromKey,
  OUTBOX_STATUSES,
  sanitizeNotificationPayload,
};
