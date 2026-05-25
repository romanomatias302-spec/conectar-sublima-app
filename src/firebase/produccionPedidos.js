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
          const aTime = a.updatedAt?.seconds || 0;
          const bTime = b.updatedAt?.seconds || 0;
          return bTime - aTime;
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

export async function recalcularPedidosPorCambioDeColumnas(clienteId) {
  const columnasOrdenadas = await obtenerColumnasProduccion(clienteId);

  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where("clienteId", "==", clienteId)
  );

  const snapshot = await getDocs(q);

  for (const d of snapshot.docs) {
    const pedido = { firebaseId: d.id, ...d.data() };

    if (!pedido.columnaProduccionId) continue;
    if (pedido.estado === "Cancelado") continue;

    const columnaActual = columnasOrdenadas.find(
      (c) => c.id === pedido.columnaProduccionId
    );

    if (!columnaActual) continue;

    const progresoProduccion = calcularProgresoPorColumna(
      columnasOrdenadas,
      columnaActual.id
    );

    const estadoProduccion = calcularEstadoProduccion(columnaActual);
    const produccionFinalizada = calcularProduccionFinalizada(columnaActual);

    const estado =
      columnaActual.esFinal
        ? "Terminado"
        : columnaActual.esInicial
        ? "Pendiente"
        : "En proceso";

    await updateDoc(doc(db, PEDIDOS_COLLECTION, d.id), {
      progresoProduccion,
      estadoProduccion,
      produccionFinalizada,
      estado,
      produccionActualizadoAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
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

export async function subirImagenPortadaProduccion({
  pedidoId,
  archivo,
}) {
  if (!pedidoId) throw new Error("Pedido inválido.");
  if (!archivo) throw new Error("Imagen inválida.");

  const tipos = [
    "image/png",
    "image/jpeg",
    "image/webp",
  ];

  if (!tipos.includes(archivo.type)) {
    throw new Error(
      "Solo JPG, PNG o WEBP."
    );
  }

  if (archivo.size > 5 * 1024 * 1024) {
    throw new Error(
      "Máximo 5MB para portada."
    );
  }

  const id = `portada-${Date.now()}`;

  const storageRef = ref(
    storage,
    `produccion/${pedidoId}/portada/${id}`
  );

  await uploadBytes(storageRef, archivo);

  const url =
    await getDownloadURL(storageRef);

  return {
    url,
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