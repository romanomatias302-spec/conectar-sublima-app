import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  calcularEstadoProduccion,
  calcularProduccionFinalizada,
  calcularProgresoPorColumna,
} from "../modulos/produccion/produccionUtils";
import { obtenerColumnasProduccion } from "./produccionColumnas";

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
  produccionColorMarca = "",
  produccionMetros = "",
}) {
  const ref = doc(db, PEDIDOS_COLLECTION, pedidoId);

  await updateDoc(ref, {
    produccionNotaCorta: produccionNotaCorta || "",
    produccionColorMarca: produccionColorMarca || "",
    produccionMetros:
      produccionMetros === "" || produccionMetros === null
        ? ""
        : Number(produccionMetros),
    updatedAt: serverTimestamp(),
  });
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