import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";



const PRODUCCION_COLUMNAS_COLLECTION = "produccion_columnas";

const PALETA_COLUMNAS = [
  { colorFondo: "#F6F8FF", colorBorde: "#D9E2FF" },
  { colorFondo: "#F4FBF7", colorBorde: "#D7F0E0" },
  { colorFondo: "#FFF8F3", colorBorde: "#F5DDCB" },
  { colorFondo: "#FAF5FF", colorBorde: "#E7D9F8" },
  { colorFondo: "#F4FBFB", colorBorde: "#D6ECEC" },
  { colorFondo: "#FFF9EF", colorBorde: "#F0E0BA" },
  { colorFondo: "#F8F6FF", colorBorde: "#DDD7F6" },
  { colorFondo: "#F7FAF4", colorBorde: "#DCE8D1" },
];

function obtenerColorSiguiente(columnas) {
  const usadas = new Set(
    columnas
      .filter((c) => !c.esInicial && !c.esFinal)
      .map((c) => `${c.colorFondo || ""}_${c.colorBorde || ""}`)
  );

  const libre = PALETA_COLUMNAS.find(
    (c) => !usadas.has(`${c.colorFondo}_${c.colorBorde}`)
  );

  return libre || PALETA_COLUMNAS[columnas.length % PALETA_COLUMNAS.length];
}

export async function obtenerColumnasProduccion(clienteId) {
  const q = query(
    collection(db, PRODUCCION_COLUMNAS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
    }))
    .filter(col => col.activo !== false)
    .sort((a,b) => a.orden - b.orden);
}



export async function obtenerColumnaInicialProduccion(clienteId) {
  const columnas = await obtenerColumnasProduccion(clienteId);

  return columnas.find(col => col.esInicial) || null;
}

export async function obtenerColumnaFinalProduccion(clienteId) {
  const columnas = await obtenerColumnasProduccion(clienteId);

  return columnas.find(col => col.esFinal) || null;
}

export async function asegurarColumnasBaseProduccion(clienteId) {
  const columnas = await obtenerColumnasProduccion(clienteId);

  const tieneInicial = columnas.some((col) => col.esInicial);
  const tieneFinal = columnas.some((col) => col.esFinal);

  if (!tieneInicial) {
  await addDoc(collection(db, PRODUCCION_COLUMNAS_COLLECTION), {
    clienteId,
    nombre: "Pendiente",
    orden: 0,
    esInicial: true,
    esFinal: false,
    activo: true,
    colorFondo: "#F7F7F8",
    colorBorde: "#D9DEE8",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

if (!tieneFinal) {
  await addDoc(collection(db, PRODUCCION_COLUMNAS_COLLECTION), {
    clienteId,
    nombre: "Producción finalizada",
    orden: 9999,
    esInicial: false,
    esFinal: true,
    activo: true,
    colorFondo: "#EEF8F0",
    colorBorde: "#CFE7D3",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

  return await obtenerColumnasProduccion(clienteId);
}

export async function crearColumnaProduccion({ clienteId, nombre, orden }) {
  const ref = await addDoc(collection(db, PRODUCCION_COLUMNAS_COLLECTION), {
    clienteId,
    nombre: nombre?.trim() || "Nueva columna",
    orden,
    esInicial: false,
    esFinal: false,
    activo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function actualizarColumnaProduccion(columnaId, data) {
  const ref = doc(db, PRODUCCION_COLUMNAS_COLLECTION, columnaId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function desactivarColumnaProduccion(columnaId) {
  const ref = doc(db, PRODUCCION_COLUMNAS_COLLECTION, columnaId);
  await updateDoc(ref, {
    activo: false,
    updatedAt: serverTimestamp(),
  });
}

export async function crearColumnaIntermediaProduccion({ clienteId, nombre }) {
  const columnas = await obtenerColumnasProduccion(clienteId);

  const columnasIntermedias = columnas
    .filter((c) => !c.esInicial && !c.esFinal)
    .sort((a, b) => a.orden - b.orden);

  let nuevoOrden = 1;

  if (columnasIntermedias.length > 0) {
    nuevoOrden = columnasIntermedias[columnasIntermedias.length - 1].orden + 1;
  }

  const color = obtenerColorSiguiente(columnas);

  const ref = await addDoc(collection(db, PRODUCCION_COLUMNAS_COLLECTION), {
    clienteId,
    nombre: nombre?.trim() || "Nueva columna",
    orden: nuevoOrden,
    esInicial: false,
    esFinal: false,
    activo: true,
    colorFondo: color.colorFondo,
    colorBorde: color.colorBorde,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export function escucharColumnasProduccion(clienteId, callback) {
  const q = query(
    collection(db, PRODUCCION_COLUMNAS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const columnas = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter((col) => col.activo !== false)
        .sort((a, b) => a.orden - b.orden);

      callback(columnas);
    },
    (error) => {
      console.error("Error escuchando columnas de producción:", error);
    }
  );
}