/* eslint-disable require-jsdoc */

const {buildSaasOutboxRecord} = require("./saasNotificationCore");

const SAAS_NOTIFICATION_OUTBOX = "saas_notifications_outbox";

function isAlreadyExists(error) {
  return error?.code === 6 || error?.code === "already-exists" ||
    error?.code === "ALREADY_EXISTS";
}

async function enqueueSaasNotification({db, ...input}) {
  if (!db) {
    throw new Error("Firestore es requerido para encolar notificaciones.");
  }
  const record = buildSaasOutboxRecord(input);
  const reference = db.collection(SAAS_NOTIFICATION_OUTBOX)
      .doc(record.notificationId);
  try {
    await reference.create(record);
    return {created: true, record};
  } catch (error) {
    if (isAlreadyExists(error)) {
      return {created: false, duplicate: true, record};
    }
    throw error;
  }
}

async function enqueueSaasNotificationSafely({logger = console, ...input}) {
  try {
    return await enqueueSaasNotification(input);
  } catch (error) {
    logger.error("No se pudo encolar una notificación SaaS.", {
      code: error?.code || "OUTBOX_ERROR",
      eventType: input.eventType,
      clienteId: input.clienteId,
    });
    return {created: false, error: true, code: error?.code || "OUTBOX_ERROR"};
  }
}

module.exports = {
  enqueueSaasNotification,
  enqueueSaasNotificationSafely,
  SAAS_NOTIFICATION_OUTBOX,
};
