"use strict";
/* eslint-disable require-jsdoc, max-len */

const {
  normalizeHotmartWebhook,
  secureTokenEquals,
} = require("./hotmartWebhookAdapter");
const {processHotmartEvent} = require("./hotmartBillingCore");

function send(res, status, body) {
  res.status(status).json(body);
}

function createHotmartWebhookHandler({
  expectedHottok,
  repository,
  notifications = null,
  logger = console,
}) {
  return async (req, res) => {
    if (req.method !== "POST") {
      send(res, 405, {ok: false, error: "METHOD_NOT_ALLOWED"});
      return;
    }
    const receivedHottok = req.headers?.["x-hotmart-hottok"] ||
      req.get?.("X-HOTMART-HOTTOK");
    const configuredHottok = typeof expectedHottok === "function" ?
      expectedHottok() : expectedHottok;
    if (!secureTokenEquals(receivedHottok, configuredHottok)) {
      logger.warn("Webhook Hotmart rechazado por autenticación.");
      send(res, 401, {ok: false, error: "INVALID_WEBHOOK_AUTHENTICATION"});
      return;
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      send(res, 400, {ok: false, error: "INVALID_PAYLOAD"});
      return;
    }

    const event = normalizeHotmartWebhook(req.body);
    if (!event.eventId || event.version !== "2.0.0") {
      send(res, 400, {ok: false, error: "INVALID_WEBHOOK_ENVELOPE"});
      return;
    }

    try {
      const result = await processHotmartEvent({
        event,
        repository,
        notifications,
      });
      logger.info("Webhook Hotmart procesado.", {
        eventId: event.eventId,
        eventType: event.eventType,
        status: result.status,
        tenantId: result.tenantId || null,
        duplicate: result.duplicate === true,
      });
      send(res, 200, {
        ok: true,
        status: result.status,
        duplicate: result.duplicate === true,
      });
    } catch (error) {
      logger.error("Falló el procesamiento del webhook Hotmart.", {
        eventId: event.eventId,
        eventType: event.eventType,
        code: error?.code || "HOTMART_PROCESSING_ERROR",
      });
      send(res, 500, {ok: false, error: "HOTMART_PROCESSING_ERROR"});
    }
  };
}

module.exports = {createHotmartWebhookHandler};
