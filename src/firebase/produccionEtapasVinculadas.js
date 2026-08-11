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

        sectoresProcesados: [],

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

  sectorOrigenId = "",
  sectorOrigenNombre = "",

  sectorDestinoId = "",
  sectorDestinoNombre = "",

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

await runTransaction(
  db,
  async (transaction) => {
    const etapaSnap =
      await transaction.get(
        etapaRef
      );

    if (!etapaSnap.exists()) {
      throw new Error(
        "La etapa vinculada ya no existe."
      );
    }

    const etapa =
      etapaSnap.data();

    const sectoresProcesadosActuales =
      Array.isArray(
        etapa.sectoresProcesados
      )
        ? etapa.sectoresProcesados
        : [];

    const cambioDeSector =
      Boolean(sectorOrigenId) &&
      Boolean(sectorDestinoId) &&
      String(sectorOrigenId) !==
        String(sectorDestinoId);

    let sectoresProcesadosNuevos =
      sectoresProcesadosActuales;

    /*
     * Si la rama sale de un sector hacia otro,
     * consideramos procesado el sector que deja.
     */
    if (cambioDeSector) {
      const yaProcesado =
        sectoresProcesadosActuales.some(
          (sector) =>
            String(
              sector?.sectorId || ""
            ) ===
            String(sectorOrigenId)
        );

      if (!yaProcesado) {
        sectoresProcesadosNuevos = [
          ...sectoresProcesadosActuales,
          {
            sectorId:
              sectorOrigenId,

            sectorNombre:
              sectorOrigenNombre || "",

            completadoPorUid:
              usuarioActor?.uid || "",

            completadoPorNombre:
              usuarioActor?.nombre || "",

            /*
             * Usamos fecha cliente dentro del array
             * porque serverTimestamp() no debe usarse
             * dentro de objetos de array de forma
             * problemática.
             */
            completadoAt:
              new Date().toISOString(),
          },
        ];
      }
    }

    transaction.update(
      etapaRef,
      {
        columnaProduccionId:
          columnaDestinoId,

        produccionSortOrder,

        sectoresProcesados:
          sectoresProcesadosNuevos,

        updatedAt:
          serverTimestamp(),

        ultimaAccionUid:
          usuarioActor?.uid || "",

        ultimaAccionNombre:
          usuarioActor?.nombre || "",
      }
    );
  }
);
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

  return runTransaction(
    db,
    async (transaction) => {
      /*
       * Leemos primero la etapa y el grupo.
       */
      const etapaSnap =
        await transaction.get(
          etapaRef
        );

      const grupoSnap =
        await transaction.get(
          grupoRef
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

      const etapa =
        etapaSnap.data();

      const grupo =
        grupoSnap.data();

      /*
       * Evita doble finalización.
       */
      if (etapa.estado === "lista") {
        return {
          yaFinalizada: true,
          listoReunion:
            grupo.estado ===
            "listo_reunion",
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
       * Esta etapa pasa a estado "lista".
       *
       * IMPORTANTE:
       * NO la movemos de columna.
       *
       * Queda registrada exactamente
       * donde fue finalizada.
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
       * Todavía quedan otras etapas
       * vinculadas trabajando.
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
          listoReunion: false,

          etapasFinalizadas:
            nuevasFinalizadas,

          totalEtapas,
        };
      }

      /*
       * ÚLTIMA ETAPA FINALIZADA.
       *
       * Ya NO reunimos automáticamente.
       *
       * El grupo queda preparado para
       * una futura acción explícita:
       *
       * "Reunir y continuar"
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
          estado:
            "listo_reunion",

          etapasFinalizadas:
            nuevasFinalizadas,

          listoReunionAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      return {
        reunionRealizada: false,
        listoReunion: true,

        etapasFinalizadas:
          nuevasFinalizadas,

        totalEtapas,

        columnaReunionId,
      };
    }
  );
}

export async function tomarGrupoVinculadoProduccion({
  grupoVinculadoId,
  pedidoId,
  produccionSortOrder = null,
  usuarioActor = null,
}) {
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
      const grupoSnap =
        await transaction.get(
          grupoRef
        );

      const pedidoSnap =
        await transaction.get(
          pedidoRef
        );

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

      const grupo =
        grupoSnap.data();

      const pedido =
        pedidoSnap.data();

      /*
       * Seguridad adicional:
       * el grupo tiene que corresponder
       * al mismo pedido.
       */
      if (
        String(grupo.pedidoId || "") !==
        String(pedidoId)
      ) {
        throw new Error(
          "El grupo no corresponde al pedido."
        );
      }

      /*
       * Si otro usuario ya lo tomó,
       * evitamos repetir la operación.
       */
      if (grupo.estado === "reunido") {
        return {
          yaTomado: true,
          columnaReunionId:
            grupo.columnaReunionId || "",
        };
      }

      /*
       * Solamente puede tomarse cuando
       * todas las etapas terminaron.
       */
      if (
        grupo.estado !==
        "listo_reunion"
      ) {
        throw new Error(
          "Todavía hay etapas pendientes."
        );
      }

      const totalEtapas =
        Number(
          grupo.totalEtapas || 0
        );

      const etapasFinalizadas =
        Number(
          grupo.etapasFinalizadas || 0
        );

      if (
        totalEtapas <= 0 ||
        etapasFinalizadas <
          totalEtapas
      ) {
        throw new Error(
          "Todavía hay etapas pendientes."
        );
      }

      const columnaReunionId =
        grupo.columnaReunionId || "";

      if (!columnaReunionId) {
        throw new Error(
          "No se encontró el punto de reunión."
        );
      }

      /*
       * Cerramos el flujo vinculado.
       */
      transaction.update(
        grupoRef,
        {
          estado: "reunido",

          reunidoAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * El pedido principal aparece
       * exactamente en el punto de reunión.
       *
       * Desde ese momento vuelve a funcionar
       * como una card común.
       */
      transaction.update(
        pedidoRef,
        {
          columnaProduccionId:
            columnaReunionId,

          estadoProduccion:
            "en_proceso",

          estado:
            pedido.estado === "Cancelado"
              ? "Cancelado"
              : "En proceso",

          produccionFinalizada:
            false,

          produccionSortOrder,

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
        tomado: true,
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