"use strict";
/* eslint-disable require-jsdoc, max-len */

const test = require("node:test");
const assert = require("node:assert/strict");
const {processHotmartEvent} = require("./hotmartBillingCore");

function event(overrides = {}) {
  return {
    provider: "hotmart",
    eventId: "event-1",
    eventType: "PURCHASE_APPROVED",
    action: "PAYMENT_APPROVED",
    transactionId: "HP-1",
    subscriptionId: "SUB-1",
    planId: "start",
    planName: "Start",
    billingCycle: "monthly",
    explicitTenantId: "",
    buyerEmail: "owner@example.com",
    amount: 100,
    currency: "ARS",
    issues: [],
    ...overrides,
  };
}

function fakeRepository(tenantOverrides = {}) {
  const tenant = {
    id: "tenant-1",
    clienteId: "tenant-1",
    email: "owner@example.com",
    planId: "start",
    billingCycle: "monthly",
    currency: "ARS",
    billingProvider: "hotmart",
    hotmartSubscriptionId: "SUB-1",
    subscriptionStatus: "active",
    saldoCuentaCorriente: 100,
    ...tenantOverrides,
  };
  const state = {
    events: new Map(),
    payments: new Map(),
    reversals: new Set(),
    approvedCalls: 0,
    rejectedCalls: 0,
    cancellations: 0,
    chargeDateChanges: 0,
    pending: [],
  };
  return {
    state,
    tenant,
    async ensureEvent(input) {
      return state.events.get(input.eventId) || {status: "RECEIVED"};
    },
    async markPending(input, reasons, tenantId = null) {
      state.pending.push({eventId: input.eventId, reasons, tenantId});
      state.events.set(input.eventId, {status: "PENDING_RECONCILIATION"});
    },
    async markProcessed(input) {
      state.events.set(input.eventId, {status: "PROCESSED"});
    },
    async getTenant(id) {
      return id === tenant.id ? tenant : null;
    },
    async findTenantsBySubscription(subscriptionId) {
      return tenant.hotmartSubscriptionId === subscriptionId ? [tenant] : [];
    },
    async findTenantsByNormalizedEmail(email) {
      if (tenant.email === email) return [tenant];
      return [];
    },
    async applyApprovedPayment(input) {
      state.approvedCalls += 1;
      if (state.payments.has(input.transactionId)) {
        return {created: false, duplicate: true};
      }
      const payment = {
        id: `payment-${input.transactionId}`,
        monto: input.amount,
        currency: input.currency,
        providerTransactionId: input.transactionId,
      };
      state.payments.set(input.transactionId, payment);
      const balance = Number(tenant.saldoCuentaCorriente || 0) - input.amount;
      const reactivated = tenant.suspendidoPorSistema === true && balance <= 0;
      const client = {
        ...tenant,
        saldoCuentaCorriente: balance,
        suspendidoPorSistema: reactivated ? false : tenant.suspendidoPorSistema,
      };
      return {
        created: true,
        payment,
        client,
        partial: balance > 0,
        reactivated,
      };
    },
    async recordRejectedPayment() {
      state.rejectedCalls += 1;
      return {client: tenant, charge: {id: "charge-1"}, pastDue: true, suspended: false};
    },
    async reverseApprovedPayment(input) {
      if (!state.payments.has(input.transactionId)) {
        return {pendingReason: "ORIGINAL_PAYMENT_NOT_FOUND"};
      }
      if (state.reversals.has(input.transactionId)) return {duplicate: true};
      state.reversals.add(input.transactionId);
      return {created: true, reversalId: `reversal-${input.transactionId}`};
    },
    async recordSubscriptionCancellation(input) {
      state.cancellations += 1;
      return {changed: true, client: tenant};
    },
    async recordChargeDateChange() {
      state.chargeDateChanges += 1;
      return {changed: true};
    },
  };
}

function notificationDouble() {
  const calls = {received: 0, partial: 0, reactivated: 0, pastDue: 0, suspended: 0, cancelled: 0};
  return {
    calls,
    paymentReceived: async () => calls.received++,
    paymentPartial: async () => calls.partial++,
    accountReactivated: async () => calls.reactivated++,
    accountPastDue: async () => calls.pastDue++,
    accountSuspended: async () => calls.suspended++,
    subscriptionCancelled: async () => calls.cancelled++,
  };
}

test("compra inicial y recurrencia aprobadas generan un pago por transacción", async () => {
  const repository = fakeRepository();
  await processHotmartEvent({event: event(), repository});
  await processHotmartEvent({
    event: event({eventId: "event-2", transactionId: "HP-2", recurrenceNumber: 2}),
    repository,
  });
  assert.equal(repository.state.payments.size, 2);
  assert.equal(repository.state.approvedCalls, 2);
});

test("webhook duplicado y retry no duplican pago", async () => {
  const repository = fakeRepository();
  const first = await processHotmartEvent({event: event(), repository});
  const retry = await processHotmartEvent({event: event({eventId: "event-retry"}), repository});
  const duplicateEvent = await processHotmartEvent({event: event(), repository});
  assert.equal(first.status, "PROCESSED");
  assert.equal(retry.duplicate, true);
  assert.equal(duplicateEvent.duplicate, true);
  assert.equal(repository.state.payments.size, 1);
});

test("rechazo no crea cargo ni pago y conserva gracia en el repositorio", async () => {
  const repository = fakeRepository();
  const result = await processHotmartEvent({
    event: event({action: "PAYMENT_REJECTED", eventType: "PURCHASE_DELAYED"}),
    repository,
  });
  assert.equal(result.status, "PROCESSED");
  assert.equal(repository.state.rejectedCalls, 1);
  assert.equal(repository.state.payments.size, 0);
});

test("pago parcial no reactiva y pago total sí reactiva", async () => {
  const partialRepository = fakeRepository({
    saldoCuentaCorriente: 150,
    suspendidoPorSistema: true,
    subscriptionStatus: "suspended",
  });
  const partialNotifications = notificationDouble();
  await processHotmartEvent({
    event: event(), repository: partialRepository, notifications: partialNotifications,
  });
  assert.equal(partialNotifications.calls.partial, 1);
  assert.equal(partialNotifications.calls.reactivated, 0);

  const fullRepository = fakeRepository({
    saldoCuentaCorriente: 100,
    suspendidoPorSistema: true,
    subscriptionStatus: "suspended",
  });
  const fullNotifications = notificationDouble();
  await processHotmartEvent({
    event: event(), repository: fullRepository, notifications: fullNotifications,
  });
  assert.equal(fullNotifications.calls.received, 1);
  assert.equal(fullNotifications.calls.reactivated, 1);
});

test("plan, ciclo o moneda inválidos quedan pendientes", async () => {
  for (const reason of ["INVALID_PLAN_ID", "INVALID_BILLING_CYCLE", "UNSUPPORTED_CURRENCY"] ) {
    const repository = fakeRepository();
    const result = await processHotmartEvent({
      event: event({issues: [{code: reason}]}),
      repository,
    });
    assert.equal(result.status, "PENDING_RECONCILIATION");
    assert.deepEqual(repository.state.pending[0].reasons, [reason]);
  }
});

test("la asociación compara moneda SaaS y nunca la moneda operativa", async () => {
  const repository = fakeRepository({
    billingCurrency: "USD",
    currency: "ARS",
    moneda: "MXN",
  });
  const result = await processHotmartEvent({
    event: event({currency: "USD"}),
    repository,
  });
  assert.equal(result.status, "PROCESSED");
  assert.equal(repository.state.approvedCalls, 1);
});

test("email ambiguo y tenant inexistente nunca se asocian arbitrariamente", async () => {
  const ambiguous = fakeRepository({hotmartSubscriptionId: ""});
  ambiguous.findTenantsByNormalizedEmail = async () => [
    ambiguous.tenant,
    {...ambiguous.tenant, id: "tenant-2"},
  ];
  const ambiguousResult = await processHotmartEvent({event: event(), repository: ambiguous});
  assert.deepEqual(ambiguousResult.reasons, ["AMBIGUOUS_EMAIL"]);

  const missing = fakeRepository({hotmartSubscriptionId: "", email: "other@example.com"});
  const missingResult = await processHotmartEvent({event: event(), repository: missing});
  assert.deepEqual(missingResult.reasons, ["TENANT_NOT_FOUND"]);
});

test("suscripción ajena, segunda activa y proveedor activo conflictivo quedan pendientes", async () => {
  const foreign = fakeRepository();
  foreign.findTenantsBySubscription = async () => [{...foreign.tenant, id: "tenant-2"}];
  const foreignResult = await processHotmartEvent({
    event: event({explicitTenantId: "tenant-1"}),
    repository: foreign,
  });
  assert.deepEqual(foreignResult.reasons, ["SUBSCRIPTION_ASSOCIATED_TO_ANOTHER_TENANT"]);

  const second = fakeRepository({hotmartSubscriptionId: "SUB-OLD"});
  second.findTenantsBySubscription = async () => [];
  const secondResult = await processHotmartEvent({
    event: event({explicitTenantId: "tenant-1"}),
    repository: second,
  });
  assert.deepEqual(secondResult.reasons, ["SECOND_ACTIVE_SUBSCRIPTION"]);

  const providerConflict = fakeRepository({billingProvider: "mercadopago"});
  const providerResult = await processHotmartEvent({event: event(), repository: providerConflict});
  assert.deepEqual(providerResult.reasons, ["ACTIVE_BILLING_PROVIDER_CONFLICT"]);
});

test("anomalía de identidad queda pendiente", async () => {
  const repository = fakeRepository({clienteId: "otro"});
  const result = await processHotmartEvent({event: event(), repository});
  assert.deepEqual(result.reasons, ["TENANT_IDENTITY_MISMATCH"]);
});

test("tenant explícito requiere asociación verificable", async () => {
  const repository = fakeRepository({email: "other@example.com"});
  const result = await processHotmartEvent({
    event: event({explicitTenantId: "tenant-1"}),
    repository,
  });
  assert.deepEqual(result.reasons, ["EXPLICIT_ASSOCIATION_NOT_VERIFIED"]);

  const keyed = fakeRepository({
    email: "other@example.com",
    hotmartAssociationKey: "association-1",
  });
  const keyedResult = await processHotmartEvent({
    event: event({
      explicitTenantId: "tenant-1",
      trackingExternalCode: "association-1",
    }),
    repository: keyed,
  });
  assert.equal(keyedResult.status, "PROCESSED");
});

test("trial y legacy no se convierten automáticamente por coincidencia débil", async () => {
  const trial = fakeRepository({
    planId: "trial",
    subscriptionStatus: "trial",
    hotmartSubscriptionId: "",
  });
  const trialResult = await processHotmartEvent({event: event(), repository: trial});
  assert.deepEqual(trialResult.reasons, ["TRIAL_AUTO_CONVERSION_BLOCKED"]);

  const legacy = fakeRepository({planId: "legacy"});
  const legacyResult = await processHotmartEvent({event: event(), repository: legacy});
  assert.deepEqual(legacyResult.reasons, ["LEGACY_AUTO_CONVERSION_BLOCKED"]);

  const explicitTrial = fakeRepository({
    planId: "trial",
    subscriptionStatus: "trial",
    hotmartSubscriptionId: "",
  });
  const explicitResult = await processHotmartEvent({
    event: event({explicitTenantId: "tenant-1"}),
    repository: explicitTrial,
  });
  assert.equal(explicitResult.status, "PROCESSED");
});

test("eventos no aprobados no crean asociación usando sólo email", async () => {
  const repository = fakeRepository({hotmartSubscriptionId: ""});
  const result = await processHotmartEvent({
    event: event({
      action: "PAYMENT_REJECTED",
      eventType: "PURCHASE_DELAYED",
    }),
    repository,
  });
  assert.deepEqual(result.reasons, ["EVENT_REQUIRES_EXISTING_ASSOCIATION"]);
  assert.equal(repository.state.rejectedCalls, 0);
});

test("compra cancelada se conserva para conciliación sin efecto financiero", async () => {
  const repository = fakeRepository();
  const result = await processHotmartEvent({
    event: event({action: "PURCHASE_CANCELLED", eventType: "PURCHASE_CANCELED"}),
    repository,
  });
  assert.deepEqual(result.reasons, ["EVENT_REQUIRES_MANUAL_RECONCILIATION"]);
  assert.equal(repository.state.payments.size, 0);
  assert.equal(repository.state.rejectedCalls, 0);
});

test("cancelación no genera movimiento; refund y chargeback revierten una vez", async () => {
  const repository = fakeRepository();
  await processHotmartEvent({event: event(), repository});
  const cancellation = await processHotmartEvent({
    event: event({
      eventId: "cancel",
      eventType: "SUBSCRIPTION_CANCELLATION",
      action: "SUBSCRIPTION_CANCELLED",
      transactionId: "",
    }),
    repository,
  });
  assert.equal(cancellation.status, "PROCESSED");
  assert.equal(repository.state.cancellations, 1);
  for (const [eventId, action] of [["refund", "PAYMENT_REFUNDED"], ["chargeback", "PAYMENT_CHARGEBACK"]]) {
    await processHotmartEvent({
      event: event({eventId, action, eventType: action.replace("PAYMENT", "PURCHASE")}),
      repository,
    });
  }
  assert.equal(repository.state.reversals.size, 1);
});

test("refund sin pago original queda en conciliación", async () => {
  const repository = fakeRepository();
  const result = await processHotmartEvent({
    event: event({action: "PAYMENT_REFUNDED", eventType: "PURCHASE_REFUNDED"}),
    repository,
  });
  assert.deepEqual(result.reasons, ["ORIGINAL_PAYMENT_NOT_FOUND"]);
});

test("notificaciones se emiten una vez con la creación del pago", async () => {
  const repository = fakeRepository();
  const notifications = notificationDouble();
  await processHotmartEvent({event: event(), repository, notifications});
  await processHotmartEvent({event: event({eventId: "retry"}), repository, notifications});
  assert.equal(notifications.calls.received, 1);
});

module.exports = {event, fakeRepository, notificationDouble};
