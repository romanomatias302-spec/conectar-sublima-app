import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { db } from "../firebase";

export async function obtenerMovimientosPaginados({
  perfil,
  ultimoDoc = null,
  pageSize = 100,
}) {
  const movimientosRef = collection(db, "movimientos");

  const q =
    perfil?.rol === "superadmin"
      ? ultimoDoc
        ? query(
            movimientosRef,
            orderBy("createdAt", "desc"),
            startAfter(ultimoDoc),
            limit(pageSize)
          )
        : query(
            movimientosRef,
            orderBy("createdAt", "desc"),
            limit(pageSize)
          )
      : ultimoDoc
      ? query(
          movimientosRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          startAfter(ultimoDoc),
          limit(pageSize)
        )
      : query(
          movimientosRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );

  const snapshot = await getDocs(q);

  return {
    movimientos: snapshot.docs.map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    })),
    ultimoDoc: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
    hayMas: snapshot.docs.length === pageSize,
  };
}