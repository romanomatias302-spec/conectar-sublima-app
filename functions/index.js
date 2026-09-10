const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {authorizeSaasOwner} = require("./saasBillingCore");
const {
  buildReactivationPatch,
  createRecurringChargeTransaction,
  deterministicChargeId,
  evaluateBillingCandidate,
  isTrial,
} = require("./saasBillingEngine");

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");

const sharp = require("sharp");

const admin = require("firebase-admin");

const {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} = require("mercadopago");
const {createHotmartFirestoreRepository} = require("./hotmartFirestoreRepository");
const {createHotmartWebhookHandler} = require("./hotmartWebhookHandler");
const {createSaasNotificationHooks} = require("./saasNotificationHooks");

admin.initializeApp();

const db = admin.firestore();
const MP_ACCESS_TOKEN_TEST = defineSecret("MP_ACCESS_TOKEN_TEST");

const MP_ACCESS_TOKEN_PROD = defineSecret("MP_ACCESS_TOKEN_PROD");
const MP_WEBHOOK_SECRET_PROD = defineSecret("MP_WEBHOOK_SECRET_PROD");
const HOTMART_WEBHOOK_HOTTOK = defineSecret("HOTMART_WEBHOOK_HOTTOK");

function fechaISO(date) {
  return date.toISOString().slice(0, 10);
}

function normalizarFecha(valor) {
  if (!valor) return null;

  if (typeof valor === "string") {
    const [anio, mes, dia] = valor.split("-").map(Number);
    return new Date(anio, mes - 1, dia);
  }

  if (valor.toDate) {
    return valor.toDate();
  }

  if (valor instanceof Date) {
    return valor;
  }

  return null;
}

function sumarDias(fecha, dias) {
  const nueva = new Date(fecha);
  nueva.setDate(nueva.getDate() + dias);
  return nueva;
}

function diffDias(fechaA, fechaB) {
  const msDia = 1000 * 60 * 60 * 24;
  const a = new Date(fechaA.getFullYear(), fechaA.getMonth(), fechaA.getDate());
  const b = new Date(fechaB.getFullYear(), fechaB.getMonth(), fechaB.getDate());
  return Math.round((a - b) / msDia);
}

function inicioDia(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

async function procesarPruebaGratisVencida({ cliente, docu, hoy, modoPrueba }) {
  const frecuenciaCobro = cliente.frecuenciaCobro || "";
  const estadoSuscripcion = cliente.estadoSuscripcion || "";

  const esPrueba = isTrial(cliente) || frecuenciaCobro === "prueba" || estadoSuscripcion === "prueba";

  if (!esPrueba) {
    return {
      procesado: false,
    };
  }

  const fechaAlta = normalizarFecha(cliente.fechaAlta);

  const fechaVencimiento =
    normalizarFecha(cliente.fechaVencimiento) ||
    normalizarFecha(cliente.fechaProximoCargo) ||
    (fechaAlta ? sumarDias(fechaAlta, 7) : null);

  if (!fechaVencimiento) {
    return {
      procesado: true,
      accion: "omitido",
      motivo: "Prueba sin fecha de vencimiento",
    };
  }

  if (inicioDia(hoy) <= inicioDia(fechaVencimiento)) {
    return {
      procesado: true,
      accion: "omitido",
      motivo: "Prueba vigente",
      fechaVencimiento: fechaISO(fechaVencimiento),
    };
  }

  if (cliente.estado === "suspendido" && cliente.suspendidoPorSistema === true) {
    return {
      procesado: true,
      accion: "omitido",
      motivo: "Prueba ya suspendida",
      fechaVencimiento: fechaISO(fechaVencimiento),
    };
  }

  if (!modoPrueba) {
    await docu.ref.update({
      estado: "suspendido",
      estadoSuscripcion: "suspendida",
      suspendidoPorSistema: true,
      suspendidoManual: false,
      motivoSuspension: "prueba_vencida",
      fechaSuspension: fechaISO(hoy),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    procesado: true,
    accion: modoPrueba ? "simular_suspension_prueba" : "suspender_prueba",
    motivo: "Prueba gratis vencida",
    fechaVencimiento: fechaISO(fechaVencimiento),
  };
}

async function registrarPagoSaas({
  clienteSaasId,
  periodoFacturado,
  monto,
  medioPago = "manual",
  origen = "manual",
  observacion = "",
  referenciaExterna = "",
  mercadoPagoPaymentId = "",
  hotmartTransactionId = "",
}) {
  if (!clienteSaasId || !periodoFacturado || Number(monto || 0) <= 0) {
    throw new Error("Datos inválidos para registrar pago SaaS");
  }

  const clienteRef = db.collection("clientes-saas").doc(clienteSaasId);
  const clienteSnap = await clienteRef.get();

  if (!clienteSnap.exists) {
    throw new Error("Cliente SaaS no encontrado");
  }

  const cliente = clienteSnap.data();

  const pagoBase = {
    clienteSaasId,
    clienteNombre: cliente.nombre || "",
    tipoMovimiento: "pago",
    monto: Number(monto || 0),
    fechaPago: fechaISO(new Date()),
    medioPago,
    concepto:
      cliente.frecuenciaCobro === "anual" ? "anualidad" : "mensualidad",
    periodoFacturado,
    observacion,
    referenciaExterna,
    mercadoPagoPaymentId,
    hotmartTransactionId,
    origen,
    anulado: false,
    estado: "activo",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

 if (medioPago === "mercadopago" && mercadoPagoPaymentId) {
  const pagoRef = db
    .collection("saas_pagos")
    .doc(`mp_${String(mercadoPagoPaymentId)}`);

  await db.runTransaction(async (transaction) => {
    const pagoSnap = await transaction.get(pagoRef);

    if (pagoSnap.exists) {
      return;
    }

    transaction.set(pagoRef, pagoBase);
  });
} else {
  await db.collection("saas_pagos").add(pagoBase);
}

  await clienteRef.update({
    ultimoPago: pagoBase.fechaPago,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await recalcularEstadoCuentaCliente(clienteSaasId);

  const clienteActualizadoSnap = await clienteRef.get();
  const clienteActualizado = clienteActualizadoSnap.data() || {};

  return {
    ok: true,
    clienteSaasId,
    periodoFacturado,
    monto: Number(monto || 0),
    reactivado: cliente.suspendidoPorSistema === true &&
      clienteActualizado.suspendidoPorSistema !== true &&
      Number(clienteActualizado.saldoCuentaCorriente || 0) <= 0,
  };
}

async function recalcularEstadoCuentaCliente(clienteSaasId) {
  const movimientosSnap = await db
    .collection("saas_pagos")
    .where("clienteSaasId", "==", clienteSaasId)
    .get();

  let saldo = 0;
  const periodos = {};

  movimientosSnap.forEach((docu) => {
    const mov = docu.data();

    if (mov.anulado === true) return;

    const monto = Number(mov.monto || 0);
    const tipo = mov.tipoMovimiento || "pago";

    if (tipo === "cargo") saldo += monto;
    if (tipo === "pago" || tipo === "credito") saldo -= monto;
    if (tipo === "ajuste") saldo += monto;
    if (mov.periodoFacturado) {
      if (!periodos[mov.periodoFacturado]) {
        periodos[mov.periodoFacturado] = {
          cargos: 0,
          pagos: 0,
          fechaVencimiento: mov.fechaVencimiento || null,
        };
      }

      if (tipo === "cargo" || tipo === "ajuste") {
        periodos[mov.periodoFacturado].cargos += monto;
        periodos[mov.periodoFacturado].fechaVencimiento =
          mov.fechaVencimiento || periodos[mov.periodoFacturado].fechaVencimiento;
      }

      if (tipo === "pago" || tipo === "credito") {
        periodos[mov.periodoFacturado].pagos += monto;
      }
    }
  });

  const clienteRef = db.collection("clientes-saas").doc(clienteSaasId);
  const clienteSnap = await clienteRef.get();

  if (!clienteSnap.exists) return;

  const cliente = clienteSnap.data();

  let estadoCuenta = "al_dia";
  let estadoSuscripcion = isTrial(cliente) ? "prueba" : "activa";
  let suspendidoPorSistema = false;
  const now = new Date();

if (saldo > 0) {
  estadoCuenta = "mora";

  const hoy = now;

  const tienePeriodoVencidoPendiente = Object.values(periodos).some((p) => {
    const saldoPeriodo = p.cargos - p.pagos;
    const vencimiento = p.fechaVencimiento
      ? normalizarFecha(p.fechaVencimiento)
      : null;

    return saldoPeriodo > 0 && vencimiento && hoy > vencimiento;
  });

  if (tienePeriodoVencidoPendiente) {
    estadoSuscripcion = "suspendida";
    suspendidoPorSistema = true;
  } else {
    estadoSuscripcion = "gracia";
  }
}

  if (saldo < 0) {
    estadoCuenta = "saldo_favor";
  }

  const estadoPatch = {
    saldoCuentaCorriente: saldo,
    estadoCuenta,
    estadoSuscripcion,
    subscriptionStatus: ({activa: "active", gracia: "past_due", suspendida: "suspended", prueba: "trial"})[estadoSuscripcion],
    suspendidoPorSistema,
    estado:
      cliente.suspendidoManual === true
        ? "suspendido"
        : suspendidoPorSistema
        ? "suspendido"
        : "activo",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (suspendidoPorSistema && cliente.suspendidoPorSistema !== true) {
    estadoPatch.fechaSuspension = fechaISO(now);
    estadoPatch.motivoSuspension = "deuda_vencida";
  }
  const reactivationPatch = buildReactivationPatch(cliente, saldo, now);
  await clienteRef.update({...estadoPatch, ...(reactivationPatch || {})});
}

async function procesarCargosSaas({ modoPrueba = false } = {}) {
  const hoy = inicioDia(new Date());
  const clientesSnap = await db.collection("clientes-saas").get();

let cargosEmitidos = 0;
let pruebasSuspendidas = 0;
const simulados = [];
const omitidos = [];
const errores = [];

  for (const docu of clientesSnap.docs) {
    let cliente = {
      id: docu.id,
      ...docu.data(),
    };

    const resultadoPrueba = await procesarPruebaGratisVencida({
      cliente,
      docu,
      hoy,
      modoPrueba,
    });

    if (resultadoPrueba.procesado) {
    if (
      resultadoPrueba.accion === "suspender_prueba" ||
      resultadoPrueba.accion === "simular_suspension_prueba"
    ) {
      pruebasSuspendidas += 1;
    }

      if (modoPrueba) {
        omitidos.push({
          clienteNombre: cliente.nombre || "",
          motivo: resultadoPrueba.motivo,
          accion: resultadoPrueba.accion,
          fechaVencimiento: resultadoPrueba.fechaVencimiento || null,
        });
      }

      continue;
    }

    const estadoBilling = String(
      cliente.subscriptionStatus || cliente.estadoSuscripcion || ""
    ).toLowerCase();
    if (
      !modoPrueba &&
      (Number(cliente.saldoCuentaCorriente || 0) > 0 ||
        ["gracia", "past_due"].includes(estadoBilling))
    ) {
      await recalcularEstadoCuentaCliente(cliente.id);
      const clienteActualizado = await docu.ref.get();
      if (clienteActualizado.exists) {
        cliente = {id: docu.id, ...clienteActualizado.data()};
      }
    }

    const evaluacion = evaluateBillingCandidate(cliente, hoy);
    if (evaluacion.action !== "CHARGE") {
      const detalle = {clienteId: cliente.id, code: evaluacion.code};
      if (evaluacion.fields) detalle.fields = evaluacion.fields;
      if (evaluacion.action === "ERROR") {
        errores.push(detalle);
        console.error("Billing SaaS omitido por configuración inválida", detalle);
      } else {
        omitidos.push(detalle);
      }
      continue;
    }

    const {period} = evaluacion;
    const periodoFacturado = period.periodKey;
    const frecuenciaCobro = period.cycle === "annual" ? "anual" : "mensual";

const cargoExistenteSnap = await db
  .collection("saas_pagos")
  .where("clienteSaasId", "==", cliente.id)
  .where("tipoMovimiento", "==", "cargo")
  .where("periodoFacturado", "==", periodoFacturado)
  .limit(10)
  .get();

let yaExisteCargoActivo = cargoExistenteSnap.docs.some((docCargo) => {
  const cargo = docCargo.data();
  return cargo.anulado !== true;
});

if (!yaExisteCargoActivo && period.cycle === "annual") {
  const movimientosHistoricos = await db
    .collection("saas_pagos")
    .where("clienteSaasId", "==", cliente.id)
    .get();
  yaExisteCargoActivo = movimientosHistoricos.docs.some((docCargo) => {
    const cargo = docCargo.data();
    return cargo.tipoMovimiento === "cargo" && cargo.anulado !== true &&
      (cargo.fechaCobro === period.billingDate || cargo.periodStart === period.periodStart);
  });
}

if (yaExisteCargoActivo) {
  omitidos.push({clienteId: cliente.id, code: "ALREADY_BILLED_PERIOD", periodoFacturado});
  continue;
}

    const monto = evaluacion.amount;
    const cargoId = deterministicChargeId(cliente.id, periodoFacturado);

    const movimiento = {
      clienteSaasId: cliente.id,
      clienteNombre: cliente.nombre || "",
      tipoMovimiento: "cargo",
      monto,
      billingCurrency: evaluacion.currency,
      moneda: evaluacion.currency,
      currency: evaluacion.currency,
      fechaPago: period.issueDate,
      fechaCobro: period.billingDate,
      fechaVencimiento: period.dueDate,
      medioPago: "",
      concepto: frecuenciaCobro === "anual" ? "anualidad" : "mensualidad",
      observacion:
        frecuenciaCobro === "anual"
          ? `Cargo automático anual - período ${periodoFacturado}`
          : `Cargo automático mensual - período ${periodoFacturado}`,
      periodoFacturado,
      periodKey: periodoFacturado,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      idempotencyKey: cargoId,
      origen: "automatico",
      anulado: false,
      estado: "activo",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (modoPrueba) {
      simulados.push(movimiento);
      continue;
    }

    const cargoRef = db.collection("saas_pagos").doc(cargoId);
    const resultadoCreacion = await createRecurringChargeTransaction({
      db,
      clientRef: docu.ref,
      chargeRef: cargoRef,
      expectedPeriodKey: periodoFacturado,
      now: hoy,
      movement: movimiento,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!resultadoCreacion.created) {
      omitidos.push({clienteId: cliente.id, code: resultadoCreacion.code, periodoFacturado});
      continue;
    }

    await recalcularEstadoCuentaCliente(cliente.id);

    cargosEmitidos += 1;
  }

return {
  modoPrueba,
  cargosEmitidos,
  pruebasSuspendidas,
  simulados,
  omitidos,
  errores,
};
}

exports.emitirCargosSaasAutomaticos = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "America/Argentina/Buenos_Aires",
  },
  async () => {
    const resultado = await procesarCargosSaas({ modoPrueba: false });
    console.log("Resultado cargos automáticos:", resultado);
  }
);

exports.probarCargosSaasAutomaticos = onRequest(async (req, res) => {
  try {
    const resultado = await procesarCargosSaas({ modoPrueba: true });
    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Error ejecutando prueba",
    });
  }
});

exports.probarCargoClienteSaas = onRequest(async (req, res) => {
  try {
    const clienteId = req.query.id;

    if (!clienteId) {
      res.status(400).json({ error: "Falta id del cliente SaaS" });
      return;
    }

    const hoy = inicioDia(new Date());
    const docu = await db.collection("clientes-saas").doc(clienteId).get();

    if (!docu.exists) {
      res.status(404).json({ error: "Cliente SaaS no encontrado" });
      return;
    }

    const cliente = {
      id: docu.id,
      ...docu.data(),
    };

    const resultadoPrueba = await procesarPruebaGratisVencida({
      cliente,
      docu,
      hoy,
      modoPrueba: true,
    });

    if (resultadoPrueba.procesado) {
      res.json({
        clienteId,
        clienteNombre: cliente.nombre || "",
        tipo: "prueba",
        resultado: resultadoPrueba,
      });
      return;
    }

    const evaluacion = evaluateBillingCandidate(cliente, hoy);

    res.json({
      clienteId,
      action: evaluacion.action,
      code: evaluacion.code,
      fields: evaluacion.fields || [],
      monto: evaluacion.amount || 0,
      moneda: evaluacion.currency || null,
      periodo: evaluacion.period || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Error probando cliente SaaS",
    });
  }
});

exports.ejecutarCargosSaasAhora = onRequest(async (req, res) => {
  try {
    const token = req.query.token;

    if (token !== "zalfro-cargos-2026-seguro") {
      res.status(403).json({
        error: "No autorizado",
      });
      return;
    }

    const resultado = await procesarCargosSaas({modoPrueba: false});
    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Error ejecutando cargos reales",
    });
  }
});

exports.ejecutarCargosSaasAhoraSeguro = onCall(async (request) => {
  const profileSnap = request.auth?.uid
    ? await db.collection("usuarios").doc(request.auth.uid).get()
    : null;
  const authorization = authorizeSaasOwner(
    request.auth,
    profileSnap?.exists ? profileSnap.data() : null
  );
  if (!authorization.authorized) {
    throw new HttpsError(
      authorization.code === "UNAUTHENTICATED" ? "unauthenticated" : "permission-denied",
      "Se requieren privilegios de propietario SaaS."
    );
  }
  return procesarCargosSaas({modoPrueba: false});
});

exports.crearPreferenciaMercadoPago = onRequest(
  {
    secrets: [MP_ACCESS_TOKEN_PROD],
  },
  async (req, res) => {
    try {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }
      if (req.method !== "POST") {
        res.status(405).json({
          error: "Método no permitido",
        });
        return;
      }

        const { clienteSaasId, periodoFacturado } = req.body || {};

        if (!clienteSaasId || !periodoFacturado) {
          res.status(400).json({
            error: "Faltan datos para crear la preferencia.",
          });
          return;
        }

      const clienteSnap = await db
        .collection("clientes-saas")
        .doc(clienteSaasId)
        .get();

      if (!clienteSnap.exists) {
        res.status(404).json({
          error: "Cliente SaaS no encontrado.",
        });
        return;
      }

      const cliente = clienteSnap.data();

      const paisCliente = String(
        cliente.pais || ""
      )
        .trim()
        .toLowerCase();

      const monedaCliente = String(
        cliente.moneda || ""
      )
        .trim()
        .toUpperCase();

      if (
        paisCliente !== "argentina" ||
        monedaCliente !== "ARS"
      ) {
        res.status(409).json({
          error:
            "Mercado Pago está habilitado únicamente para cuentas de Argentina configuradas en ARS.",
        });
        return;
      }

      const movimientosSnap = await db
        .collection("saas_pagos")
        .where("clienteSaasId", "==", clienteSaasId)
        .where("periodoFacturado", "==", periodoFacturado)
        .get();

      let cargosPeriodo = 0;
      let pagosPeriodo = 0;

      movimientosSnap.forEach((docu) => {
        const movimiento = docu.data();

        if (movimiento.anulado === true) return;

        const valor = Number(movimiento.monto || 0);
        const tipo = movimiento.tipoMovimiento || "pago";

        if (tipo === "cargo" || tipo === "ajuste") {
          cargosPeriodo += valor;
        }

        if (tipo === "pago" || tipo === "credito") {
          pagosPeriodo += valor;
        }
      });

      const monto = cargosPeriodo - pagosPeriodo;

      if (monto <= 0) {
        res.status(409).json({
          error: "El período ya no tiene saldo pendiente.",
        });
        return;
      }

      const preferenceBody = {
        items: [
          {
            title: `Suscripción Zalfro - ${periodoFacturado}`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: Number(monto),
          },
        ],
        payer: {
          
          name: cliente.nombre || "",
        },
        external_reference: `${clienteSaasId}|${periodoFacturado}`,
        metadata: {
          clienteSaasId,
          periodoFacturado,
        },
      back_urls: {
        success: `https://app.zalfro.com/?pago=aprobado&periodo=${encodeURIComponent(
          periodoFacturado
        )}`,
        failure: `https://app.zalfro.com/?pago=rechazado&periodo=${encodeURIComponent(
          periodoFacturado
        )}`,
        pending: `https://app.zalfro.com/?pago=pendiente&periodo=${encodeURIComponent(
          periodoFacturado
        )}`,
      },
        auto_return: "approved",
        notification_url:
        "https://us-central1-conectarsublimados-7881e.cloudfunctions.net/webhookMercadoPagoSaas",
      };

      const mpResponse = await fetch(
        "https://api.mercadopago.com/checkout/preferences",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN_PROD.value()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(preferenceBody),
        }
      );

      const data = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error("Error Mercado Pago:", data);
        res.status(500).json({
          error: "No se pudo crear la preferencia de Mercado Pago.",
          detalle: data,
        });
        return;
      }

      res.json({
        preferenceId: data.id,
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error.message || "Error creando preferencia Mercado Pago",
      });
    }
  }
);

exports.webhookMercadoPagoSaas = onRequest(
  {
    secrets: [MP_ACCESS_TOKEN_PROD, MP_WEBHOOK_SECRET_PROD],
  },
  async (req, res) => {
    try {
      const paymentId =
        req.query["data.id"] ||
        req.query.id ||
        req.body?.data?.id ||
        req.body?.id;

      if (!paymentId) {
        res.status(200).json({
          ok: true,
          mensaje: "Notificación sin paymentId",
        });
        return;
      }

      const xSignature = req.headers["x-signature"];
      const xRequestId = req.headers["x-request-id"];

      if (!xSignature || !xRequestId) {
        console.warn("Webhook Mercado Pago sin firma", {
          paymentId: String(paymentId),
        });

        res.status(401).json({
          ok: false,
          error: "Firma de webhook ausente",
        });
        return;
      }

      try {
        WebhookSignatureValidator.validate({
          xSignature,
          xRequestId,
          dataId: String(paymentId),
          secret: MP_WEBHOOK_SECRET_PROD.value(),
        });
      } catch (errorFirma) {
        if (errorFirma instanceof InvalidWebhookSignatureError) {
          console.warn("Firma Mercado Pago inválida", {
            paymentId: String(paymentId),
          });

          res.status(401).json({
            ok: false,
            error: "Firma de webhook inválida",
          });
          return;
        }

        throw errorFirma;
      }

      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN_PROD.value()}`,
          },
        }
      );

      const pago = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Error consultando pago MP:", {
        paymentId: String(paymentId),
        status: mpResponse.status,
        respuesta: pago,
      });

      res.status(500).json({
        ok: false,
        error: "No se pudo consultar el pago en Mercado Pago",
      });
      return;
    }

      if (pago.status !== "approved") {
        res.status(200).json({
          ok: true,
          status: pago.status,
        });
        return;
      }

      const externalReference = pago.external_reference || "";
      const [clienteSaasId, periodoFacturado] = externalReference.split("|");

      if (!clienteSaasId || !periodoFacturado) {
        res.status(200).json({
          ok: false,
          mensaje: "external_reference inválida",
        });
        return;
      }

      const pagoExistenteSnap = await db
        .collection("saas_pagos")
        .where("clienteSaasId", "==", clienteSaasId)
        .where("tipoMovimiento", "==", "pago")
        .where("periodoFacturado", "==", periodoFacturado)
        .where("mercadoPagoPaymentId", "==", String(paymentId))
        .limit(1)
        .get();

      if (!pagoExistenteSnap.empty) {
        res.status(200).json({
          ok: true,
          mensaje: "Pago ya registrado",
        });
        return;
      }

      const monto = Number(pago.transaction_amount || 0);

      if (monto <= 0) {
        res.status(400).json({
          ok: false,
          error: "El pago aprobado tiene un monto inválido",
        });
        return;
      }

    await registrarPagoSaas({
      clienteSaasId,
      periodoFacturado,
      monto,
      medioPago: "mercadopago",
      origen: "mercadopago",
      observacion: `Pago Mercado Pago - paymentId ${paymentId}`,
      referenciaExterna: String(paymentId),
      mercadoPagoPaymentId: String(paymentId),
    });

      res.status(200).json({
        ok: true,
        clienteSaasId,
        periodoFacturado,
        monto,
      });
    } catch (error) {
      console.error("Error webhook Mercado Pago:", error);

      res.status(500).json({
        ok: false,
        error: error.message || "Error procesando webhook Mercado Pago",
      });
    }
  }
);

exports.webhookHotmartSaas = onRequest(
  {
    secrets: [HOTMART_WEBHOOK_HOTTOK],
  },
  createHotmartWebhookHandler({
    expectedHottok: () => HOTMART_WEBHOOK_HOTTOK.value(),
    repository: createHotmartFirestoreRepository({
      db,
      FieldValue: admin.firestore.FieldValue,
      recalculate: recalcularEstadoCuentaCliente,
    }),
    notifications: createSaasNotificationHooks({db}),
  }),
);


/*aca se agrega funcion nueva para solucionar lo de las imagenes, de manera temporal */


function obtenerStoragePathDesdeUrl(url) {
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

async function migrarMiniaturasProduccion({ clienteId, soloUna = true }) {
  const pedidosSnap = await db
    .collection("pedidos")
    .where("clienteId", "==", clienteId)
    .get();

  let procesadas = 0;
  let omitidas = 0;
  let errores = 0;

  const bucket = admin.storage().bucket();

  for (const docu of pedidosSnap.docs) {
    const pedido = docu.data();

    if (!pedido.produccionImagenPortada) {
      omitidas++;
      continue;
    }

    if (pedido.produccionImagenPortadaThumb) {
      omitidas++;
      continue;
    }

    try {
      const pathOriginal = obtenerStoragePathDesdeUrl(pedido.produccionImagenPortada);

      if (!pathOriginal) {
        omitidas++;
        continue;
      }

      const [bufferOriginal] = await bucket.file(pathOriginal).download();

      const thumbBuffer = await sharp(bufferOriginal)
        .resize({
          width: 420,
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 72,
        })
        .toBuffer();

      const thumbPath = `produccion/${docu.id}/portada/thumb-migrada-${Date.now()}.jpg`;

      const thumbFile = bucket.file(thumbPath);

      await thumbFile.save(thumbBuffer, {
        metadata: {
          contentType: "image/jpeg",
        },
      });

      await thumbFile.makePublic();

      const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;

      await docu.ref.update({
        produccionImagenPortadaThumb: thumbUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      procesadas++;

      if (soloUna) break;
    } catch (error) {
      console.error("Error migrando miniatura:", docu.id, error);
      errores++;
    }
  }

  return {
    procesadas,
    omitidas,
    errores,
    soloUna,
  };
}

exports.migrarMiniaturasProduccionSeguro = onCall(async (request) => {
  const profileSnap = request.auth?.uid
    ? await db.collection("usuarios").doc(request.auth.uid).get()
    : null;
  const authorization = authorizeSaasOwner(
    request.auth,
    profileSnap?.exists ? profileSnap.data() : null
  );
  if (!authorization.authorized) {
    throw new HttpsError(
      authorization.code === "UNAUTHENTICATED" ? "unauthenticated" : "permission-denied",
      "Se requieren privilegios de propietario SaaS."
    );
  }
  const clienteId = String(request.data?.clienteId || "").trim();
  if (!clienteId) throw new HttpsError("invalid-argument", "Falta clienteId.");
  return migrarMiniaturasProduccion({
    clienteId,
    soloUna: request.data?.modo !== "todos",
  });
});

exports.migrarMiniaturasProduccion = onRequest(async (req, res) => {
  try {
    const token = req.query.token;
    const clienteId = req.query.clienteId;
    const modo = req.query.modo || "uno";

    if (token !== "zalfro-miniaturas-2026-seguro") {
      res.status(403).json({ error: "No autorizado" });
      return;
    }

    if (!clienteId) {
      res.status(400).json({ error: "Falta clienteId" });
      return;
    }

    const resultado = await migrarMiniaturasProduccion({
      clienteId,
      soloUna: modo !== "todos",
    });

    res.json(resultado);
  } catch (error) {
    console.error("Error migrando miniaturas:", error);
    res.status(500).json({
      error: error.message || "Error migrando miniaturas",
    });
  }
});
