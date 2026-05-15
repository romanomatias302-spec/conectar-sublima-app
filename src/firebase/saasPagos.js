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
  observacion = "",
}) {
  if (!clienteSaas?.id) throw new Error("Cliente SaaS inválido.");
  if (Number(monto || 0) <= 0) throw new Error("El monto debe ser mayor a 0.");

await addDoc(collection(db, "saas_pagos"), {
  clienteSaasId: clienteSaas.id,
  clienteNombre: clienteSaas.nombre || "",
  tipoMovimiento,
  monto: Number(monto || 0),
  fechaPago,
  medioPago,
  concepto,
  observacion,
  estado: "activo",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

await recalcularEstadoCuentaCliente(clienteSaas.id);

  const proximoVencimiento =
    concepto === "mensualidad" ? sumarUnMes(fechaPago) : clienteSaas.proximoVencimiento || "";

  await updateDoc(doc(db, "clientes-saas", clienteSaas.id), {
    ultimoPago: fechaPago,
    proximoVencimiento,
    estado: "activo",
    updatedAt: serverTimestamp(),
  });
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

  let estadoCuenta = "al_dia";

  if (saldo > 0) estadoCuenta = "mora";
  if (saldo < 0) estadoCuenta = "saldo_favor";

  await updateDoc(doc(db, "clientes-saas", clienteSaasId), {
    saldoCuentaCorriente: saldo,
    estadoCuenta,
    updatedAt: serverTimestamp(),
  });
}