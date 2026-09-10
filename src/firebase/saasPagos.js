import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  buildRecurringChargeAdvancePatch,
  buildSaasReactivationPatch,
  deterministicSaasChargeId,
  recurringSaasPeriodKey,
} from "../domain/saasBillingState";

export async function registrarMovimientoSaas({
  clienteSaas,
  tipoMovimiento = "pago",
  monto,
  fechaPago,
  medioPago,
  concepto,
  periodoFacturado = "",
  observacion = "",
  
}) {
  if (!clienteSaas?.id) throw new Error("Cliente SaaS inválido.");
  if (Number(monto || 0) <= 0) throw new Error("El monto debe ser mayor a 0.");
  const status = String(clienteSaas.subscriptionStatus || clienteSaas.estadoSuscripcion || "").toLowerCase();
  if (tipoMovimiento === "cargo" && (
    clienteSaas.suspendidoManual === true || clienteSaas.suspendidoPorSistema === true ||
    ["suspendida", "suspended", "gracia", "past_due"].includes(status) ||
    Number(clienteSaas.saldoCuentaCorriente || 0) > 0
  )) throw new Error("No se puede generar un cargo recurrente mientras la cuenta está suspendida o tiene deuda.");
  const esCargoRecurrente = tipoMovimiento === "cargo" && ["mensualidad", "anualidad"].includes(concepto);
  const periodoRecurrente = esCargoRecurrente
    ? periodoFacturado || recurringSaasPeriodKey(clienteSaas, fechaPago)
    : periodoFacturado;
  if (esCargoRecurrente && !periodoRecurrente) throw new Error("El cargo recurrente requiere un período de facturación válido.");
  const billingCurrency = String(
    clienteSaas.billingCurrency ||
    clienteSaas.currency ||
    "USD"
  ).trim().toUpperCase();
  if (tipoMovimiento === "cargo" && !billingCurrency) {
    throw new Error("El cargo recurrente requiere una moneda.");
  }

  const movimiento = {
    clienteSaasId: clienteSaas.id,
    clienteNombre: clienteSaas.nombre || "",
    tipoMovimiento,
    monto: Number(monto || 0),
    billingCurrency,
    currency: billingCurrency,
    moneda: billingCurrency,
    fechaPago,
    medioPago,
    concepto,
    periodoFacturado: periodoRecurrente,
    observacion,
    anulado: false,
    estado: "activo",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

if (esCargoRecurrente) {
  const cargoRef = doc(db, "saas_pagos", deterministicSaasChargeId(clienteSaas.id, periodoRecurrente));
  const clienteRef = doc(db, "clientes-saas", clienteSaas.id);
  await runTransaction(db, async (transaction) => {
    const [existing, currentClientSnapshot] = await Promise.all([
      transaction.get(cargoRef),
      transaction.get(clienteRef),
    ]);
    if (existing.exists()) throw new Error("Ya existe un cargo para este cliente y período.");
    if (!currentClientSnapshot.exists()) throw new Error("El cliente SaaS ya no existe.");
    const currentClient = {id: currentClientSnapshot.id, ...currentClientSnapshot.data()};
    const currentStatus = String(currentClient.subscriptionStatus || currentClient.estadoSuscripcion || "").toLowerCase();
    if (
      currentClient.suspendidoManual === true || currentClient.suspendidoPorSistema === true ||
      ["suspendida", "suspended", "gracia", "past_due"].includes(currentStatus) ||
      Number(currentClient.saldoCuentaCorriente || 0) > 0
    ) throw new Error("La cuenta cambió de estado y ya no admite un cargo recurrente.");
    if (recurringSaasPeriodKey(currentClient, fechaPago) !== periodoRecurrente) {
      throw new Error("El período de facturación cambió. Volvé a intentar.");
    }
    const advancePatch = buildRecurringChargeAdvancePatch(currentClient, periodoRecurrente, fechaPago);
    if (!advancePatch) throw new Error("No se pudo determinar el siguiente ciclo de facturación.");
    transaction.set(cargoRef, {...movimiento, idempotencyKey: cargoRef.id, periodKey: periodoRecurrente});
    transaction.update(clienteRef, {...advancePatch, updatedAt: serverTimestamp()});
  });
} else {
  await addDoc(collection(db, "saas_pagos"), movimiento);
}

await recalcularEstadoCuentaCliente(clienteSaas.id);

if (tipoMovimiento === "pago") {
  await updateDoc(doc(db, "clientes-saas", clienteSaas.id), {
    ultimoPago: fechaPago,
    ultimoPagoMonto: Number(monto || 0),
    ultimoPagoMedio: medioPago || "",
    updatedAt: serverTimestamp(),
  });
}


}

export async function obtenerPagosSaas(clienteSaasId) {
  const q = query(
    collection(db, "saas_pagos"),
    where("clienteSaasId", "==", clienteSaasId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
    }))
    .sort((a, b) => {
      const fechaA = a.fechaPago || "";
      const fechaB = b.fechaPago || "";
      return fechaA < fechaB ? 1 : -1;
    });
}


export async function recalcularEstadoCuentaCliente(clienteSaasId) {
  const movimientos = await obtenerPagosSaas(clienteSaasId);

  let saldo = 0;

  movimientos.forEach((mov) => {
    // ignorar anulados
    if (mov.anulado === true) return;

    const monto = Number(mov.monto || 0);
    const tipo = mov.tipoMovimiento || "pago";

    if (tipo === "cargo") {
      saldo += monto;
    }

    if (tipo === "pago" || tipo === "credito") {
      saldo -= monto;
    }

    if (tipo === "ajuste") {
      saldo += monto;
    }
  });

  const clienteRef = doc(db, "clientes-saas", clienteSaasId);

  const clienteSnap = await getDoc(clienteRef);
  const cliente = clienteSnap.exists() ? clienteSnap.data() : null;

  if (!cliente) return;

  let estadoCuenta = "al_dia";
  let estadoSuscripcion = "activa";
  let suspendidoPorSistema = false;

  if (saldo > 0) {
    estadoCuenta = "mora";

    const hoy = new Date();
    const vencimiento = cliente.fechaVencimiento
      ? new Date(cliente.fechaVencimiento)
      : null;

    if (vencimiento && hoy > vencimiento) {
      estadoSuscripcion = "suspendida";
      suspendidoPorSistema = true;
    } else {
      estadoSuscripcion = "gracia";
    }
  }

  if (saldo < 0) {
    estadoCuenta = "saldo_favor";
  }

  const reactivationPatch = buildSaasReactivationPatch(cliente, saldo, new Date());
  await updateDoc(clienteRef, {
    saldoCuentaCorriente: saldo,
    estadoCuenta,
    estadoSuscripcion,
    subscriptionStatus: ({activa: "active", gracia: "past_due", suspendida: "suspended"})[estadoSuscripcion],

    suspendidoPorSistema,

    estado:
      cliente.suspendidoManual === true
        ? "suspendido"
        : suspendidoPorSistema
        ? "suspendido"
        : "activo",

    ...(suspendidoPorSistema && cliente.suspendidoPorSistema !== true
      ? {fechaSuspension: new Date().toISOString().slice(0, 10), motivoSuspension: "deuda_vencida"}
      : {}),
    ...(reactivationPatch || {}),

    updatedAt: serverTimestamp(),
  });
}

export async function cambiarSuspensionManualSaas(clienteSaasId, nuevoEstado) {
  if (!clienteSaasId) throw new Error("Cliente SaaS inválido.");
  if (!["activo", "suspendido"].includes(nuevoEstado)) throw new Error("Estado SaaS inválido.");
  const clienteRef = doc(db, "clientes-saas", clienteSaasId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(clienteRef);
    if (!snapshot.exists()) throw new Error("El cliente SaaS ya no existe.");
    const cliente = {id: snapshot.id, ...snapshot.data()};
    if (nuevoEstado === "activo" && Number(cliente.saldoCuentaCorriente || 0) > 0) {
      throw new Error("No se puede reactivar la cuenta mientras exista deuda pendiente.");
    }

    const estadoNormalizado = String(cliente.subscriptionStatus || cliente.estadoSuscripcion || "").toLowerCase();
    const esTrial = cliente.planId === "trial" || ["trial", "prueba"].includes(estadoNormalizado);
    const reactivationPatch = nuevoEstado === "activo" && !esTrial
      ? buildSaasReactivationPatch({...cliente, suspendidoManual: false, suspendidoPorSistema: true}, 0, new Date())
      : null;
    if (nuevoEstado === "activo" && !esTrial && !reactivationPatch) {
      throw new Error("La suscripción no tiene un ciclo válido para reactivarse.");
    }

    transaction.update(clienteRef, {
      estado: nuevoEstado,
      suspendidoManual: nuevoEstado === "suspendido",
      suspendidoPorSistema: false,
      motivoSuspension: nuevoEstado === "suspendido" ? "manual" : "",
      ...(reactivationPatch || {}),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function anularMovimientoSaas({
  movimientoId,
  clienteSaasId,
  motivoAnulacion = "Anulado manualmente",
}) {
  if (!movimientoId) throw new Error("Movimiento inválido.");
  if (!clienteSaasId) throw new Error("Cliente SaaS inválido.");

  const ref = doc(db, "saas_pagos", movimientoId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("El movimiento no existe.");
  }

  const data = snap.data();

  if (data.anulado === true) {
    throw new Error("Este movimiento ya fue anulado.");
  }

  await updateDoc(ref, {
    anulado: true,
    estado: "anulado",
    motivoAnulacion,
    fechaAnulacion: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await recalcularEstadoCuentaCliente(clienteSaasId);
}
