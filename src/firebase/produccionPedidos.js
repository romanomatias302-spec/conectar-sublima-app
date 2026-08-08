import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot,
  addDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  calcularEstadoProduccion,
  calcularProduccionFinalizada,
  calcularProgresoPorColumna,
} from "../modulos/produccion/produccionUtils";
import { obtenerColumnasProduccion } from "./produccionColumnas";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { storage } from "../firebase";

const PEDIDOS_COLLECTION = "pedidos";

export function escucharPedidosProduccionActivos(clienteId, callback) {
  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pedidos = snapshot.docs
        .map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
        .filter(
          (pedido) =>
            pedido.produccionFinalizada !== true && pedido.estado !== "Cancelado"
        )
        .sort((a, b) => {
          /*
          * El orden natural del tablero debe depender
          * de la actividad de PRODUCCIÓN, no de cualquier
          * edición interna del pedido.
          *
          * Prioridad:
          *
          * 1. Último movimiento real de producción.
          * 2. Timestamp histórico de producción.
          * 3. Fecha de creación del pedido.
          *
          * NO usamos updatedAt porque cambia al editar
          * portada, notas, archivos, etiquetas, etc.
          */
          const obtenerTiempoOrdenProduccion = (pedido) => {
            if (
              pedido?.ultimaAccionProduccionAt?.seconds
            ) {
              return pedido
                .ultimaAccionProduccionAt
                .seconds;
            }

            if (
              pedido?.produccionActualizadoAt?.seconds
            ) {
              return pedido
                .produccionActualizadoAt
                .seconds;
            }

            if (pedido?.createdAt?.seconds) {
              return pedido.createdAt.seconds;
            }

            return 0;
          };

          const aTime =
            obtenerTiempoOrdenProduccion(a);

          const bTime =
            obtenerTiempoOrdenProduccion(b);

          if (aTime !== bTime) {
            return bTime - aTime;
          }

          /*
          * Desempate estable.
          * Evita movimientos visuales aleatorios
          * cuando dos documentos tienen el mismo tiempo.
          */
          return String(
            a.firebaseId || a.id || ""
          ).localeCompare(
            String(
              b.firebaseId || b.id || ""
            )
          );
        })
        .slice(0, 100);

      callback(pedidos);
    },
    (error) => {
      console.error("Error escuchando pedidos de producción:", error);
    }
  );
}

export async function obtenerPedidosProduccionActivos(clienteId) {
  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snapshot = await getDocs(q);

  const pedidos = snapshot.docs
    .map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
    .filter((pedido) => pedido.produccionFinalizada !== true && pedido.estado !== "Cancelado")
    .sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    })
    .slice(0, 100);

  return {
    pedidos,
    lastVisible: null,
  };
}

function calcularEstadoGeneralPedido(columnaDestino, estadoActualPedido) {
  if (estadoActualPedido === "Cancelado") return "Cancelado";
  if (columnaDestino?.esFinal) return "Terminado";
  if (columnaDestino?.esInicial) return "Pendiente";
  return "En proceso";
}

async function registrarMovimientoProduccion({
  pedidoId,
  pedidoActual,
  columnaOrigen,
  columnaDestino,
  usuarioActor,
}) {
  if (!pedidoId || !columnaDestino) return;

  const historialRef = collection(db, `${PEDIDOS_COLLECTION}/${pedidoId}/historial_produccion`);

  let duracionEnOrigenMinutos = 0;

  const ultimaFechaMovimiento =
    pedidoActual?.produccionActualizadoAt?.toDate
      ? pedidoActual.produccionActualizadoAt.toDate()
      : pedidoActual?.produccionActualizadoAt
      ? new Date(pedidoActual.produccionActualizadoAt)
      : null;

  if (ultimaFechaMovimiento) {
    duracionEnOrigenMinutos = Math.round(
      (Date.now() - ultimaFechaMovimiento.getTime()) / 60000
    );
  }

  await addDoc(historialRef, {
    clienteId: pedidoActual?.clienteId || "",

    pedidoId,
    pedidoVisibleId:
      pedidoActual?.id ||
      pedidoActual?.numeroPedido ||
      pedidoActual?.numero ||
      "",

    clienteNombre:
      pedidoActual?.clienteNombre ||
      pedidoActual?.cliente ||
      "",

    columnaOrigenId: columnaOrigen?.id || "",
    columnaOrigenNombre: columnaOrigen?.nombre || "",

    columnaDestinoId: columnaDestino?.id || "",
    columnaDestinoNombre: columnaDestino?.nombre || "",

    usuarioActorUid: usuarioActor?.uid || "",
    usuarioActorNombre: usuarioActor?.nombre || "",

    usuarioAsignadoUid: pedidoActual?.produccionAsignadoUid || "",
    usuarioAsignadoNombre:
      pedidoActual?.produccionAsignadoNombre ||
      pedidoActual?.produccionAsignadoEmail ||
      "",

    duracionEnOrigenMinutos,
    pedidoFinalizado: columnaDestino?.esFinal === true,

    createdAt: serverTimestamp(),
  });
}

export async function moverPedidoProduccion({
  pedidoId,
  pedidoActual,
  columnaDestino,
  columnasOrdenadas,
  usuarioActor,
}) {
  const progresoProduccion = calcularProgresoPorColumna(columnasOrdenadas, columnaDestino.id);
  const estadoProduccion = calcularEstadoProduccion(columnaDestino);
  const produccionFinalizada = calcularProduccionFinalizada(columnaDestino);
  const estadoGeneral = calcularEstadoGeneralPedido(columnaDestino, pedidoActual?.estado);

  const ref = doc(db, PEDIDOS_COLLECTION, pedidoId);

    const columnaOrigen =
    columnasOrdenadas.find((c) => c.id === pedidoActual?.columnaProduccionId) || null;

  await updateDoc(ref, {
    columnaProduccionId: columnaDestino.id,
    progresoProduccion,
    estadoProduccion,
    produccionFinalizada,
    estado: estadoGeneral,
    produccionActualizadoAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ultimaAccionProduccionPor: usuarioActor?.uid || null,
    ultimaAccionProduccionPorNombre: usuarioActor?.nombre || null,
    ultimaAccionProduccionAt: serverTimestamp(),
  });

  await registrarMovimientoProduccion({
    pedidoId,
    pedidoActual,
    columnaOrigen,
    columnaDestino,
    usuarioActor,
  });
}

export async function sincronizarPedidoDesdeEstadoManual({
  pedidoActual,
  nuevoEstado,
  clienteId,
  columnaDestinoManualId = null,
}) {
  if (!pedidoActual?.firebaseId) return;

  const columnasOrdenadas = await obtenerColumnasProduccion(clienteId);
  if (!columnasOrdenadas?.length) return;

  const columnaInicial = columnasOrdenadas.find((c) => c.esInicial);
  const columnaFinal = columnasOrdenadas.find((c) => c.esFinal);
  const columnasIntermedias = columnasOrdenadas.filter(
    (c) => !c.esInicial && !c.esFinal
  );

  let columnaDestino = null;
  let estadoProduccion = pedidoActual.estadoProduccion || "pendiente";
  let produccionFinalizada = pedidoActual.produccionFinalizada || false;
  let progresoProduccion = pedidoActual.progresoProduccion || 0;

  if (nuevoEstado === "Pendiente" && columnaInicial) {
    columnaDestino = columnaInicial;
    estadoProduccion = "pendiente";
    produccionFinalizada = false;
    progresoProduccion = calcularProgresoPorColumna(columnasOrdenadas, columnaDestino.id);
  }

  if (nuevoEstado === "Terminado" && columnaFinal) {
    columnaDestino = columnaFinal;
    estadoProduccion = "finalizado";
    produccionFinalizada = true;
    progresoProduccion = calcularProgresoPorColumna(columnasOrdenadas, columnaDestino.id);
  }

 if (nuevoEstado === "En proceso") {
    if (columnaDestinoManualId) {
      columnaDestino =
        columnasOrdenadas.find((c) => c.id === columnaDestinoManualId) || null;
    }

    if (!columnaDestino) {
      if (columnasIntermedias.length > 0) {
        columnaDestino = columnasIntermedias[columnasIntermedias.length - 1];
      } else if (columnaInicial) {
        columnaDestino = columnaInicial;
      }
    }

    if (columnaDestino) {
      estadoProduccion = columnaDestino.esInicial ? "pendiente" : "en_proceso";
      produccionFinalizada = false;
      progresoProduccion = calcularProgresoPorColumna(columnasOrdenadas, columnaDestino.id);
    }
  }

  const ref = doc(db, PEDIDOS_COLLECTION, pedidoActual.firebaseId);

  const payload = {
    estado: nuevoEstado,
    updatedAt: serverTimestamp(),
  };

  if (nuevoEstado === "Cancelado") {
    payload.estado = "Cancelado";
  } else if (columnaDestino) {
    payload.columnaProduccionId = columnaDestino.id;
    payload.progresoProduccion = progresoProduccion;
    payload.estadoProduccion = estadoProduccion;
    payload.produccionFinalizada = produccionFinalizada;
    payload.produccionActualizadoAt = serverTimestamp();
  }

  await updateDoc(ref, payload);
}

export async function recalcularPedidosPorCambioDeColumnas(
  clienteId
) {
  if (!clienteId) {
    throw new Error("Falta clienteId.");
  }

  const columnasOrdenadas =
    await obtenerColumnasProduccion(clienteId);

  if (!columnasOrdenadas.length) {
    return {
      revisados: 0,
      actualizados: 0,
    };
  }

  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snapshot = await getDocs(q);

  const actualizaciones = [];

  snapshot.docs.forEach((documento) => {
    const pedido = {
      firebaseId: documento.id,
      ...documento.data(),
    };

    if (!pedido.columnaProduccionId) return;
    if (pedido.estado === "Cancelado") return;

    const columnaActual = columnasOrdenadas.find(
      (columna) =>
        columna.id === pedido.columnaProduccionId
    );

    if (!columnaActual) return;

    const progresoProduccion =
      calcularProgresoPorColumna(
        columnasOrdenadas,
        columnaActual.id
      );

    const estadoProduccion =
      calcularEstadoProduccion(columnaActual);

    const produccionFinalizada =
      calcularProduccionFinalizada(columnaActual);

    const estado = columnaActual.esFinal
      ? "Terminado"
      : columnaActual.esInicial
      ? "Pendiente"
      : "En proceso";

    const necesitaActualizar =
      Number(pedido.progresoProduccion ?? -1) !==
        Number(progresoProduccion) ||
      String(pedido.estadoProduccion || "") !==
        String(estadoProduccion) ||
      Boolean(pedido.produccionFinalizada) !==
        Boolean(produccionFinalizada) ||
      String(pedido.estado || "") !== String(estado);

    if (!necesitaActualizar) return;

    actualizaciones.push({
      ref: doc(
        db,
        PEDIDOS_COLLECTION,
        documento.id
      ),
      data: {
        progresoProduccion,
        estadoProduccion,
        produccionFinalizada,
        estado,
        produccionActualizadoAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });
  });

  /*
   * Firestore admite hasta 500 operaciones por batch.
   * Utilizamos 400 para dejar margen de seguridad.
   */
  const TAMANO_BATCH = 400;

  for (
    let inicio = 0;
    inicio < actualizaciones.length;
    inicio += TAMANO_BATCH
  ) {
    const lote = actualizaciones.slice(
      inicio,
      inicio + TAMANO_BATCH
    );

    const batch = writeBatch(db);

    lote.forEach(({ ref, data }) => {
      batch.update(ref, data);
    });

    await batch.commit();
  }

  return {
    revisados: snapshot.size,
    actualizados: actualizaciones.length,
  };
}

export async function moverPedidosDeColumnaEliminadaAAnterior({
  clienteId,
  columnaEliminadaId,
}) {
  const columnasOrdenadas = await obtenerColumnasProduccion(clienteId);
  const columnaEliminada = columnasOrdenadas.find((c) => c.id === columnaEliminadaId);

  if (!columnaEliminada) return;

  const indice = columnasOrdenadas.findIndex((c) => c.id === columnaEliminadaId);
  const columnaDestino =
    columnasOrdenadas[indice - 1] ||
    columnasOrdenadas.find((c) => c.esInicial) ||
    null;

  if (!columnaDestino) return;

  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where("clienteId", "==", clienteId),
    where("columnaProduccionId", "==", columnaEliminadaId)
  );

  const snapshot = await getDocs(q);

  for (const d of snapshot.docs) {
    const pedido = { firebaseId: d.id, ...d.data() };

    if (pedido.estado === "Cancelado") continue;

    const progresoProduccion = calcularProgresoPorColumna(
      columnasOrdenadas,
      columnaDestino.id
    );

    const estadoProduccion = calcularEstadoProduccion(columnaDestino);
    const produccionFinalizada = calcularProduccionFinalizada(columnaDestino);

    const estado =
      columnaDestino.esFinal
        ? "Terminado"
        : columnaDestino.esInicial
        ? "Pendiente"
        : "En proceso";

    await updateDoc(doc(db, PEDIDOS_COLLECTION, d.id), {
      columnaProduccionId: columnaDestino.id,
      progresoProduccion,
      estadoProduccion,
      produccionFinalizada,
      estado,
      produccionActualizadoAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export function escucharPedidosProduccionFinalizadosRecientes(clienteId, callback) {
  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const pedidos = snapshot.docs
        .map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
        .filter(
          (pedido) =>
            pedido.produccionFinalizada === true && pedido.estado !== "Cancelado"
        )
        .sort((a, b) => {
          const aTime = a.updatedAt?.seconds || 0;
          const bTime = b.updatedAt?.seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 10);

      callback(pedidos);
    },
    (error) => {
      console.error("Error escuchando pedidos finalizados recientes:", error);
    }
  );
}

export async function actualizarDetalleManualProduccion({
  pedidoId,
  produccionNotaCorta = "",
  produccionNotaLarga = "",
  produccionImagenPortada = "",
  produccionImagenPortadaThumb = "",
  produccionArchivos = [],
  produccionEtiquetas = [],
  produccionEtiquetaId = "",
  produccionEtiquetaNombre = "",
  produccionEtiquetaColor = "",
}) {
  const ref = doc(db, PEDIDOS_COLLECTION, pedidoId);

  const etiquetasNormalizadas = Array.isArray(produccionEtiquetas)
    ? produccionEtiquetas
        .filter((e) => e?.id)
        .slice(0, 4)
        .map((e) => ({
          id: e.id,
          nombre: e.nombre || "",
          color: e.color || "",
        }))
    : [];

  await updateDoc(ref, {
    produccionNotaCorta: produccionNotaCorta || "",
    produccionNotaLarga: produccionNotaLarga || "",
    produccionImagenPortada: produccionImagenPortada || "",
    produccionImagenPortadaOrigen: produccionImagenPortada ? "pedido" : "",
    produccionImagenPortadaThumb:
    produccionImagenPortadaThumb || "",
    produccionArchivos: produccionArchivos || [],

    produccionEtiquetas: etiquetasNormalizadas,

    produccionEtiquetaId:
      produccionEtiquetaId || etiquetasNormalizadas[0]?.id || "",

    produccionEtiquetaNombre:
      produccionEtiquetaNombre || etiquetasNormalizadas[0]?.nombre || "",

    produccionEtiquetaColor:
      produccionEtiquetaColor || etiquetasNormalizadas[0]?.color || "",

    updatedAt: serverTimestamp(),
  });
}

export async function subirArchivoProduccion({ pedidoId, archivo }) {
  if (!pedidoId) throw new Error("Pedido inválido.");
  if (!archivo) throw new Error("Archivo inválido.");

  const extension = archivo.name.split(".").pop()?.toLowerCase();

  const extensionesPermitidas = ["pdf", "xls", "xlsx", "doc", "docx", "zip"];
  const MAX_MB = 10;

if (
  archivo.size >
  MAX_MB * 1024 * 1024
) {
  throw new Error(
    `Máximo ${MAX_MB}MB por archivo.`
  );
}

  if (!extensionesPermitidas.includes(extension)) {
    throw new Error("Formato no permitido. Solo PDF, Excel, Word o ZIP.");
  }

  const id = `${Date.now()}-${archivo.name}`;

  const storageRef = ref(storage, `produccion/${pedidoId}/archivos/${id}`);

  await uploadBytes(storageRef, archivo);

  const url = await getDownloadURL(storageRef);

  return {
    id,
    nombre: archivo.name,
    url,
    tipo: archivo.type || extension,
    extension,
    peso: archivo.size || 0,
  };
}

async function crearMiniaturaImagen(archivo, maxWidth = 420, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);

    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("No se pudo generar miniatura."));
            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        calidad
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };

    img.src = url;
  });
}

export async function subirImagenPortadaProduccion({
  pedidoId,
  archivo,
}) {
  if (!pedidoId) throw new Error("Pedido inválido.");
  if (!archivo) throw new Error("Imagen inválida.");

  const tipos = ["image/png", "image/jpeg", "image/webp"];

  if (!tipos.includes(archivo.type)) {
    throw new Error("Solo JPG, PNG o WEBP.");
  }

 const MAX_PORTADA_MB = 3;

if (archivo.size > MAX_PORTADA_MB * 1024 * 1024) {
  throw new Error(
    `Máximo ${MAX_PORTADA_MB}MB para portada.`
  );
}

  const id = `portada-${Date.now()}`;

  const storageRef = ref(storage, `produccion/${pedidoId}/portada/${id}`);
  await uploadBytes(storageRef, archivo);
  const url = await getDownloadURL(storageRef);

  let thumbUrl = "";

  try {
    const miniaturaBlob = await crearMiniaturaImagen(archivo);

    const thumbRef = ref(
      storage,
      `produccion/${pedidoId}/portada/thumb-${id}.jpg`
    );

    await uploadBytes(thumbRef, miniaturaBlob, {
      contentType: "image/jpeg",
    });

    thumbUrl = await getDownloadURL(thumbRef);
  } catch (error) {
    console.error("No se pudo generar miniatura:", error);
  }

  return {
    url,
    thumbUrl,
    origen: "produccion",
  };
}

export async function asignarUsuarioProduccion({
  pedidoId,
  usuarioAsignado,
  usuarioActor,
}) {
  if (!pedidoId) return;

  const ref = doc(db, PEDIDOS_COLLECTION, pedidoId);

  await updateDoc(ref, {
    produccionAsignadoUid: usuarioAsignado?.uid || "",
    produccionAsignadoNombre: usuarioAsignado?.nombre || "",
    produccionAsignadoEmail: usuarioAsignado?.email || "",
    produccionAsignadoAt: serverTimestamp(),
    produccionAsignadoPorUid: usuarioActor?.uid || "",
    produccionAsignadoPorNombre: usuarioActor?.nombre || "",
    updatedAt: serverTimestamp(),
  });
}

export async function obtenerHistorialProduccionPedido(pedidoId) {
  if (!pedidoId) return [];

  const historialRef = collection(db, `${PEDIDOS_COLLECTION}/${pedidoId}/historial_produccion`);
  const q = query(historialRef);

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
    .sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
}


