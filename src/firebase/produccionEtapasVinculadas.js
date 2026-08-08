import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase";

const GRUPOS_COLLECTION =
  "produccion_grupos_vinculados";

const ETAPAS_COLLECTION =
  "produccion_etapas_vinculadas";

/**
 * Escucha todos los grupos vinculados del tenant.
 *
 * La consulta siempre está aislada por clienteId.
 */
export function escucharGruposVinculadosProduccion(
  clienteId,
  callback
) {
  if (!clienteId) return () => {};

  const q = query(
    collection(db, GRUPOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const grupos = snapshot.docs
        .map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
        .filter(
          (grupo) =>
            grupo.estado !== "cancelado"
        );

      callback(grupos);
    },
    (error) => {
      console.error(
        "Error escuchando grupos vinculados:",
        error
      );
    }
  );
}

/**
 * Escucha las ramas/etapas vinculadas del tenant.
 */
export function escucharEtapasVinculadasProduccion(
  clienteId,
  callback
) {
  if (!clienteId) return () => {};

  const q = query(
    collection(db, ETAPAS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const etapas = snapshot.docs
        .map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
        .filter(
          (etapa) =>
            etapa.estado !== "cancelada"
        );

      callback(etapas);
    },
    (error) => {
      console.error(
        "Error escuchando etapas vinculadas:",
        error
      );
    }
  );
}

/**
 * Crea un grupo de producción paralela.
 *
 * Ejemplo:
 *
 * Diseño ─────────┐
 *                 ├─> Calandra
 * Corte anticipado┘
 */
export async function crearGrupoVinculadoProduccion({
  clienteId,
  pedidoId,
  columnaOrigenId = "",
  columnaReunionId,
  etapas = [],
  usuarioActor = null,
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  if (!pedidoId) {
    throw new Error("Falta pedidoId.");
  }

  if (!columnaReunionId) {
    throw new Error(
      "Seleccioná una columna de reunión."
    );
  }

  const etapasValidas = Array.isArray(etapas)
    ? etapas.filter(
        (etapa) =>
          etapa?.columnaProduccionId
      )
    : [];

  if (etapasValidas.length < 2) {
    throw new Error(
      "Seleccioná al menos dos etapas vinculadas."
    );
  }

  /*
   * Generamos los IDs antes del commit.
   * Así grupo + ramas se crean atómicamente.
   */
  const grupoRef = doc(
    collection(db, GRUPOS_COLLECTION)
  );

  const batch = writeBatch(db);

  batch.set(grupoRef, {
    clienteId,
    pedidoId,

    columnaOrigenId:
      columnaOrigenId || "",

    columnaReunionId,

    estado: "activo",

    totalEtapas: etapasValidas.length,

    createdByUid:
      usuarioActor?.uid || "",

    createdByNombre:
      usuarioActor?.nombre || "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  etapasValidas.forEach(
    (etapa, index) => {
      const etapaRef = doc(
        collection(db, ETAPAS_COLLECTION)
      );

      batch.set(etapaRef, {
        clienteId,
        pedidoId,

        grupoVinculadoId:
          grupoRef.id,

        nombre:
          String(
            etapa.nombre || ""
          ).trim() ||
          `Etapa ${index + 1}`,

        columnaProduccionId:
          etapa.columnaProduccionId,

        estado: "activa",

        ordenRama: index + 1,

        createdByUid:
          usuarioActor?.uid || "",

        createdByNombre:
          usuarioActor?.nombre || "",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),

        listaAt: null,
        listaPorUid: "",
        listaPorNombre: "",
      });
    }
  );

  await batch.commit();

  return {
    grupoId: grupoRef.id,
  };
}