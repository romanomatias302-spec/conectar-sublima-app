import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

async function obtenerDocSeguro(coleccion, id) {
  if (!id) return null;

  const ref = doc(db, coleccion, id);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    firebaseId: snap.id,
    ...snap.data(),
  };
}

export async function obtenerDetalleMovimientoAuditoria(movimiento) {
  if (!movimiento) return null;

  const origen = movimiento.origen || "";
  const origenRefId = movimiento.origenRefId || "";

  let detalle = null;

  if (origen === "gasto") {
    detalle = await obtenerDocSeguro("gastos", origenRefId);
  }

  if (origen === "venta") {
    detalle = await obtenerDocSeguro("ventas", origenRefId);
  }

  if (origen === "caja") {
    detalle = await obtenerDocSeguro("cajas", origenRefId);
  }

  return {
    movimiento,
    origen,
    detalle,
  };
}