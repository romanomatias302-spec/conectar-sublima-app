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