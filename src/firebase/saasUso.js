import { doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export const registrarUsoSaas = async ({
  clienteId,
  pedidos = 0,
  ventas = 0,
  storageMB = 0,
  lecturas = 0,
  escrituras = 0,
}) => {
  if (!clienteId) return;

  const ref = doc(db, "clientes-saas-uso", clienteId);

  await setDoc(
    ref,
    {
      clienteId,
      pedidosUltimos30: increment(pedidos),
      ventasUltimos30: increment(ventas),
      storageUltimos30MB: increment(storageMB),
      lecturasUltimos30: increment(lecturas),
      escriturasUltimos30: increment(escrituras),

      pedidosTotal: increment(pedidos),
      ventasTotal: increment(ventas),

      ultimoUsoAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};