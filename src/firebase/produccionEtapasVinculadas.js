import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
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
    etapasFinalizadas: 0,

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

        produccionSortOrder: null,

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

export async function moverEtapaVinculadaProduccion({
  etapaId,
  columnaDestinoId,
  produccionSortOrder = null,
  usuarioActor = null,
}) {
  if (!etapaId) {
    throw new Error(
      "Falta etapaId para mover la etapa vinculada."
    );
  }

  if (!columnaDestinoId) {
    throw new Error(
      "Falta la columna destino."
    );
  }

  const etapaRef = doc(
    db,
    ETAPAS_COLLECTION,
    etapaId
  );

  await updateDoc(etapaRef, {
    columnaProduccionId:
      columnaDestinoId,
       produccionSortOrder,

    updatedAt:
      serverTimestamp(),

    ultimaAccionUid:
      usuarioActor?.uid || "",

    ultimaAccionNombre:
      usuarioActor?.nombre || "",
  });
}

export async function finalizarEtapaVinculadaProduccion({
  etapaId,
  grupoVinculadoId,
  pedidoId,
  usuarioActor = null,
}) {
  if (!etapaId) {
    throw new Error(
      "Falta etapaId."
    );
  }

  if (!grupoVinculadoId) {
    throw new Error(
      "Falta grupoVinculadoId."
    );
  }

  if (!pedidoId) {
    throw new Error(
      "Falta pedidoId."
    );
  }

  const etapaRef = doc(
    db,
    ETAPAS_COLLECTION,
    etapaId
  );

  const grupoRef = doc(
    db,
    GRUPOS_COLLECTION,
    grupoVinculadoId
  );

  const pedidoRef = doc(
    db,
    "pedidos",
    pedidoId
  );

  return runTransaction(
    db,
    async (transaction) => {
      /*
       * Leemos primero todo lo necesario.
       */
      const etapaSnap =
        await transaction.get(
          etapaRef
        );

      const grupoSnap =
        await transaction.get(
          grupoRef
        );

      const pedidoSnap =
        await transaction.get(
          pedidoRef
        );

      if (!etapaSnap.exists()) {
        throw new Error(
          "La etapa vinculada ya no existe."
        );
      }

      if (!grupoSnap.exists()) {
        throw new Error(
          "El grupo vinculado ya no existe."
        );
      }

      if (!pedidoSnap.exists()) {
        throw new Error(
          "El pedido ya no existe."
        );
      }

      const etapa =
        etapaSnap.data();

      const grupo =
        grupoSnap.data();

      const pedido =
        pedidoSnap.data();

      /*
       * Evita doble finalización.
       *
       * Si dos usuarios hacen click casi
       * al mismo tiempo, no contamos dos veces.
       */
      if (etapa.estado === "lista") {
        return {
          yaFinalizada: true,
          reunionRealizada:
            grupo.estado === "reunido",
        };
      }

      if (etapa.estado !== "activa") {
        throw new Error(
          "Esta etapa ya no está activa."
        );
      }

      const totalEtapas =
        Number(
          grupo.totalEtapas || 0
        );

      const finalizadasActuales =
        Number(
          grupo.etapasFinalizadas || 0
        );

      const nuevasFinalizadas =
        finalizadasActuales + 1;

      const esUltimaEtapa =
        totalEtapas > 0 &&
        nuevasFinalizadas >=
          totalEtapas;

      /*
       * Marcamos ESTA rama como lista.
       */
      transaction.update(
        etapaRef,
        {
          estado: "lista",

          listaAt:
            serverTimestamp(),

          listaPorUid:
            usuarioActor?.uid || "",

          listaPorNombre:
            usuarioActor?.nombre || "",

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * Todavía quedan ramas trabajando.
       */
      if (!esUltimaEtapa) {
        transaction.update(
          grupoRef,
          {
            etapasFinalizadas:
              nuevasFinalizadas,

            updatedAt:
              serverTimestamp(),
          }
        );

        return {
          reunionRealizada: false,
          etapasFinalizadas:
            nuevasFinalizadas,
          totalEtapas,
        };
      }

      /*
       * ÚLTIMA RAMA.
       *
       * El grupo deja de estar activo.
       * Desde este momento la capa de
       * representaciones volverá a mostrar
       * el pedido principal.
       */
      const columnaReunionId =
        grupo.columnaReunionId || "";

      if (!columnaReunionId) {
        throw new Error(
          "El grupo no tiene columna de reunión."
        );
      }

      transaction.update(
        grupoRef,
        {
          estado: "reunido",

          etapasFinalizadas:
            nuevasFinalizadas,

          reunidoAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * La card normal reaparece directamente
       * en la columna elegida como reunión.
       */
      transaction.update(
        pedidoRef,
        {
          columnaProduccionId:
            columnaReunionId,

          estadoProduccion:
            "en_proceso",

          estado:
            pedido.estado ===
            "Cancelado"
              ? "Cancelado"
              : "En proceso",

          produccionFinalizada:
            false,

          produccionActualizadoAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),

          ultimaAccionProduccionPor:
            usuarioActor?.uid || "",

          ultimaAccionProduccionPorNombre:
            usuarioActor?.nombre || "",

          ultimaAccionProduccionAt:
            serverTimestamp(),
        }
      );

      return {
        reunionRealizada: true,
        columnaReunionId,
      };
    }
  );
}

async function recalcularEstadoGrupoVinculadoProduccion({
  grupoVinculadoId,
}) {
  if (!grupoVinculadoId) return;

  const q = query(
    collection(
      db,
      ETAPAS_COLLECTION
    ),
    where(
      "grupoVinculadoId",
      "==",
      grupoVinculadoId
    )
  );

  const snapshot =
    await getDocs(q);

  const etapas =
    snapshot.docs.map(
      (documento) => ({
        id: documento.id,
        ...documento.data(),
      })
    );

  const etapasValidas =
    etapas.filter(
      (etapa) =>
        etapa.estado !== "cancelada"
    );

  if (etapasValidas.length === 0) {
    return;
  }

  const todasListas =
    etapasValidas.every(
      (etapa) =>
        etapa.estado === "lista"
    );

  if (!todasListas) {
    return;
  }

  const grupoRef = doc(
    db,
    GRUPOS_COLLECTION,
    grupoVinculadoId
  );

  await updateDoc(grupoRef, {
    estado: "listo_reunion",
    listoReunionAt:
      serverTimestamp(),
    updatedAt:
      serverTimestamp(),
  });
}