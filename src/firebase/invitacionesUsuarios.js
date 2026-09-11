import {
  doc,
  getDoc,
  getDocs,
  query,
  collection,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  aceptarInvitacionSaas,
  cancelarInvitacionSaas,
  crearInvitacionSaas,
} from "./saasEntitlements";

const INVITACIONES_COLLECTION = "invitaciones_usuarios";

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

  return crearInvitacionSaas({
    clienteId,
    nombre: nombreLimpio,
    email: emailLimpio,
    rol,
    creadoPorUid: creadoPor?.uid || null,
  });
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
  nombre,
  dbInstance = db,
}) {
  if (!invitacionId) throw new Error("Falta invitacionId");

  if (dbInstance !== db) throw new Error("dbInstance alternativo no soportado por enforcement SaaS");
  await aceptarInvitacionSaas({invitacionId, usuarioCreadoUid, nombre});
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
  return cancelarInvitacionSaas(invitacionId);
}
