const { onRequest } = require("firebase-functions/v2/https");

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

const sharp = require("sharp");

const admin = require("firebase-admin");

const {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} = require("mercadopago");

admin.initializeApp();

const db = admin.firestore();
const MP_ACCESS_TOKEN_TEST = defineSecret("MP_ACCESS_TOKEN_TEST");

const MP_ACCESS_TOKEN_PROD = defineSecret("MP_ACCESS_TOKEN_PROD");
const MP_WEBHOOK_SECRET_PROD = defineSecret("MP_WEBHOOK_SECRET_PROD");

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

function sumarMeses(fecha, meses) {
  const nueva = new Date(fecha);
  nueva.setMonth(nueva.getMonth() + meses);
  return nueva;
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

function obtenerCicloActual(cliente, hoy) {
  const fechaAlta = normalizarFecha(cliente.fechaAlta);

  if (!fechaAlta) {
    return null;
  }

  const hoyInicio = inicioDia(hoy);
  const frecuenciaCobro = cliente.frecuenciaCobro || "mensual";
  const diasCiclo = Number(
    cliente.diasCiclo || (frecuenciaCobro === "anual" ? 365 : 30)
  );

  // Prueba gratis: no genera cargo automático
  if (frecuenciaCobro === "prueba") {
    return null;
  }

  // Mensual: mantenemos lógica vieja para no romper clientes actuales
  if (frecuenciaCobro === "mensual") {
    let meses = 1;
    let fechaCobro = sumarMeses(fechaAlta, meses);

    while (sumarDias(fechaCobro, 7) < hoyInicio) {
      meses += 1;
      fechaCobro = sumarMeses(fechaAlta, meses);
    }

    const periodoFacturado = `${fechaCobro.getFullYear()}-${String(
      fechaCobro.getMonth() + 1
    ).padStart(2, "0")}`;

    return {
      fechaCobro,
      periodoFacturado,
      frecuenciaCobro,
    };
  }

  // Anual: nuevo comportamiento, cada 365 días
  if (frecuenciaCobro === "anual") {
    let ciclos = 1;
    let fechaCobro = sumarDias(fechaAlta, diasCiclo);

    while (sumarDias(fechaCobro, 7) < hoyInicio) {
      ciclos += 1;
      fechaCobro = sumarDias(fechaAlta, diasCiclo * ciclos);
    }

    const periodoFacturado = `${fechaCobro.getFullYear()}-ANUAL-${ciclos}`;

    return {
      fechaCobro,
      periodoFacturado,
      frecuenciaCobro,
    };
  }

  return null;
}

async function procesarPruebaGratisVencida({ cliente, docu, hoy, modoPrueba }) {
  const frecuenciaCobro = cliente.frecuenciaCobro || "";
  const estadoSuscripcion = cliente.estadoSuscripcion || "";

  const esPrueba =
    frecuenciaCobro === "prueba" ||
    estadoSuscripcion === "prueba" ||
    cliente.planNombre === "Prueba gratis 7 días" ||
    cliente.plan === "Prueba gratis 7 días";

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

  if (
    Number(clienteActualizado.saldoCuentaCorriente || 0) <= 0 &&
    clienteActualizado.suspendidoManual !== true
  ) {
    await clienteRef.update({
      estado: "activo",
      estadoSuscripcion: "activa",
      suspendidoPorSistema: false,
      motivoSuspension: "",
      fechaReactivacion: fechaISO(new Date()),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    ok: true,
    clienteSaasId,
    periodoFacturado,
    monto: Number(monto || 0),
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
  let estadoSuscripcion = "activa";
  let suspendidoPorSistema = false;

if (saldo > 0) {
  estadoCuenta = "mora";

  const hoy = new Date();

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

  await clienteRef.update({
    saldoCuentaCorriente: saldo,
    estadoCuenta,
    estadoSuscripcion,
    suspendidoPorSistema,
    estado:
      cliente.suspendidoManual === true
        ? "suspendido"
        : suspendidoPorSistema
        ? "suspendido"
        : "activo",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function procesarCargosSaas({ modoPrueba = false } = {}) {
  const hoy = inicioDia(new Date());
  const clientesSnap = await db.collection("clientes-saas").get();

let cargosEmitidos = 0;
let pruebasSuspendidas = 0;
const simulados = [];
const omitidos = [];

  for (const docu of clientesSnap.docs) {
    const cliente = {
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

if (!cliente.fechaAlta) {
  if (modoPrueba) {
    omitidos.push({
      clienteNombre: cliente.nombre || "",
      motivo: "Sin fechaAlta",
    });
  }

  await recalcularEstadoCuentaCliente(cliente.id);
  continue;
}

if (cliente.suspendidoManual === true) {
  if (modoPrueba) {
    omitidos.push({
      clienteNombre: cliente.nombre || "",
      motivo: "Suspendido manualmente",
    });
  }
  continue;
}

if ((cliente.estado || "") === "inactivo") {
  if (modoPrueba) {
    omitidos.push({
      clienteNombre: cliente.nombre || "",
      motivo: "Cliente inactivo",
    });
  }
  continue;
}

if ((cliente.estadoSuscripcion || "") === "cancelado") {
  if (modoPrueba) {
    omitidos.push({
      clienteNombre: cliente.nombre || "",
      motivo: "Suscripción cancelada",
    });
  }
  continue;
}

    const diasAnticipacionCargo = Number(cliente.diasAnticipacionCargo || 10);
    const diasGracia = Number(cliente.diasGracia || 7);

    const ciclo = obtenerCicloActual(cliente, hoy);

    if (!ciclo) {
      if (modoPrueba) {
        omitidos.push({
          clienteNombre: cliente.nombre || "",
          motivo:
            (cliente.frecuenciaCobro || "") === "prueba"
              ? "Cliente en prueba, no genera cargo automático"
              : "No se pudo calcular ciclo",
          fechaAlta: cliente.fechaAlta,
          frecuenciaCobro: cliente.frecuenciaCobro || "mensual",
        });
      }

      await recalcularEstadoCuentaCliente(cliente.id);
      continue;
    }

    const { fechaCobro, periodoFacturado, frecuenciaCobro } = ciclo;

    const fechaEmision = sumarDias(fechaCobro, -diasAnticipacionCargo);
    const fechaVencimiento = sumarDias(fechaCobro, diasGracia);

    if (hoy < inicioDia(fechaEmision)) {
      if (modoPrueba) {
        omitidos.push({
          clienteNombre: cliente.nombre || "",
          motivo: "Todavía no llegó la fecha de emisión",
          fechaAlta: cliente.fechaAlta,
          fechaCobro: fechaISO(fechaCobro),
          fechaEmision: fechaISO(fechaEmision),
          hoy: fechaISO(hoy),
          periodoFacturado,
          frecuenciaCobro,
        });
      }

      await recalcularEstadoCuentaCliente(cliente.id);
      continue;
    }

const cargoExistenteSnap = await db
  .collection("saas_pagos")
  .where("clienteSaasId", "==", cliente.id)
  .where("tipoMovimiento", "==", "cargo")
  .where("periodoFacturado", "==", periodoFacturado)
  .limit(10)
  .get();

const yaExisteCargoActivo = cargoExistenteSnap.docs.some((docCargo) => {
  const cargo = docCargo.data();
  return cargo.anulado !== true;
});

if (yaExisteCargoActivo) {
  if (modoPrueba) {
    omitidos.push({
      clienteNombre: cliente.nombre || "",
      motivo: "Ya existe cargo activo para el período",
      periodoFacturado,
    });
  }

  await recalcularEstadoCuentaCliente(cliente.id);
  continue;
}

    const monto = Number(cliente.planPrecio || cliente.mantenimientoMensual || 0);
    if (monto <= 0) {
    if (modoPrueba) {
      omitidos.push({
        clienteNombre: cliente.nombre || "",
        motivo: "Monto cero o inválido",
        monto,
      });
    }

    continue;
  }

    const movimiento = {
      clienteSaasId: cliente.id,
      clienteNombre: cliente.nombre || "",
      tipoMovimiento: "cargo",
      monto,
      fechaPago: fechaISO(fechaEmision),
      fechaCobro: fechaISO(fechaCobro),
      fechaVencimiento: fechaISO(fechaVencimiento),
      medioPago: "",
      concepto: frecuenciaCobro === "anual" ? "anualidad" : "mensualidad",
      observacion:
        frecuenciaCobro === "anual"
          ? `Cargo automático anual - período ${periodoFacturado}`
          : `Cargo automático mensual - período ${periodoFacturado}`,
      periodoFacturado,
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

    await db.collection("saas_pagos").add(movimiento);

    await docu.ref.update({
      fechaProximoCargo: fechaISO(fechaCobro),
      fechaVencimiento: fechaISO(fechaVencimiento),
      ultimoPeriodoFacturado: periodoFacturado,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await recalcularEstadoCuentaCliente(cliente.id);

    cargosEmitidos += 1;
  }

return {
  modoPrueba,
  cargosEmitidos,
  pruebasSuspendidas,
  simulados,
  omitidos,
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

    const diasAnticipacionCargo = Number(cliente.diasAnticipacionCargo || 10);
    const diasGracia = Number(cliente.diasGracia || 7);

    const ciclo = obtenerCicloActual(cliente, hoy);

    if (!ciclo) {
      res.json({
        clienteId,
        clienteNombre: cliente.nombre || "",
        resultado: "omitido",
        motivo: "No se pudo calcular ciclo",
        frecuenciaCobro: cliente.frecuenciaCobro || "mensual",
        fechaAlta: cliente.fechaAlta || null,
      });
      return;
    }

    const { fechaCobro, periodoFacturado, frecuenciaCobro } = ciclo;

    const fechaEmision = sumarDias(fechaCobro, -diasAnticipacionCargo);
    const fechaVencimiento = sumarDias(fechaCobro, diasGracia);

    const monto = Number(cliente.planPrecio || cliente.mantenimientoMensual || 0);

    res.json({
      clienteId,
      clienteNombre: cliente.nombre || "",
      frecuenciaCobro,
      monto,
      fechaAlta: cliente.fechaAlta || null,
      fechaCobro: fechaISO(fechaCobro),
      fechaEmision: fechaISO(fechaEmision),
      fechaVencimiento: fechaISO(fechaVencimiento),
      periodoFacturado,
      generaCargoHoy: hoy >= inicioDia(fechaEmision) && monto > 0,
      motivo:
        hoy < inicioDia(fechaEmision)
          ? "Todavía no llegó la fecha de emisión"
          : monto <= 0
          ? "Monto cero o inválido"
          : "Generaría cargo",
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