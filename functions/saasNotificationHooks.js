/* eslint-disable require-jsdoc */

const {SAAS_NOTIFICATION_EVENTS} = require("./saasNotificationCatalog");
const {
  enqueueSaasNotificationSafely,
} = require("./saasNotificationOutbox");

function clientVariables(client = {}, overrides = {}) {
  return {
    clienteNombre: client.nombreCliente || client.nombre || "",
    empresa: client.nombre || client.empresa || "",
    plan: client.planNombre || client.plan || "",
    billingCycle: client.billingCycle || client.frecuenciaCobro || "",
    currency: client.currency || client.moneda || "",
    price: client.price ?? client.planPrecio ?? client.mantenimientoMensual,
    ...overrides,
  };
}

function notificationInput(eventType, client, entityId, variables = {}) {
  return {
    eventType,
    clienteId: client.id,
    entityId,
    recipient: client.email,
    variables: clientVariables(client, variables),
  };
}

function createSaasNotificationHooks({db, logger = console}) {
  const enqueue = (input) => enqueueSaasNotificationSafely({
    db, logger, ...input,
  });
  return {
    clientCreated: (client) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.CLIENT_CREATED, client, "")),
    trialStarted: (client) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.TRIAL_STARTED, client, "", {
          trialEndDate: client.trialEndDate || client.fechaVencimiento,
        })),
    trialEnding: (client) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.TRIAL_ENDING, client,
        client.trialEndDate || client.fechaVencimiento, {
          trialEndDate: client.trialEndDate || client.fechaVencimiento,
        })),
    trialExpired: (client) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.TRIAL_EXPIRED, client,
        client.trialEndDate || client.fechaVencimiento)),
    subscriptionActivated: (client) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_ACTIVATED, client, "")),
    planChanged: (client, changeEventId) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
        client, changeEventId)),
    paymentDue: (client, charge) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.PAYMENT_DUE, client, charge.id, {
          currency: charge.currency || charge.moneda,
          amount: charge.monto,
          dueDate: charge.dueDate || charge.fechaVencimiento,
        })),
    paymentReceived: (client, payment) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.PAYMENT_RECEIVED, client, payment.id, {
          currency: payment.currency || payment.moneda,
          amount: payment.monto,
          paymentDate: payment.paymentDate || payment.fechaPago,
        })),
    paymentPartial: (client, payment) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.PAYMENT_PARTIAL, client, payment.id, {
          currency: payment.currency || payment.moneda,
          amount: payment.monto,
          paymentDate: payment.paymentDate || payment.fechaPago,
        })),
    accountPastDue: (client, charge) => enqueue(notificationInput(
        SAAS_NOTIFICATION_EVENTS.ACCOUNT_PAST_DUE,
        client, charge.id || charge.periodKey, {
          currency: charge.currency || charge.moneda,
          amount: charge.amount || charge.monto,
          dueDate: charge.dueDate || charge.fechaVencimiento,
        })),
    accountSuspended: (client, suspensionEventId) => enqueue(
        notificationInput(SAAS_NOTIFICATION_EVENTS.ACCOUNT_SUSPENDED,
            client, suspensionEventId)),
    accountReactivated: (client, reactivationEventId) => enqueue(
        notificationInput(SAAS_NOTIFICATION_EVENTS.ACCOUNT_REACTIVATED,
            client, reactivationEventId)),
    subscriptionCancelled: (client, cancellationEventId) => enqueue(
        notificationInput(SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_CANCELLED,
            client, cancellationEventId)),
  };
}

module.exports = {clientVariables, createSaasNotificationHooks};
