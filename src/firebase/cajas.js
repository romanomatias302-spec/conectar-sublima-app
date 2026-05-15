import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export function fechaHoyInput() {
  return new Date().toISOString().slice(0, 10);
}

export async function obtenerCajaDelDia({ perfil, fechaCaja = fechaHoyInput() }) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const q = query(
    collection(db, "cajas"),
    where("clienteId", "==", perfil.clienteId),
    where("fechaCaja", "==", fechaCaja),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { firebaseId: d.id, ...d.data() };
}

export async function obtenerUltimaCajaCerradaAnterior({
  perfil,
  fechaCaja = fechaHoyInput(),
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const q = query(
    collection(db, "cajas"),
    where("clienteId", "==", perfil.clienteId),
    limit(60)
  );

  const snap = await getDocs(q);

  const cajas = snap.docs
    .map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
    .filter(
      (caja) =>
        caja.estado === "cerrada" &&
        caja.fechaCaja &&
        caja.fechaCaja < fechaCaja
    )
    .sort((a, b) => (a.fechaCaja < b.fechaCaja ? 1 : -1));

  return cajas[0] || null;
}

export async function abrirCaja({
  perfil,
  fechaCaja = fechaHoyInput(),
  saldoAperturaEfectivo = 0,
  observacionApertura = "",
  cajaAnterior = null,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const cajaExistente = await obtenerCajaDelDia({ perfil, fechaCaja });

  if (cajaExistente?.estado === "abierta") {
    throw new Error("Ya existe una caja abierta para este día.");
  }

  if (cajaExistente?.estado === "cerrada") {
    throw new Error("La caja de este día ya fue cerrada.");
  }

  const saldoAnterior = Number(cajaAnterior?.saldoCierreRealEfectivo || 0);
  const apertura = Number(saldoAperturaEfectivo || 0);
  const diferenciaApertura = apertura - saldoAnterior;

  const ref = await addDoc(collection(db, "cajas"), {
    clienteId: perfil.clienteId,
    fechaCaja,
    estado: "abierta",

    saldoCierreAnteriorEfectivo: saldoAnterior,
    fechaCajaAnterior: cajaAnterior?.fechaCaja || "",
    saldoAperturaEfectivo: apertura,
    diferenciaAperturaEfectivo: diferenciaApertura,

    saldoCierreEsperadoEfectivo: 0,
    saldoCierreRealEfectivo: 0,
    diferenciaCierreEfectivo: 0,

    observacionApertura,
    observacionCierre: "",

    abiertaPor: perfil?.email || "",
    cerradaPor: "",

    abiertaAt: serverTimestamp(),
    cerradaAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { firebaseId: ref.id };
}

export async function obtenerMovimientosCajaDia({
  perfil,
  fechaCaja = fechaHoyInput(),
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const q = query(
    collection(db, "movimientos"),
    where("clienteId", "==", perfil.clienteId),
    where("fecha", "==", fechaCaja)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
    .sort((a, b) => {
      const fechaA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const fechaB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return fechaB - fechaA;
    });
}

export async function crearMovimientoManualCaja({
  perfil,
  caja,
  tipo,
  subtipo,
  medioPago = "efectivo",
  monto,
  descripcion = "",
  observacion = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("No hay caja abierta.");
  if (caja.estado !== "abierta") throw new Error("La caja no está abierta.");

  const montoNum = Number(monto || 0);
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a 0.");

  const impactaResultado = ["gasto_caja", "descuento_efectivo"].includes(subtipo);

  await addDoc(collection(db, "movimientos"), {
    clienteId: perfil.clienteId,
    cajaId: caja.firebaseId,
    fechaCaja: caja.fechaCaja,
    fecha: caja.fechaCaja,

    tipo,
    subtipo,
    origen: "caja",
    origenRefId: caja.firebaseId,

    descripcion,
    observacion,

    monto: montoNum,
    medioPago,

    impactaCaja: true,
    impactaResultado,
    estadoMovimiento: "activo",

    creadoPor: perfil?.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function cerrarCaja({
  perfil,
  caja,
  saldoCierreRealEfectivo,
  observacionCierre = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("Caja inválida.");
  if (caja.estado !== "abierta") throw new Error("La caja no está abierta.");

  const movimientos = await obtenerMovimientosCajaDia({
    perfil,
    fechaCaja: caja.fechaCaja,
  });

  const activos = movimientos.filter(
    (m) => (m.estadoMovimiento || "activo") === "activo"
  );

  const ingresosEfectivo = activos
    .filter((m) => m.tipo === "ingreso" && m.medioPago === "efectivo")
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const egresosEfectivo = activos
    .filter((m) => m.tipo === "egreso" && m.medioPago === "efectivo")
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const esperado =
    Number(caja.saldoAperturaEfectivo || 0) + ingresosEfectivo - egresosEfectivo;

  const real = Number(saldoCierreRealEfectivo || 0);
  const diferencia = real - esperado;

  await updateDoc(doc(db, "cajas", caja.firebaseId), {
    estado: "cerrada",
    saldoCierreEsperadoEfectivo: esperado,
    saldoCierreRealEfectivo: real,
    diferenciaCierreEfectivo: diferencia,
    observacionCierre,
    cerradaPor: perfil?.email || "",
    cerradaAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function reabrirCaja({
  perfil,
  caja,
  motivoReapertura = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("Caja inválida.");
  if (caja.estado !== "cerrada") throw new Error("La caja no está cerrada.");

  await updateDoc(doc(db, "cajas", caja.firebaseId), {
    estado: "abierta",
    motivoReapertura,
    reabiertaPor: perfil?.email || "",
    reabiertaAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}