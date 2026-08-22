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

  /*
 * Creamos antes las referencias de las etapas
 * para poder registrar desde el inicio qué
 * columna corresponde a cada card vinculada.
 */
const etapasConRef =
  etapasValidas.map(
    (etapa, index) => ({
      etapa,
      index,
      etapaRef: doc(
        collection(
          db,
          ETAPAS_COLLECTION
        )
      ),
    })
  );

const columnasUsadas =
  etapasConRef.map(
    ({ etapa, etapaRef }) => ({
      columnaId:
        etapa.columnaProduccionId,

      etapaId:
        etapaRef.id,
    })
  );

  batch.set(grupoRef, {
    clienteId,
    pedidoId,

    columnaOrigenId:
      columnaOrigenId || "",

    columnaReunionId,

    estado: "activo",

    totalEtapas: etapasValidas.length,
    etapasFinalizadas: 0,
    columnasUsadas,

    createdByUid:
      usuarioActor?.uid || "",

    createdByNombre:
      usuarioActor?.nombre || "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  etapasConRef.forEach(
    ({
      etapa,
      index,
      etapaRef,
    }) => {

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

export async function editarGrupoVinculadoProduccion({
  clienteId,
  pedidoId,
  grupoVinculadoId,
  columnaReunionId,
  etapas = [],
  etapasActuales = [],
  usuarioActor = null,
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  if (!pedidoId) {
    throw new Error("Falta pedidoId.");
  }

  if (!grupoVinculadoId) {
    throw new Error(
      "No se encontró la vinculación."
    );
  }

  if (!columnaReunionId) {
    throw new Error(
      "Seleccioná una columna de reunión."
    );
  }

  const etapasSeleccionadas =
    Array.isArray(etapas)
      ? etapas.filter(
          (etapa) =>
            etapa?.columnaProduccionId
        )
      : [];

  if (etapasSeleccionadas.length < 2) {
    throw new Error(
      "La producción vinculada debe conservar al menos dos etapas."
    );
  }

  const grupoRef = doc(
    db,
    GRUPOS_COLLECTION,
    grupoVinculadoId
  );

  /*
   * Las referencias de las etapas existentes
   * vienen del flujo que ya está cargado en UI.
   */
  const etapasActualesValidas =
    Array.isArray(etapasActuales)
      ? etapasActuales.filter(
          (etapa) => etapa?.id
        )
      : [];

  const referenciasActuales =
    etapasActualesValidas.map(
      (etapa) => ({
        etapa,
        ref: doc(
          db,
          ETAPAS_COLLECTION,
          etapa.id
        ),
      })
    );

  /*
   * Precreamos refs para posibles etapas nuevas.
   * Después, dentro de la transacción,
   * decidimos cuáles realmente se utilizan.
   */
  const referenciasNuevas =
    etapasSeleccionadas.map(
      (etapa) => ({
        etapa,
        ref: doc(
          collection(
            db,
            ETAPAS_COLLECTION
          )
        ),
      })
    );

  return runTransaction(
    db,
    async (transaction) => {
      const grupoSnap =
        await transaction.get(
          grupoRef
        );

      if (!grupoSnap.exists()) {
        throw new Error(
          "La vinculación ya no existe."
        );
      }

      const grupo = grupoSnap.data();

      if (
        String(grupo.clienteId || "") !==
          String(clienteId) ||
        String(grupo.pedidoId || "") !==
          String(pedidoId)
      ) {
        throw new Error(
          "La vinculación no pertenece a este pedido."
        );
      }

      if (grupo.estado === "reunido") {
        throw new Error(
          "Este vínculo ya fue reunido y no puede editarse."
        );
      }

      /*
       * Leemos las etapas existentes dentro de
       * la misma transacción.
       */
      const etapasFirestore = [];

      for (
        const item of referenciasActuales
      ) {
        const snap =
          await transaction.get(
            item.ref
          );

        if (!snap.exists()) {
          continue;
        }

        etapasFirestore.push({
          id: snap.id,
          ref: item.ref,
          ...snap.data(),
        });
      }

      const columnasSeleccionadasSet =
        new Set(
          etapasSeleccionadas.map(
            (etapa) =>
              String(
                etapa.columnaProduccionId
              )
          )
        );

      /*
       * Determinamos qué etapas existentes
       * continúan y cuáles fueron desmarcadas.
       */
      const etapasConservadas = [];
      const etapasAEliminar = [];

      etapasFirestore.forEach(
        (etapa) => {
          const sigueSeleccionada =
            columnasSeleccionadasSet.has(
              String(
                etapa.columnaProduccionId ||
                  ""
              )
            );

          if (sigueSeleccionada) {
            etapasConservadas.push(
              etapa
            );
          } else {
            etapasAEliminar.push(
              etapa
            );
          }
        }
      );

      const columnasUsadasActuales =
        Array.isArray(
          grupo.columnasUsadas
        )
          ? grupo.columnasUsadas
          : [];

      /*
       * Una etapa solamente puede eliminarse
       * cuando NO tuvo ningún avance.
       */
      etapasAEliminar.forEach(
        (etapa) => {
          const usosEtapa =
            columnasUsadasActuales.filter(
              (item) =>
                String(
                  item?.etapaId || ""
                ) ===
                String(etapa.id)
            );

          const sinMovimientos =
            usosEtapa.length === 1 &&
            String(
              usosEtapa[0]?.columnaId ||
                ""
            ) ===
              String(
                etapa.columnaProduccionId ||
                  ""
              );

          const sinSectoresProcesados =
            !Array.isArray(
              etapa.sectoresProcesados
            ) ||
            etapa.sectoresProcesados
              .length === 0;

          const nuncaFinalizada =
            etapa.estado === "activa" &&
            !etapa.listaAt &&
            !etapa.listaPorUid &&
            !etapa.listaPorNombre;

          const sinAccionesPosteriores =
            !etapa.ultimaAccionUid &&
            !etapa.ultimaAccionNombre;

          if (
            !sinMovimientos ||
            !sinSectoresProcesados ||
            !nuncaFinalizada ||
            !sinAccionesPosteriores
          ) {
            const error = new Error(
              `La etapa "${
                etapa.nombre ||
                "Etapa vinculada"
              }" ya tiene avances y no puede eliminarse.`
            );

            error.code =
              "produccion/etapa-vinculada-con-avances";

            throw error;
          }
        }
      );

      /*
       * Identificamos columnas que ya pertenecen
       * a una etapa existente.
       */
      const columnasExistentes =
        new Set(
          etapasConservadas.map(
            (etapa) =>
              String(
                etapa.columnaProduccionId ||
                  ""
              )
          )
        );

      const etapasNuevas =
        referenciasNuevas.filter(
          ({ etapa }) =>
            !columnasExistentes.has(
              String(
                etapa.columnaProduccionId
              )
            )
        );

      const totalNuevo =
        etapasConservadas.length +
        etapasNuevas.length;

      if (totalNuevo < 2) {
        throw new Error(
          "La producción vinculada debe conservar al menos dos etapas."
        );
      }

      /*
       * Eliminamos únicamente etapas sin avance.
       */
      etapasAEliminar.forEach(
        (etapa) => {
          transaction.delete(
            etapa.ref
          );
        }
      );

      /*
       * Creamos las nuevas etapas.
       */
      etapasNuevas.forEach(
        ({ etapa, ref }, index) => {
          transaction.set(ref, {
            clienteId,
            pedidoId,

            grupoVinculadoId,

            nombre:
              String(
                etapa.nombre || ""
              ).trim() ||
              `Etapa ${
                etapasConservadas.length +
                index +
                1
              }`,

            columnaProduccionId:
              etapa.columnaProduccionId,

            estado: "activa",

            ordenRama:
              etapasConservadas.length +
              index +
              1,

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

      /*
       * Sacamos del historial del grupo las
       * columnas pertenecientes a etapas eliminadas.
       */
      const idsEliminadas =
        new Set(
          etapasAEliminar.map(
            (etapa) =>
              String(etapa.id)
          )
        );

      let columnasUsadasNuevas =
        columnasUsadasActuales.filter(
          (item) =>
            !idsEliminadas.has(
              String(
                item?.etapaId || ""
              )
            )
        );

      /*
       * Registramos la columna inicial de
       * cada nueva etapa.
       */
      etapasNuevas.forEach(
        ({ etapa, ref }) => {
          columnasUsadasNuevas.push({
            columnaId:
              etapa.columnaProduccionId,
            etapaId: ref.id,
          });
        }
      );

      const etapasFinalizadas =
        etapasConservadas.filter(
          (etapa) =>
            etapa.estado === "lista"
        ).length;

      const todasFinalizadas =
        totalNuevo > 0 &&
        etapasFinalizadas >= totalNuevo;

      transaction.update(
        grupoRef,
        {
          columnaReunionId,

          totalEtapas: totalNuevo,

          etapasFinalizadas,

          columnasUsadas:
            columnasUsadasNuevas,

          estado:
            todasFinalizadas
              ? "listo_reunion"
              : "activo",

          listoReunionAt:
            todasFinalizadas
              ? serverTimestamp()
              : null,

          updatedAt:
            serverTimestamp(),
        }
      );

      return {
        grupoId:
          grupoVinculadoId,

        totalEtapas:
          totalNuevo,

        etapasEliminadas:
          etapasAEliminar.length,

        etapasAgregadas:
          etapasNuevas.length,
      };
    }
  );
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

    const grupoVinculadoId =
      etapa.grupoVinculadoId || "";

    if (!grupoVinculadoId) {
      throw new Error(
        "La etapa no tiene una vinculación válida."
      );
    }

    const grupoRef = doc(
      db,
      GRUPOS_COLLECTION,
      grupoVinculadoId
    );

    const grupoSnap =
      await transaction.get(
        grupoRef
      );

    if (!grupoSnap.exists()) {
      throw new Error(
        "La vinculación ya no existe."
      );
    }

    const grupo =
      grupoSnap.data();

    const columnasUsadasActuales =
      Array.isArray(
        grupo.columnasUsadas
      )
        ? grupo.columnasUsadas
        : [];  
    
          /*
      * Una card vinculada no puede entrar
      * en una columna que ya utilizó OTRA
      * card del mismo grupo.
      *
      * La misma card sí puede volver a una
      * columna que ella misma utilizó.
      */
      const usadaPorOtraCard =
        columnasUsadasActuales.some(
          (item) =>
            String(
              item?.columnaId || ""
            ) ===
              String(columnaDestinoId) &&
            String(
              item?.etapaId || ""
            ) !==
              String(etapaId)
        );

      if (usadaPorOtraCard) {
        const error = new Error(
          "Esta etapa ya fue tomada por otra card vinculada. Finalizá esta etapa para continuar."
        );

        error.code =
          "produccion/columna-ocupada-vinculada";

        throw error;
      }    

    const yaRegistradaPorEstaCard =
      columnasUsadasActuales.some(
        (item) =>
          String(
            item?.columnaId || ""
          ) ===
            String(columnaDestinoId) &&
          String(
            item?.etapaId || ""
          ) ===
            String(etapaId)
      );

    const columnasUsadasNuevas =
      yaRegistradaPorEstaCard
        ? columnasUsadasActuales
        : [
            ...columnasUsadasActuales,
            {
              columnaId:
                columnaDestinoId,

              etapaId,
            },
          ];  

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
      grupoRef,
      {
        columnasUsadas:
          columnasUsadasNuevas,

        updatedAt:
          serverTimestamp(),
      }
    );

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

export async function reabrirEtapaVinculadaProduccion({
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

      if (
        String(etapa.pedidoId || "") !==
          String(pedidoId) ||
        String(
          etapa.grupoVinculadoId || ""
        ) !==
          String(grupoVinculadoId)
      ) {
        throw new Error(
          "La etapa no pertenece a este vínculo."
        );
      }

      /*
       * Si el flujo ya fue tomado y reunido
       * no podemos volver hacia atrás.
       */
      if (grupo.estado === "reunido") {
        const error = new Error(
          "Este vínculo ya fue reunido y no puede reabrirse."
        );

        error.code =
          "produccion/vinculo-ya-reunido";

        throw error;
      }

      if (etapa.estado !== "lista") {
        throw new Error(
          "Esta etapa no está finalizada."
        );
      }

      const finalizadasActuales =
        Number(
          grupo.etapasFinalizadas || 0
        );

      const nuevasFinalizadas =
        Math.max(
          0,
          finalizadasActuales - 1
        );

      /*
       * La etapa vuelve a activa exactamente
       * en la columna donde fue finalizada.
       */
      transaction.update(
        etapaRef,
        {
          estado: "activa",

          listaAt: null,
          listaPorUid: "",
          listaPorNombre: "",

          ultimaAccionUid:
            usuarioActor?.uid || "",

          ultimaAccionNombre:
            usuarioActor?.nombre || "",

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * Si todas estaban finalizadas,
       * el grupo estaba listo_reunion.
       *
       * Al reabrir una volvemos siempre
       * a estado activo.
       */
      transaction.update(
        grupoRef,
        {
          estado: "activo",

          etapasFinalizadas:
            nuevasFinalizadas,

          listoReunionAt: null,

          updatedAt:
            serverTimestamp(),
        }
      );

      return {
        etapaId,
        grupoVinculadoId,

        etapasFinalizadas:
          nuevasFinalizadas,

        estadoGrupo: "activo",
      };
    }
  );
}

export async function cancelarGrupoVinculadoProduccion({
  clienteId,
  pedidoId,
  grupoVinculadoId,
  etapasActuales = [],
  usuarioActor = null,
}) {
  if (!clienteId) {
    throw new Error(
      "Falta clienteId."
    );
  }

  if (!pedidoId) {
    throw new Error(
      "Falta pedidoId."
    );
  }

  if (!grupoVinculadoId) {
    throw new Error(
      "No se encontró la vinculación."
    );
  }

  const etapasValidas =
    Array.isArray(etapasActuales)
      ? etapasActuales.filter(
          (etapa) => etapa?.id
        )
      : [];

  if (!etapasValidas.length) {
    throw new Error(
      "No se encontraron las etapas del vínculo."
    );
  }

  const grupoRef = doc(
    db,
    GRUPOS_COLLECTION,
    grupoVinculadoId
  );

  const etapasRefs =
    etapasValidas.map(
      (etapa) => ({
        etapa,
        ref: doc(
          db,
          ETAPAS_COLLECTION,
          etapa.id
        ),
      })
    );

  return runTransaction(
    db,
    async (transaction) => {
      const grupoSnap =
        await transaction.get(
          grupoRef
        );

      if (!grupoSnap.exists()) {
        throw new Error(
          "La vinculación ya no existe."
        );
      }

      const grupo =
        grupoSnap.data();

      if (
        String(grupo.clienteId || "") !==
          String(clienteId) ||
        String(grupo.pedidoId || "") !==
          String(pedidoId)
      ) {
        throw new Error(
          "La vinculación no pertenece a este pedido."
        );
      }

      if (grupo.estado !== "activo") {
        const error = new Error(
          "Este vínculo ya tiene avances y no puede eliminarse."
        );

        error.code =
          "produccion/vinculo-con-avances";

        throw error;
      }

      if (
        Number(
          grupo.etapasFinalizadas || 0
        ) > 0
      ) {
        const error = new Error(
          "Hay etapas finalizadas. El vínculo no puede eliminarse."
        );

        error.code =
          "produccion/vinculo-con-avances";

        throw error;
      }

      const etapasFirestore = [];

      for (
        const item of etapasRefs
      ) {
        const snap =
          await transaction.get(
            item.ref
          );

        if (!snap.exists()) {
          continue;
        }

        etapasFirestore.push({
          id: snap.id,
          ref: item.ref,
          ...snap.data(),
        });
      }

      const columnasUsadas =
        Array.isArray(
          grupo.columnasUsadas
        )
          ? grupo.columnasUsadas
          : [];

      /*
       * Todas las etapas deben seguir exactamente
       * como fueron creadas.
       */
      etapasFirestore.forEach(
        (etapa) => {
          const usosEtapa =
            columnasUsadas.filter(
              (item) =>
                String(
                  item?.etapaId || ""
                ) === String(etapa.id)
            );

          const soloColumnaInicial =
            usosEtapa.length === 1 &&
            String(
              usosEtapa[0]?.columnaId ||
                ""
            ) ===
              String(
                etapa.columnaProduccionId ||
                  ""
              );

          const sinSectores =
            !Array.isArray(
              etapa.sectoresProcesados
            ) ||
            etapa.sectoresProcesados
              .length === 0;

          const sigueActiva =
            etapa.estado === "activa";

          const nuncaFinalizada =
            !etapa.listaAt &&
            !etapa.listaPorUid &&
            !etapa.listaPorNombre;

          const sinAcciones =
            !etapa.ultimaAccionUid &&
            !etapa.ultimaAccionNombre;

          if (
            !soloColumnaInicial ||
            !sinSectores ||
            !sigueActiva ||
            !nuncaFinalizada ||
            !sinAcciones
          ) {
            const error = new Error(
              `La etapa "${
                etapa.nombre ||
                "Etapa vinculada"
              }" ya tiene avances. El vínculo no puede eliminarse.`
            );

            error.code =
              "produccion/vinculo-con-avances";

            throw error;
          }
        }
      );

      /*
       * No borramos físicamente.
       *
       * Las etapas quedan canceladas y
       * los listeners dejan de mostrarlas.
       */
      etapasFirestore.forEach(
        (etapa) => {
          transaction.update(
            etapa.ref,
            {
              estado: "cancelada",

              ultimaAccionUid:
                usuarioActor?.uid || "",

              ultimaAccionNombre:
                usuarioActor?.nombre ||
                "",

              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      /*
       * Al cancelar el grupo, el listener deja
       * de considerarlo activo.
       *
       * La representación principal del pedido
       * vuelve automáticamente al tablero.
       */
      transaction.update(
        grupoRef,
        {
          estado: "cancelado",

          canceladoAt:
            serverTimestamp(),

          canceladoPorUid:
            usuarioActor?.uid || "",

          canceladoPorNombre:
            usuarioActor?.nombre || "",

          updatedAt:
            serverTimestamp(),
        }
      );

      return {
        grupoId:
          grupoVinculadoId,

        cancelado: true,
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