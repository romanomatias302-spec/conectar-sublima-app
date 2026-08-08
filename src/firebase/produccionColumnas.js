import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot,
  writeBatch,
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

function ordenarColumnasPorFlujo(columnas = []) {
  return [...columnas].sort((a, b) => {
    /*
     * Reglas estructurales del flujo:
     *
     * 1. La columna inicial siempre va primera.
     * 2. La columna final siempre va última.
     * 3. Sólo las columnas intermedias se ordenan
     *    mediante el campo "orden".
     */

    if (a?.esInicial === true) {
      return b?.esInicial === true
        ? 0
        : -1;
    }

    if (b?.esInicial === true) {
      return 1;
    }

    if (a?.esFinal === true) {
      return b?.esFinal === true
        ? 0
        : 1;
    }

    if (b?.esFinal === true) {
      return -1;
    }

    const ordenA = Number(
      a?.orden ?? 0
    );

    const ordenB = Number(
      b?.orden ?? 0
    );

    if (ordenA !== ordenB) {
      return ordenA - ordenB;
    }

    /*
     * Desempate estable.
     */
    return String(
      a?.id || ""
    ).localeCompare(
      String(b?.id || "")
    );
  });
}

function calcularOrdenEntreColumnas(
  columnaAnterior,
  columnaSiguiente
) {
  const ordenAnterior = Number(
    columnaAnterior?.orden ?? 0
  );

  const ordenSiguiente = Number(
    columnaSiguiente?.orden ??
      ordenAnterior + 1000
  );

  if (ordenSiguiente > ordenAnterior) {
    return (
      ordenAnterior +
      (ordenSiguiente - ordenAnterior) / 2
    );
  }

  return ordenAnterior + 0.5;
}

export async function obtenerColumnasProduccion(clienteId) {
  const q = query(
    collection(db, PRODUCCION_COLUMNAS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snapshot = await getDocs(q);

const columnas = snapshot.docs
  .map((d) => ({
    id: d.id,
    ...d.data(),
  }))
  .filter(
    (columna) =>
      columna.activo !== false
  );

return ordenarColumnasPorFlujo(
  columnas
);
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
  if (!clienteId) return [];

  const ref = collection(db, PRODUCCION_COLUMNAS_COLLECTION);

  const q = query(
    ref,
    where("clienteId", "==", clienteId)
  );

  const snapshot = await getDocs(q);

  const columnas = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const columnasActivas = columnas.filter((col) => col.activo !== false);

  const inicialActiva = columnasActivas.find((col) => col.esInicial);
  const finalActiva = columnasActivas.find((col) => col.esFinal);

  if (!inicialActiva) {
    await addDoc(ref, {
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

  if (!finalActiva) {
    await addDoc(ref, {
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

export async function crearColumnaIntermediaProduccion({
  clienteId,
  nombre,
  sectorId = "",
  posicionEnSector = "fin",
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  const nombreLimpio = String(nombre || "").trim();

  if (!nombreLimpio) {
    throw new Error("Ingresá un nombre para la columna.");
  }

  const columnas = await obtenerColumnasProduccion(clienteId);

  const columnasOrdenadas =
    ordenarColumnasPorFlujo(columnas);

  const columnaInicial =
    columnasOrdenadas.find((columna) => columna.esInicial) ||
    null;

  const columnaFinal =
    columnasOrdenadas.find((columna) => columna.esFinal) ||
    null;

  const columnasIntermedias = columnasOrdenadas.filter(
    (columna) =>
      !columna.esInicial && !columna.esFinal
  );

  let columnaAnterior = null;
  let columnaSiguiente = null;

  if (sectorId) {
    const columnasSector = columnasIntermedias
      .filter((columna) => columna.sectorId === sectorId)
      .sort(
        (a, b) =>
          Number(a.orden || 0) - Number(b.orden || 0)
      );

    if (columnasSector.length > 0) {
      if (posicionEnSector === "inicio") {
        const primeraColumnaSector = columnasSector[0];

        const indicePrimera = columnasOrdenadas.findIndex(
          (columna) =>
            columna.id === primeraColumnaSector.id
        );

        columnaAnterior =
          columnasOrdenadas[indicePrimera - 1] ||
          columnaInicial;

        columnaSiguiente = primeraColumnaSector;
      } else {
        const ultimaColumnaSector =
          columnasSector[columnasSector.length - 1];

        const indiceUltima = columnasOrdenadas.findIndex(
          (columna) =>
            columna.id === ultimaColumnaSector.id
        );

        columnaAnterior = ultimaColumnaSector;

        columnaSiguiente =
          columnasOrdenadas[indiceUltima + 1] ||
          columnaFinal;
      }
    }
  }

  /*
   * Sector nuevo, sector vacío o columna sin sector:
   * se agrega al final de las etapas intermedias,
   * antes de la columna final.
   */
  if (!columnaAnterior || !columnaSiguiente) {
    columnaAnterior =
      columnasIntermedias[
        columnasIntermedias.length - 1
      ] ||
      columnaInicial;

    columnaSiguiente = columnaFinal;
  }

  const nuevoOrden = calcularOrdenEntreColumnas(
    columnaAnterior,
    columnaSiguiente
  );

  const color = obtenerColorSiguiente(columnas);

  const ref = await addDoc(
    collection(db, PRODUCCION_COLUMNAS_COLLECTION),
    {
      clienteId,
      nombre: nombreLimpio,
      orden: nuevoOrden,

      sectorId: sectorId || "",

      esInicial: false,
      esFinal: false,
      activo: true,

      colorFondo: color.colorFondo,
      colorBorde: color.colorBorde,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  return ref.id;
}

export async function moverColumnaASectorProduccion({
  clienteId,
  columnaId,
  sectorId = "",
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  if (!columnaId) {
    throw new Error("Falta columnaId.");
  }

  const columnas = await obtenerColumnasProduccion(clienteId);

  const columnaActual = columnas.find(
    (columna) => columna.id === columnaId
  );

  if (!columnaActual) {
    throw new Error(
      "No se encontró la columna seleccionada."
    );
  }

  if (
    columnaActual.esInicial === true ||
    columnaActual.esFinal === true
  ) {
    throw new Error(
      "Las columnas inicial y final no pueden asignarse a un sector."
    );
  }

  /*
   * IMPORTANTE:
   * Asociar una columna a un sector no debe modificar
   * su posición dentro del flujo productivo.
   *
   * El orden original de Producción se conserva.
   */
  await updateDoc(
    doc(
      db,
      PRODUCCION_COLUMNAS_COLLECTION,
      columnaId
    ),
    {
      sectorId: sectorId || "",
      updatedAt: serverTimestamp(),
    }
  );

  return {
    columnaId,
    sectorId: sectorId || "",
    ordenConservado: columnaActual.orden,
  };
}

export function validarContinuidadSectoresProduccion(
  columnas = []
) {
  const columnasOrdenadas = ordenarColumnasPorFlujo(
    columnas
  ).filter(
    (columna) =>
      columna.activo !== false &&
      !columna.esInicial &&
      !columna.esFinal
  );

  const posicionesPorSector = new Map();

  columnasOrdenadas.forEach((columna, index) => {
    const sectorId = String(
      columna.sectorId || ""
    ).trim();

    if (!sectorId) return;

    if (!posicionesPorSector.has(sectorId)) {
      posicionesPorSector.set(sectorId, []);
    }

    posicionesPorSector.get(sectorId).push(index);
  });

  const sectoresFragmentados = [];

  posicionesPorSector.forEach(
    (posiciones, sectorId) => {
      if (posiciones.length <= 1) return;

      const primera = Math.min(...posiciones);
      const ultima = Math.max(...posiciones);

      const cantidadEsperada =
        ultima - primera + 1;

      if (cantidadEsperada !== posiciones.length) {
        sectoresFragmentados.push({
          sectorId,
          posiciones,
        });
      }
    }
  );

  return {
    valido: sectoresFragmentados.length === 0,
    sectoresFragmentados,
  };
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
        .filter(
          (columna) =>
            columna.activo !== false
        );

      callback(
        ordenarColumnasPorFlujo(
          columnas
        )
      );
    },
    (error) => {
      console.error("Error escuchando columnas de producción:", error);
    }
  );
}

export async function moverColumnaProduccion({
  clienteId,
  columnaId,
  direccion,
}) {
  const columnas = await obtenerColumnasProduccion(clienteId);

  const intermedias = columnas.filter((c) => !c.esInicial && !c.esFinal);
  const index = intermedias.findIndex((c) => c.id === columnaId);

  if (index === -1) return;
  if (direccion === "izquierda" && index === 0) return;
  if (direccion === "derecha" && index === intermedias.length - 1) return;

  const columnaActual = intermedias[index];
  const columnaVecina =
    direccion === "izquierda"
      ? intermedias[index - 1]
      : intermedias[index + 1];

  if (!columnaActual || !columnaVecina) return;

  await updateDoc(doc(db, PRODUCCION_COLUMNAS_COLLECTION, columnaActual.id), {
    orden: columnaVecina.orden,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, PRODUCCION_COLUMNAS_COLLECTION, columnaVecina.id), {
    orden: columnaActual.orden,
    updatedAt: serverTimestamp(),
  });
}

export async function limpiarColumnasBaseDuplicadasProduccion(clienteId) {
  if (!clienteId) return;

  const columnas = await obtenerColumnasProduccion(clienteId);

  const iniciales = columnas.filter((c) => c.esInicial);
  const finales = columnas.filter((c) => c.esFinal);

  const duplicadasIniciales = iniciales.slice(1);
  const duplicadasFinales = finales.slice(1);

  for (const col of [...duplicadasIniciales, ...duplicadasFinales]) {
    await updateDoc(doc(db, PRODUCCION_COLUMNAS_COLLECTION, col.id), {
      activo: false,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function reordenarColumnaDesdeMapaProduccion({
  clienteId,
  columnaId,
  sectorDestinoId = "",
  columnaObjetivoId = "",
  posicion = "antes",
}) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  if (!columnaId) {
    throw new Error("Falta columnaId.");
  }

  const columnas =
    await obtenerColumnasProduccion(clienteId);

  const columnasOrdenadas =
    ordenarColumnasPorFlujo(columnas);

  const columnaMovida = columnasOrdenadas.find(
    (columna) => columna.id === columnaId
  );

  if (!columnaMovida) {
    throw new Error(
      "No se encontró la columna que querés mover."
    );
  }

  if (
    columnaMovida.esInicial === true ||
    columnaMovida.esFinal === true
  ) {
    throw new Error(
      "Las columnas inicial y final no pueden reordenarse desde el mapa."
    );
  }

  const columnaObjetivo = columnaObjetivoId
    ? columnasOrdenadas.find(
        (columna) =>
          columna.id === columnaObjetivoId
      )
    : null;

  if (
    columnaObjetivo &&
    (columnaObjetivo.esInicial === true ||
      columnaObjetivo.esFinal === true)
  ) {
    throw new Error(
      "No podés insertar una columna dentro de las etapas inicial o final."
    );
  }

  if (
    columnaObjetivo &&
    columnaObjetivo.id === columnaMovida.id
  ) {
    return {
      sinCambios: true,
    };
  }

  const columnaInicial =
    columnasOrdenadas.find(
      (columna) => columna.esInicial
    ) || null;

  const columnaFinal =
    columnasOrdenadas.find(
      (columna) => columna.esFinal
    ) || null;

  /*
   * Trabajamos sólo con etapas intermedias.
   * Pendiente y Producción finalizada conservan sus extremos.
   */
  const intermediasSinMovida =
    columnasOrdenadas.filter(
      (columna) =>
        !columna.esInicial &&
        !columna.esFinal &&
        columna.id !== columnaMovida.id
    );

  const columnaMovidaActualizada = {
    ...columnaMovida,
    sectorId: sectorDestinoId || "",
  };

  let indiceInsercion = -1;

  /*
   * Si se soltó sobre una columna concreta,
   * la insertamos antes o después de ella.
   */
  if (columnaObjetivo) {
    const indiceObjetivo =
      intermediasSinMovida.findIndex(
        (columna) =>
          columna.id === columnaObjetivo.id
      );

    if (indiceObjetivo !== -1) {
      indiceInsercion =
        posicion === "despues"
          ? indiceObjetivo + 1
          : indiceObjetivo;
    }
  }

  /*
   * Si se soltó sobre el sector, pero no sobre
   * una columna concreta, va al final del sector.
   */
  if (indiceInsercion === -1) {
    const indicesSectorDestino =
      intermediasSinMovida
        .map((columna, index) => ({
          columna,
          index,
        }))
        .filter(
          ({ columna }) =>
            String(columna.sectorId || "") ===
            String(sectorDestinoId || "")
        )
        .map(({ index }) => index);

    if (indicesSectorDestino.length > 0) {
      indiceInsercion =
        Math.max(...indicesSectorDestino) + 1;
    } else {
      /*
       * Sector vacío o zona sin sector sin columnas:
       * se ubica al final de las etapas intermedias.
       */
      indiceInsercion =
        intermediasSinMovida.length;
    }
  }

  const intermediasReordenadas = [
    ...intermediasSinMovida,
  ];

  intermediasReordenadas.splice(
    indiceInsercion,
    0,
    columnaMovidaActualizada
  );

  const flujoCompleto = [
    ...(columnaInicial ? [columnaInicial] : []),
    ...intermediasReordenadas,
    ...(columnaFinal ? [columnaFinal] : []),
  ];

  /*
   * Una empresa con 100 columnas entra ampliamente
   * dentro del límite de un batch de Firestore.
   *
   * Dejamos margen por seguridad.
   */
  if (flujoCompleto.length > 450) {
    throw new Error(
      "El flujo tiene demasiadas columnas para reordenarlo en una sola operación."
    );
  }

  const batch = writeBatch(db);

  flujoCompleto.forEach((columna, index) => {
    let nuevoOrden;

    if (columna.esInicial === true) {
      nuevoOrden = 0;
    } else {
      nuevoOrden = index * 1000;
    }

    const datosActualizacion = {
      orden: nuevoOrden,
      updatedAt: serverTimestamp(),
    };

    if (columna.id === columnaMovida.id) {
      datosActualizacion.sectorId =
        sectorDestinoId || "";
    }

    batch.update(
      doc(
        db,
        PRODUCCION_COLUMNAS_COLLECTION,
        columna.id
      ),
      datosActualizacion
    );
  });

  await batch.commit();

  return {
    columnaId,
    sectorDestinoId: sectorDestinoId || "",
    columnaObjetivoId: columnaObjetivoId || "",
    posicion,
    columnasActualizadas: flujoCompleto.length,
  };
}