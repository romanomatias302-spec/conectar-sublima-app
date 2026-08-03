import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const PRODUCCION_SECTORES_COLLECTION = "produccion_sectores";

export function escucharSectoresProduccion(clienteId, callback) {
  if (!clienteId) return () => {};

  const q = query(
    collection(db, PRODUCCION_SECTORES_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sectores = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter((sector) => sector.activo !== false)
        .sort((a, b) => {
          const ordenA = Number(a.orden ?? 999999);
          const ordenB = Number(b.orden ?? 999999);

          if (ordenA !== ordenB) return ordenA - ordenB;

          return String(a.nombre || "").localeCompare(
            String(b.nombre || "")
          );
        });

      callback(sectores);
    },
    (error) => {
      console.error(
        "Error escuchando sectores de producción:",
        error
      );
    }
  );
}

export async function crearSectorProduccion({
  clienteId,
  nombre,
  orden = 0,
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  const nombreLimpio = String(nombre || "").trim();

  if (!nombreLimpio) {
    throw new Error("Ingresá un nombre para el sector.");
  }

  const ref = await addDoc(
    collection(db, PRODUCCION_SECTORES_COLLECTION),
    {
      clienteId,
      nombre: nombreLimpio,
      orden: Number(orden || 0),
      activo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  return ref.id;
}

export async function actualizarSectorProduccion({
  sectorId,
  nombre,
}) {
  if (!sectorId) {
    throw new Error("Falta sectorId.");
  }

  const nombreLimpio = String(nombre || "").trim();

  if (!nombreLimpio) {
    throw new Error("Ingresá un nombre para el sector.");
  }

  await updateDoc(
    doc(db, PRODUCCION_SECTORES_COLLECTION, sectorId),
    {
      nombre: nombreLimpio,
      updatedAt: serverTimestamp(),
    }
  );
}

export async function desactivarSectorProduccion({
  clienteId,
  sectorId,
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  if (!sectorId) {
    throw new Error("Falta sectorId.");
  }

  const columnasQuery = query(
    collection(db, "produccion_columnas"),
    where("clienteId", "==", clienteId),
    where("sectorId", "==", sectorId)
  );

  const columnasSnapshot = await getDocs(columnasQuery);

  const columnasActivas = columnasSnapshot.docs.filter(
    (documento) => documento.data()?.activo !== false
  );

  if (columnasActivas.length > 0) {
    throw new Error(
      "No podés eliminar este sector porque todavía tiene columnas asignadas."
    );
  }

  await updateDoc(
    doc(db, PRODUCCION_SECTORES_COLLECTION, sectorId),
    {
      activo: false,
      updatedAt: serverTimestamp(),
    }
  );
}