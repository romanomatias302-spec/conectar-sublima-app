import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

function getEtiquetasCollection(clienteId) {
  return collection(db, `clientes-saas/${clienteId}/produccion_etiquetas`);
}

function normalizarEtiquetas(lista = []) {
  return lista
    .filter((e) => e?.activa !== false)
    .sort((a, b) => (a?.orden || 0) - (b?.orden || 0));
}

export function escucharEtiquetasProduccion(clienteId, callback) {
  return onSnapshot(
    getEtiquetasCollection(clienteId),
    (snapshot) => {
      const lista = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      callback(normalizarEtiquetas(lista));
    },
    (error) => {
      console.error("Error escuchando etiquetas de producción:", error);
    }
  );
}

export async function obtenerEtiquetasProduccion(clienteId) {
  const snapshot = await getDocs(getEtiquetasCollection(clienteId));

  const lista = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  return normalizarEtiquetas(lista);
}

export async function crearEtiquetaProduccion({
  clienteId,
  nombre,
  color,
}) {
  const existentes = await obtenerEtiquetasProduccion(clienteId);
  const orden = existentes.length + 1;

  await addDoc(getEtiquetasCollection(clienteId), {
    nombre: (nombre || "").trim(),
    color: color || "rojo",
    activa: true,
    orden,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function actualizarEtiquetaProduccion({
  clienteId,
  etiquetaId,
  nombre,
  color,
  activa,
  orden,
}) {
  const ref = doc(db, `clientes-saas/${clienteId}/produccion_etiquetas`, etiquetaId);

  const payload = {
    updatedAt: serverTimestamp(),
  };

  if (typeof nombre === "string") payload.nombre = nombre.trim();
  if (typeof color === "string") payload.color = color;
  if (typeof activa === "boolean") payload.activa = activa;
  if (typeof orden === "number") payload.orden = orden;

  await updateDoc(ref, payload);
}

export async function desactivarEtiquetaProduccion({
  clienteId,
  etiquetaId,
}) {
  const ref = doc(db, `clientes-saas/${clienteId}/produccion_etiquetas`, etiquetaId);

  await updateDoc(ref, {
    activa: false,
    updatedAt: serverTimestamp(),
  });
}