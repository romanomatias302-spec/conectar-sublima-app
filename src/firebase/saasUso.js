import { doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function registrarUsoSaas({
  clienteId,
  ventas = 0,
  pedidos = 0,
  imagenesPedido = 0,
  storageMB = 0,
}) {
  if (!clienteId) {
    console.warn("registrarUsoSaas sin clienteId");
    return;
  }

  try {
    const ref = doc(db, "clientes-saas-uso", clienteId);

    await setDoc(
      ref,
      {
        clienteId,

        ventasUltimos30: increment(Number(ventas || 0)),
        pedidosUltimos30: increment(Number(pedidos || 0)),
        imagenesPedidoUltimos30: increment(Number(imagenesPedido || 0)),
        storageUltimos30MB: increment(Number(storageMB || 0)),

        ventasTotal: increment(Number(ventas || 0)),
        pedidosTotal: increment(Number(pedidos || 0)),
        imagenesPedidoTotal: increment(Number(imagenesPedido || 0)),
        storageTotalMB: increment(Number(storageMB || 0)),

        ultimoUsoAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("registrarUsoSaas OK", {
      clienteId,
      ventas,
      pedidos,
      imagenesPedido,
      storageMB,
    });
  } catch (error) {
    console.error("registrarUsoSaas ERROR", error);
  }
}