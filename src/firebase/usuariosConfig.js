import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const USUARIOS_COLLECTION = "usuarios";

export async function obtenerUsuariosPorCliente(clienteId) {
  if (!clienteId) return [];

  const q = query(
    collection(db, USUARIOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      uid: d.id,
      ...d.data(),
    }))
    .sort((a, b) => {
      const nombreA = (a.nombre || a.email || "").toLowerCase();
      const nombreB = (b.nombre || b.email || "").toLowerCase();
      return nombreA.localeCompare(nombreB);
    });
}

export async function actualizarPermisosUsuario(uid, permisos) {
  if (!uid) throw new Error("Falta uid");

  await updateDoc(doc(db, USUARIOS_COLLECTION, uid), {
    permisos,
  });
}