"use strict";
/* eslint-disable require-jsdoc, max-len */

const crypto = require("node:crypto");
const {addCycle, deterministicChargeId, formatDate, toUtcDate} =
  require("./saasBillingEngine");
const {sanitizedEventRecord} = require("./hotmartWebhookAdapter");

function stableId(prefix, value) {
  const digest = crypto.createHash("sha256").update(String(value)).digest("hex");
  return `${prefix}_${digest.slice(0, 40)}`;
}

function snapshotToTenant(snapshot) {
  return snapshot?.exists ? {id: snapshot.id, ...snapshot.data()} : null;
}

function movementTotals(docs) {
  const periods = new Map();
  let total = 0;
  for (const snapshot of docs) {
    const movement = snapshot.data();
    if (movement.anulado === true) continue;
    const amount = Number(movement.monto || 0);
    if (!Number.isFinite(amount)) continue;
    const type = movement.tipoMovimiento || "pago";
    if (type === "cargo" || type === "ajuste") total += amount;
    if (type === "pago" || type === "credito") total -= amount;
    const key = String(movement.periodoFacturado || "").trim();
    if (!key) continue;
    const period = periods.get(key) || {
      key,
      charges: 0,
      payments: 0,
      dueDate: movement.fechaVencimiento || null,
      hasActiveCharge: false,
      currencies: new Set(),
    };
    const currency = String(movement.currency || movement.moneda || "")
        .trim().toUpperCase();
    if (currency) period.currencies.add(currency);
    if (type === "cargo" || type === "ajuste") {
      period.charges += amount;
      period.hasActiveCharge = true;
      period.dueDate = movement.fechaVencimiento || period.dueDate;
    }
    if (type === "pago" || type === "credito") period.payments += amount;
    periods.set(key, period);
  }
  return {total, periods};
}

function providerPeriodKey(event) {
  const date = toUtcDate(event.occurredAt || new Date());
  if (!date) return "";
  if (event.billingCycle === "annual") return `${formatDate(date)}-ANUAL`;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextBillingDate(event) {
  const official = toUtcDate(event.nextChargeAt);
  if (official) return formatDate(official);
  const current = toUtcDate(event.occurredAt);
  if (!current) return null;
  return formatDate(addCycle(current, event.billingCycle, 1, current.getUTCDate()));
}

function isAlreadyExists(error) {
  return error?.code === 6 || error?.code === "already-exists" ||
    error?.code === "ALREADY_EXISTS";
}

function createHotmartFirestoreRepository({
  db,
  FieldValue,
  recalculate,
  now = () => new Date(),
}) {
  const clients = db.collection("clientes-saas");
  const movements = db.collection("saas_pagos");
  const events = db.collection("saas_provider_events");

  const eventReference = (event) => events.doc(stableId("hotmart_event", event.eventId));
  const paymentReference = (event) => movements.doc(
      stableId("hotmart_payment", event.transactionId),
  );

  async function getClientAfterRecalculation(tenantId) {
    await recalculate(tenantId);
    return snapshotToTenant(await clients.doc(tenantId).get());
  }

  return {
    async ensureEvent(event) {
      const reference = eventReference(event);
      try {
        await reference.create(sanitizedEventRecord(event, now()));
        return {status: "RECEIVED"};
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const snapshot = await reference.get();
        return snapshot.exists ? snapshot.data() : {status: "RECEIVED"};
      }
    },

    async markPending(event, reasons, tenantId = null) {
      await eventReference(event).set({
        status: "PENDING_RECONCILIATION",
        tenantId,
        reconciliationReasons: [...new Set(reasons)],
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },

    async markProcessed(event, tenantId, result) {
      await eventReference(event).set({
        status: "PROCESSED",
        tenantId,
        movementId: result.payment?.id || result.reversalId || null,
        reconciliationReasons: [],
        processedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },

    async getTenant(tenantId) {
      return snapshotToTenant(await clients.doc(tenantId).get());
    },

    async findTenantsBySubscription(subscriptionId) {
      const queries = await Promise.all([
        clients.where("hotmartSubscriptionId", "==", subscriptionId).get(),
        clients.where("providerSubscriptionId", "==", subscriptionId).get(),
      ]);
      return queries.flatMap((snapshot) => snapshot.docs.map(snapshotToTenant));
    },

    async findTenantsByNormalizedEmail(email) {
      const queries = await Promise.all([
        clients.where("email", "==", email).get(),
        clients.where("emailNormalizado", "==", email).get(),
      ]);
      return queries.flatMap((snapshot) => snapshot.docs.map(snapshotToTenant));
    },

    async applyApprovedPayment(event, tenant) {
      const allMovements = await movements.where("clienteSaasId", "==", tenant.id).get();
      const totals = movementTotals(allMovements.docs);
      const pendingPeriods = [...totals.periods.values()]
          .filter((period) => period.charges - period.payments > 0)
          .sort((left, right) => left.key.localeCompare(right.key));
      const target = pendingPeriods[0] || null;
      if (target?.currencies?.size && !target.currencies.has(event.currency)) {
        return {pendingReason: "PENDING_DEBT_CURRENCY_MISMATCH"};
      }
      const periodKey = target?.key || providerPeriodKey(event);
      if (!periodKey) return {pendingReason: "MISSING_PERIOD_IDENTITY"};
      const paymentRef = paymentReference(event);
      const cargoRef = movements.doc(deterministicChargeId(tenant.id, periodKey));
      const clientRef = clients.doc(tenant.id);
      const transactionResult = await db.runTransaction(async (transaction) => {
        const [clientSnapshot, paymentSnapshot, cargoSnapshot] = await Promise.all([
          transaction.get(clientRef),
          transaction.get(paymentRef),
          transaction.get(cargoRef),
        ]);
        if (!clientSnapshot.exists) return {pendingReason: "TENANT_NOT_FOUND"};
        if (paymentSnapshot.exists) {
          if (paymentSnapshot.data().clienteSaasId !== tenant.id) {
            return {pendingReason: "TRANSACTION_ASSOCIATED_TO_ANOTHER_TENANT"};
          }
          return {
            created: false,
            duplicate: true,
            payment: {id: paymentSnapshot.id, ...paymentSnapshot.data()},
          };
        }
        const timestamp = FieldValue.serverTimestamp();
        if (!target?.hasActiveCharge && !cargoSnapshot.exists) {
          transaction.create(cargoRef, {
            clienteSaasId: tenant.id,
            clienteNombre: tenant.nombre || "",
            tipoMovimiento: "cargo",
            monto: event.amount,
            moneda: event.currency,
            currency: event.currency,
            fechaPago: formatDate(toUtcDate(event.occurredAt)),
            fechaCobro: formatDate(toUtcDate(event.occurredAt)),
            fechaVencimiento: formatDate(toUtcDate(event.occurredAt)),
            concepto: event.billingCycle === "annual" ? "anualidad" : "mensualidad",
            observacion: `Cargo Hotmart - período ${periodKey}`,
            periodoFacturado: periodKey,
            periodKey,
            idempotencyKey: cargoRef.id,
            billingProvider: "hotmart",
            providerSubscriptionId: event.subscriptionId,
            origen: "hotmart",
            anulado: false,
            estado: "activo",
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        const payment = {
          clienteSaasId: tenant.id,
          clienteNombre: tenant.nombre || "",
          tipoMovimiento: "pago",
          monto: event.amount,
          moneda: event.currency,
          currency: event.currency,
          fechaPago: formatDate(toUtcDate(event.occurredAt)),
          medioPago: "hotmart",
          concepto: event.billingCycle === "annual" ? "anualidad" : "mensualidad",
          periodoFacturado: periodKey,
          observacion: "Pago confirmado por Hotmart",
          referenciaExterna: event.transactionId,
          hotmartTransactionId: event.transactionId,
          billingProvider: "hotmart",
          provider: "hotmart",
          providerTransactionId: event.transactionId,
          providerSubscriptionId: event.subscriptionId,
          providerEventId: event.eventId,
          origen: "hotmart",
          anulado: false,
          estado: "activo",
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        transaction.create(paymentRef, payment);
        const nextDate = nextBillingDate(event);
        const planPatch = {
          billingProvider: "hotmart",
          metodoCobro: "hotmart",
          hotmartSubscriptionId: event.subscriptionId,
          providerSubscriptionId: event.subscriptionId,
          hotmartSubscriberCode: event.subscriptionId,
          hotmartLastTransactionId: event.transactionId,
          hotmartLastEventId: event.eventId,
          hotmartSubscriptionStatus: event.subscriptionStatus || "ACTIVE",
          planId: event.planId,
          planNombre: event.planName,
          billingCycle: event.billingCycle,
          frecuenciaCobro: event.billingCycle === "annual" ? "anual" : "mensual",
          currency: event.currency,
          moneda: event.currency,
          price: event.amount,
          planPrecio: event.amount,
          ultimoPago: payment.fechaPago,
          ultimoPeriodoFacturado: periodKey,
          updatedAt: timestamp,
        };
        if (nextDate) {
          planPatch.nextBillingDate = nextDate;
          planPatch.fechaProximoCargo = nextDate;
        }
        transaction.update(clientRef, planPatch);
        return {created: true, payment: {id: paymentRef.id, ...payment}};
      });
      if (transactionResult.pendingReason) return transactionResult;
      if (transactionResult.duplicate) return transactionResult;
      const client = await getClientAfterRecalculation(tenant.id);
      const beforeBalance = Number(tenant.saldoCuentaCorriente || totals.total || 0);
      const afterBalance = Number(client?.saldoCuentaCorriente || 0);
      return {
        ...transactionResult,
        client,
        partial: afterBalance > 0,
        reactivated: tenant.suspendidoPorSistema === true &&
          client?.suspendidoPorSistema !== true && afterBalance <= 0,
        balanceBefore: beforeBalance,
        balanceAfter: afterBalance,
      };
    },

    async recordRejectedPayment(event, tenant) {
      const beforeSuspended = tenant.suspendidoPorSistema === true;
      await clients.doc(tenant.id).update({
        billingProvider: "hotmart",
        metodoCobro: "hotmart",
        ...(event.subscriptionId ? {
          hotmartSubscriptionId: event.subscriptionId,
          providerSubscriptionId: event.subscriptionId,
        } : {}),
        hotmartLastTransactionId: event.transactionId,
        hotmartLastEventId: event.eventId,
        hotmartSubscriptionStatus: event.subscriptionStatus || "OVERDUE",
        updatedAt: FieldValue.serverTimestamp(),
      });
      const client = await getClientAfterRecalculation(tenant.id);
      const balance = Number(client?.saldoCuentaCorriente || 0);
      return {
        client,
        charge: {
          id: event.transactionId,
          periodKey: providerPeriodKey(event),
          amount: balance,
          currency: client?.currency || client?.moneda,
          dueDate: client?.fechaVencimiento,
        },
        pastDue: balance > 0,
        suspended: !beforeSuspended && client?.suspendidoPorSistema === true,
      };
    },

    async reverseApprovedPayment(event, tenant) {
      const paymentRef = paymentReference(event);
      const reversalRef = movements.doc(stableId("hotmart_reversal", event.transactionId));
      const clientRef = clients.doc(tenant.id);
      const result = await db.runTransaction(async (transaction) => {
        const [paymentSnapshot, reversalSnapshot, clientSnapshot] = await Promise.all([
          transaction.get(paymentRef),
          transaction.get(reversalRef),
          transaction.get(clientRef),
        ]);
        if (!clientSnapshot.exists) return {pendingReason: "TENANT_NOT_FOUND"};
        if (!paymentSnapshot.exists) {
          return {pendingReason: "ORIGINAL_PAYMENT_NOT_FOUND"};
        }
        if (paymentSnapshot.data().clienteSaasId !== tenant.id) {
          return {pendingReason: "ORIGINAL_PAYMENT_TENANT_MISMATCH"};
        }
        if (reversalSnapshot.exists) {
          return {duplicate: true, reversalId: reversalRef.id};
        }
        const payment = paymentSnapshot.data();
        const timestamp = FieldValue.serverTimestamp();
        transaction.create(reversalRef, {
          clienteSaasId: tenant.id,
          clienteNombre: tenant.nombre || "",
          tipoMovimiento: "ajuste",
          monto: Number(payment.monto || 0),
          moneda: payment.currency || payment.moneda,
          currency: payment.currency || payment.moneda,
          fechaPago: formatDate(toUtcDate(event.occurredAt || new Date())),
          concepto: event.action === "PAYMENT_CHARGEBACK" ? "chargeback" : "reembolso",
          periodoFacturado: payment.periodoFacturado,
          observacion: event.action === "PAYMENT_CHARGEBACK" ?
            "Chargeback confirmado por Hotmart" : "Reembolso confirmado por Hotmart",
          billingProvider: "hotmart",
          provider: "hotmart",
          providerTransactionId: event.transactionId,
          providerSubscriptionId: event.subscriptionId,
          providerEventId: event.eventId,
          reversesMovementId: paymentRef.id,
          origen: "hotmart",
          anulado: false,
          estado: "activo",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.update(clientRef, {
          hotmartLastEventId: event.eventId,
          hotmartSubscriptionStatus: event.subscriptionStatus ||
            (event.action === "PAYMENT_CHARGEBACK" ? "CHARGEBACK" : "REFUNDED"),
          updatedAt: timestamp,
        });
        return {created: true, reversalId: reversalRef.id};
      });
      if (result.created) await getClientAfterRecalculation(tenant.id);
      return result;
    },

    async recordSubscriptionCancellation(event, tenant) {
      const currentSubscription = String(
          tenant.hotmartSubscriptionId || tenant.providerSubscriptionId || "",
      );
      if (currentSubscription && currentSubscription !== event.subscriptionId) {
        return {pendingReason: "SUBSCRIPTION_ASSOCIATED_TO_ANOTHER_TENANT"};
      }
      await clients.doc(tenant.id).update({
        billingProvider: "hotmart",
        metodoCobro: "hotmart",
        hotmartSubscriptionId: event.subscriptionId,
        providerSubscriptionId: event.subscriptionId,
        hotmartSubscriptionStatus: event.subscriptionStatus || "CANCELLED",
        hotmartRenewalCancelled: true,
        hotmartLastEventId: event.eventId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {changed: true, client: {...tenant, billingProvider: "hotmart"}};
    },

    async recordChargeDateChange(event, tenant) {
      const patch = {
        hotmartLastEventId: event.eventId,
        hotmartSubscriptionStatus: event.subscriptionStatus || null,
        updatedAt: FieldValue.serverTimestamp(),
      };
      const date = nextBillingDate(event);
      if (date) {
        patch.nextBillingDate = date;
        patch.fechaProximoCargo = date;
      }
      await clients.doc(tenant.id).update(patch);
      return {changed: true};
    },
  };
}

module.exports = {
  createHotmartFirestoreRepository,
  movementTotals,
  nextBillingDate,
  providerPeriodKey,
  stableId,
};
