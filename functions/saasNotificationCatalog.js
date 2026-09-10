/* eslint-disable require-jsdoc */

const SAAS_NOTIFICATION_EVENTS = Object.freeze({
  CLIENT_CREATED: "CLIENT_CREATED",
  TRIAL_STARTED: "TRIAL_STARTED",
  TRIAL_ENDING: "TRIAL_ENDING",
  TRIAL_EXPIRED: "TRIAL_EXPIRED",
  SUBSCRIPTION_ACTIVATED: "SUBSCRIPTION_ACTIVATED",
  SUBSCRIPTION_PLAN_CHANGED: "SUBSCRIPTION_PLAN_CHANGED",
  PAYMENT_DUE: "PAYMENT_DUE",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_PARTIAL: "PAYMENT_PARTIAL",
  ACCOUNT_PAST_DUE: "ACCOUNT_PAST_DUE",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_REACTIVATED: "ACCOUNT_REACTIVATED",
  SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",
});

function template(templateId, eventType, subject, requiredVariables = []) {
  return Object.freeze({
    templateId,
    eventType,
    subject,
    requiredVariables: Object.freeze(requiredVariables),
    version: 1,
  });
}

const SAAS_NOTIFICATION_TEMPLATES = Object.freeze({
  [SAAS_NOTIFICATION_EVENTS.CLIENT_CREATED]: template(
      "welcome", SAAS_NOTIFICATION_EVENTS.CLIENT_CREATED,
      "Te damos la bienvenida a Zalfro", ["clienteNombre"]),
  [SAAS_NOTIFICATION_EVENTS.TRIAL_STARTED]: template(
      "trial_started", SAAS_NOTIFICATION_EVENTS.TRIAL_STARTED,
      "Comenzó tu período de prueba", ["clienteNombre", "trialEndDate"]),
  [SAAS_NOTIFICATION_EVENTS.TRIAL_ENDING]: template(
      "trial_ending", SAAS_NOTIFICATION_EVENTS.TRIAL_ENDING,
      "Tu período de prueba está por finalizar", ["trialEndDate"]),
  [SAAS_NOTIFICATION_EVENTS.TRIAL_EXPIRED]: template(
      "trial_expired", SAAS_NOTIFICATION_EVENTS.TRIAL_EXPIRED,
      "Finalizó tu período de prueba"),
  [SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_ACTIVATED]: template(
      "subscription_activated",
      SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_ACTIVATED,
      "Tu suscripción está activa", ["plan", "billingCycle"]),
  [SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_PLAN_CHANGED]: template(
      "plan_changed", SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
      "Actualizamos tu plan", ["plan"]),
  [SAAS_NOTIFICATION_EVENTS.PAYMENT_DUE]: template(
      "payment_due", SAAS_NOTIFICATION_EVENTS.PAYMENT_DUE,
      "Tu próximo pago de Zalfro", ["currency", "amount", "dueDate"]),
  [SAAS_NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: template(
      "payment_received", SAAS_NOTIFICATION_EVENTS.PAYMENT_RECEIVED,
      "Recibimos tu pago", ["currency", "amount", "paymentDate"]),
  [SAAS_NOTIFICATION_EVENTS.PAYMENT_PARTIAL]: template(
      "payment_partial", SAAS_NOTIFICATION_EVENTS.PAYMENT_PARTIAL,
      "Registramos un pago parcial", ["currency", "amount", "paymentDate"]),
  [SAAS_NOTIFICATION_EVENTS.ACCOUNT_PAST_DUE]: template(
      "account_past_due", SAAS_NOTIFICATION_EVENTS.ACCOUNT_PAST_DUE,
      "Tu cuenta tiene un pago pendiente", ["currency", "amount", "dueDate"]),
  [SAAS_NOTIFICATION_EVENTS.ACCOUNT_SUSPENDED]: template(
      "account_suspended", SAAS_NOTIFICATION_EVENTS.ACCOUNT_SUSPENDED,
      "Tu cuenta de Zalfro fue suspendida"),
  [SAAS_NOTIFICATION_EVENTS.ACCOUNT_REACTIVATED]: template(
      "account_reactivated", SAAS_NOTIFICATION_EVENTS.ACCOUNT_REACTIVATED,
      "Tu cuenta de Zalfro fue reactivada"),
  [SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_CANCELLED]: template(
      "subscription_cancelled",
      SAAS_NOTIFICATION_EVENTS.SUBSCRIPTION_CANCELLED,
      "Tu suscripción fue cancelada"),
});

function getSaasNotificationTemplate(eventType) {
  const selected = SAAS_NOTIFICATION_TEMPLATES[eventType];
  if (!selected) {
    const error = new Error(`Evento de notificación desconocido: ${eventType}`);
    error.code = "UNKNOWN_NOTIFICATION_EVENT";
    throw error;
  }
  return selected;
}

module.exports = {
  getSaasNotificationTemplate,
  SAAS_NOTIFICATION_EVENTS,
  SAAS_NOTIFICATION_TEMPLATES,
};
