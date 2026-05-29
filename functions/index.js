const { onRequest } = require("firebase-functions/v2/https");

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const MP_ACCESS_TOKEN_TEST = defineSecret("MP_ACCESS_TOKEN_TEST");

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

function obtenerCicloActual(fechaAltaStr, hoy) {
  const fechaAlta = normalizarFecha(fechaAltaStr);

  let meses = 1;
  if (!fechaAlta) {
    return null;
  }
  let fechaCobro = sumarMeses(fechaAlta, meses);

  while (fechaCobro < hoy) {
    meses += 1;
    fechaCobro = sumarMeses(fechaAlta, meses);
  }

  const periodoFacturado = `${fechaCobro.getFullYear()}-${String(
    fechaCobro.getMonth() + 1
  ).padStart(2, "0")}`;

  return {
    fechaCobro,
    periodoFacturado,
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
  const hoy = new Date();
  const clientesSnap = await db.collection("clientes-saas").get();

  let cargosEmitidos = 0;
  const simulados = [];

  for (const docu of clientesSnap.docs) {
    const cliente = {
      id: docu.id,
      ...docu.data(),
    };

    if (!cliente.fechaAlta) {
      await recalcularEstadoCuentaCliente(cliente.id);
      continue;
    }
    if (cliente.suspendidoManual === true) continue;
    if ((cliente.estado || "") === "inactivo") continue;
    if ((cliente.estadoSuscripcion || "") === "cancelado") continue;

    const diasAnticipacionCargo = Number(cliente.diasAnticipacionCargo || 10);
    const diasGracia = Number(cliente.diasGracia || 7);

    const ciclo = obtenerCicloActual(cliente.fechaAlta, hoy);

    if (!ciclo) continue;

    const {fechaCobro, periodoFacturado} = ciclo;

    const fechaEmision = sumarDias(fechaCobro, -diasAnticipacionCargo);
    const fechaVencimiento = sumarDias(fechaCobro, diasGracia);

    const diasParaEmitir = diffDias(fechaEmision, hoy);

    if (diasParaEmitir !== 0) {
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
  await recalcularEstadoCuentaCliente(cliente.id);
  continue;
}

    const monto = Number(cliente.planPrecio || cliente.mantenimientoMensual || 0);
    if (monto <= 0) continue;

    const movimiento = {
      clienteSaasId: cliente.id,
      clienteNombre: cliente.nombre || "",
      tipoMovimiento: "cargo",
      monto,
      fechaPago: fechaISO(fechaEmision),
      fechaCobro: fechaISO(fechaCobro),
      fechaVencimiento: fechaISO(fechaVencimiento),
      medioPago: "",
      concepto: "mensualidad",
      observacion: `Cargo automático mensual - período ${periodoFacturado}`,
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
    simulados,
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
    secrets: [MP_ACCESS_TOKEN_TEST],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({
          error: "Método no permitido",
        });
        return;
      }

      const { clienteSaasId, periodoFacturado, monto } = req.body || {};

      if (!clienteSaasId || !periodoFacturado || Number(monto || 0) <= 0) {
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
          email: cliente.email || "",
          name: cliente.nombre || "",
        },
        external_reference: `${clienteSaasId}|${periodoFacturado}`,
        metadata: {
          clienteSaasId,
          periodoFacturado,
        },
        back_urls: {
          success: "https://zalfro.com/pago-exitoso",
          failure: "https://zalfro.com/pago-fallido",
          pending: "https://zalfro.com/pago-pendiente",
        },
        auto_return: "approved",
      };

      const mpResponse = await fetch(
        "https://api.mercadopago.com/checkout/preferences",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN_TEST.value()}`,
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