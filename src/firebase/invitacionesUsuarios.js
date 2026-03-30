import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const INVITACIONES_COLLECTION = "invitaciones_usuarios";

function generarTokenSeguro() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

function sumarDias(fecha, dias) {
  const nueva = new Date(fecha);
  nueva.setDate(nueva.getDate() + dias);
  return nueva;
}

export async function crearInvitacionUsuario({
  clienteId,
  nombre,
  email,
  rol = "usuario",
  creadoPor = null,
}) {
  const nombreLimpio = (nombre || "").trim();
  const emailLimpio = (email || "").trim().toLowerCase();

  if (!clienteId) throw new Error("Falta clienteId");
  if (!nombreLimpio) throw new Error("Completá el nombre");
  if (!emailLimpio) throw new Error("Completá el email");

  const existentePendiente = query(
    collection(db, INVITACIONES_COLLECTION),
    where("clienteId", "==", clienteId),
    where("email", "==", emailLimpio),
    where("estado", "==", "pendiente")
  );

  const existenteSnap = await getDocs(existentePendiente);

  if (!existenteSnap.empty) {
    throw new Error("Ya existe una invitación pendiente para ese email");
  }

  const token = generarTokenSeguro();
  const expiraAt = sumarDias(new Date(), 7);

  const ref = doc(db, INVITACIONES_COLLECTION, token);

  await setDoc(ref, {
    clienteId,
    nombre: nombreLimpio,
    email: emailLimpio,
    rol,
    token,
    estado: "pendiente", // pendiente | usada | vencida | cancelada
    createdAt: serverTimestamp(),
    expiraAt,
    creadoPorUid: creadoPor?.uid || null,
    creadoPorNombre: creadoPor?.nombre || creadoPor?.email || null,
    usadoAt: null,
    usuarioCreadoUid: null,
  });

  return {
    id: token,
    token,
    expiraAt,
  };
}

export async function obtenerInvitacionPorToken(token) {
  if (!token) return null;

  const ref = doc(db, INVITACIONES_COLLECTION, token);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}

export function invitacionEstaVencida(invitacion) {
  if (!invitacion?.expiraAt) return true;

  const fechaExpira =
    typeof invitacion.expiraAt?.toDate === "function"
      ? invitacion.expiraAt.toDate()
      : new Date(invitacion.expiraAt);

  return fechaExpira.getTime() < Date.now();
}

export async function marcarInvitacionComoUsada({
  invitacionId,
  usuarioCreadoUid,
  dbInstance = db,
}) {
  if (!invitacionId) throw new Error("Falta invitacionId");

  await updateDoc(doc(dbInstance, INVITACIONES_COLLECTION, invitacionId), {
    estado: "usada",
    usadoAt: serverTimestamp(),
    usuarioCreadoUid: usuarioCreadoUid || null,
  });
}

export async function escucharInvitacionesPorCliente(clienteId) {
  const q = query(
    collection(db, INVITACIONES_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
    }))
    .sort((a, b) => {
      const aSec = a.createdAt?.seconds || 0;
      const bSec = b.createdAt?.seconds || 0;
      return bSec - aSec;
    });
}

export async function cancelarInvitacion(invitacionId) {
  const ref = doc(db, INVITACIONES_COLLECTION, invitacionId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("La invitación no existe");
  }

  await updateDoc(ref, {
    estado: "cancelada",
  });
}