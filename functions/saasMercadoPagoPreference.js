'use strict';

const PAYMENT_ERROR_CODES = {
  NO_DEBT: 'SAAS_PAYMENT_NO_DEBT',
  UNSUPPORTED_COUNTRY: 'SAAS_PAYMENT_UNSUPPORTED_COUNTRY',
  UNSUPPORTED_CURRENCY: 'SAAS_PAYMENT_UNSUPPORTED_CURRENCY',
  UNSUPPORTED_PROVIDER: 'SAAS_PAYMENT_UNSUPPORTED_PROVIDER',
  PROVIDER_ERROR: 'SAAS_PAYMENT_PROVIDER_ERROR',
};

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function resolveSaasBillingCurrency(client = {}) {
  return String(client.billingCurrency || client.currency || 'USD')
    .trim()
    .toUpperCase();
}

function payablePeriods(documents = []) {
  const periods = new Map();

  for (const document of documents) {
    const movement = typeof document.data === 'function' ? document.data() : document;
    if (movement?.anulado === true || !movement?.periodoFacturado) continue;

    const amount = Number(movement.monto);
    if (!Number.isFinite(amount)) continue;

    const period = String(movement.periodoFacturado);
    const current = periods.get(period) || { period, charges: 0, payments: 0 };
    const type = movement.tipoMovimiento || 'pago';

    if (type === 'cargo' || type === 'ajuste') current.charges += amount;
    if (type === 'pago' || type === 'credito') current.payments += amount;
    periods.set(period, current);
  }

  return [...periods.values()]
    .map((period) => ({ ...period, balance: period.charges - period.payments }))
    .filter((period) => period.balance > 0)
    .sort((left, right) => left.period.localeCompare(right.period));
}

function createSaasMercadoPagoPreferenceHandler({
  db,
  HttpsError,
  fetchImpl,
  getAccessToken,
  logger = console,
}) {
  const fail = (code, message) => {
    throw new HttpsError('failed-precondition', message, { code });
  };

  return async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Se requiere iniciar sesión.');
    }

    const profileSnapshot = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = profileSnapshot.exists ? profileSnapshot.data() : null;

    if (profile?.activo !== true || profile?.rol !== 'admin' || !profile?.clienteId) {
      throw new HttpsError(
        'permission-denied',
        'Sólo un administrador activo puede iniciar el pago.',
      );
    }

    if (request.data?.clienteSaasId && request.data.clienteSaasId !== profile.clienteId) {
      throw new HttpsError('permission-denied', 'La cuenta indicada no corresponde al usuario.');
    }

    const tenantId = profile.clienteId;
    const clientSnapshot = await db.collection('clientes-saas').doc(tenantId).get();
    if (!clientSnapshot.exists) {
      throw new HttpsError('not-found', 'No se encontró la cuenta asociada.');
    }

    const client = clientSnapshot.data();
    if (normalize(client.pais) !== 'argentina') {
      fail(
        PAYMENT_ERROR_CODES.UNSUPPORTED_COUNTRY,
        'Mercado Pago está disponible para cuentas de Argentina.',
      );
    }

    const provider = normalize(client.billingProvider || client.metodoCobro);

    if (provider === 'hotmart') {
      fail(
        PAYMENT_ERROR_CODES.UNSUPPORTED_PROVIDER,
        'Esta suscripción se administra mediante Hotmart.',
      );
    }

    const currency = resolveSaasBillingCurrency(client);
    if (currency !== 'ARS') {
      fail(
        PAYMENT_ERROR_CODES.UNSUPPORTED_CURRENCY,
        'Mercado Pago está disponible para suscripciones facturadas en ARS.',
      );
    }

    const movementsSnapshot = await db
      .collection('saas_pagos')
      .where('clienteSaasId', '==', tenantId)
      .get();
    const pendingPeriod = payablePeriods(movementsSnapshot.docs)[0];

    if (!pendingPeriod) {
      fail(PAYMENT_ERROR_CODES.NO_DEBT, 'La cuenta no tiene deuda pagable.');
    }

    const preference = {
      items: [
        {
          title: `Suscripción Zalfro - ${pendingPeriod.period}`,
          quantity: 1,
          currency_id: currency,
          unit_price: pendingPeriod.balance,
        },
      ],
      payer: { name: client.nombre || '' },
      external_reference: `${tenantId}|${pendingPeriod.period}`,
      metadata: {
        clienteSaasId: tenantId,
        periodoFacturado: pendingPeriod.period,
      },
      back_urls: {
        success: `https://app.zalfro.com/?pago=aprobado&periodo=${encodeURIComponent(pendingPeriod.period)}`,
        failure: `https://app.zalfro.com/?pago=rechazado&periodo=${encodeURIComponent(pendingPeriod.period)}`,
        pending: `https://app.zalfro.com/?pago=pendiente&periodo=${encodeURIComponent(pendingPeriod.period)}`,
      },
      auto_return: 'approved',
      notification_url:
        'https://us-central1-conectarsublimados-7881e.cloudfunctions.net/webhookMercadoPagoSaas',
    };

    let response;
    try {
      response = await fetchImpl('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preference),
      });
    } catch (error) {
      logger.error('Error de red creando preferencia de Mercado Pago', {
        name: error?.name,
      });
      throw new HttpsError('internal', 'No se pudo iniciar el pago.', {
        code: PAYMENT_ERROR_CODES.PROVIDER_ERROR,
      });
    }

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok || !responseData.init_point) {
      logger.error('Mercado Pago rechazó la creación de la preferencia', {
        status: response.status,
      });
      throw new HttpsError('internal', 'No se pudo iniciar el pago.', {
        code: PAYMENT_ERROR_CODES.PROVIDER_ERROR,
      });
    }

    return {
      preferenceId: responseData.id,
      initPoint: responseData.init_point,
      periodoFacturado: pendingPeriod.period,
      monto: pendingPeriod.balance,
      currency,
    };
  };
}

module.exports = {
  PAYMENT_ERROR_CODES,
  createSaasMercadoPagoPreferenceHandler,
  payablePeriods,
  resolveSaasBillingCurrency,
};
