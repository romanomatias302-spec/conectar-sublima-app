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
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";


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
}) {
  const nombreLimpio = (nombre || "").trim();
  const emailLimpio = (email || "").trim().toLowerCase();

  if (!clienteId) throw new Error("Falta clienteId");
  if (!nombreLimpio) throw new Error("Completá el nombre");
  if (!emailLimpio) throw new Error("Completá el email");

  const crearInvitacionSaas = httpsCallable(
    functions,
    "crearInvitacionUsuarioSaas"
  );

  try {
    const resultado = await crearInvitacionSaas({
      clienteId,
      nombre: nombreLimpio,
      email: emailLimpio,
      rol,
    });

    const data = resultado.data || {};

    return {
      id: data.token,
      token: data.token,
      expiraAt: data.expiration || null,
    };
  } catch (error) {
    console.error("Error creando invitación SaaS:", error);

    const mensaje =
      error?.message ||
      "No se pudo crear la invitación.";

    throw new Error(mensaje);
  }
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
  if (!invitacionId) {
    throw new Error("Falta invitacionId");
  }

  const cancelarInvitacionSaas = httpsCallable(
    functions,
    "cancelarInvitacionUsuarioSaas"
  );

  try {
    const resultado = await cancelarInvitacionSaas({
      invitacionId,
    });

    return resultado.data;
  } catch (error) {
    console.error("Error cancelando invitación SaaS:", error);

    const mensaje =
      error?.message ||
      "No se pudo cancelar la invitación.";

    throw new Error(mensaje);
  }
}

