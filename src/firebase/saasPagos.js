import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

function sumarUnMes(fechaStr) {
  if (!fechaStr) return "";
  const fecha = new Date(fechaStr);
  fecha.setMonth(fecha.getMonth() + 1);
  return fecha.toISOString().slice(0, 10);
}

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

const billingCurrency = String(
  clienteSaas.billingCurrency ||
  clienteSaas.moneda ||
  "ARS"
).toUpperCase();

await addDoc(collection(db, "saas_pagos"), {
  clienteSaasId: clienteSaas.id,
  clienteNombre: clienteSaas.nombre || "",
  tipoMovimiento,
  monto: Number(monto || 0),
  billingCurrency,
  fechaPago,
  medioPago,
  concepto,
  periodoFacturado,
  observacion,
  anulado: false,
  estado: "activo",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

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

  const snap = await getDocs(
    query(
      collection(db, "clientes-saas"),
      where("__name__", "==", clienteSaasId)
    )
  );

  const cliente = snap.docs[0]?.data();

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

  await updateDoc(clienteRef, {
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

    updatedAt: serverTimestamp(),
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
