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

function crearFechaDesde(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function crearFechaHasta(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function obtenerMovimientosPaginados({
  perfil,
  ultimoDoc = null,
  pageSize = 100,
  fechaDesde = null,
  fechaHasta = null,
  tipo = "",
}) {
  const movimientosRef = collection(db, "movimientos");

  const filtros = [];

  if (perfil?.rol !== "superadmin") {
    filtros.push(where("clienteId", "==", perfil.clienteId));
  }

  if (tipo) {
    filtros.push(where("tipo", "==", tipo));
  }

  const desde = crearFechaDesde(fechaDesde);
  const hasta = crearFechaHasta(fechaHasta);

  if (desde) {
    filtros.push(where("fecha", ">=", fechaDesde));
  }

  if (hasta) {
    filtros.push(where("fecha", "<=", fechaHasta));
  }

 const q = ultimoDoc
  ? query(
      movimientosRef,
      ...filtros,
      orderBy("fecha", "desc"),
      startAfter(ultimoDoc),
      limit(pageSize)
    )
  : query(
      movimientosRef,
      ...filtros,
      orderBy("fecha", "desc"),
      limit(pageSize)
    );

  const snapshot = await getDocs(q);

  return {
    movimientos: snapshot.docs.map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    })),
    ultimoDoc: snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null,
    hayMas: snapshot.docs.length === pageSize,
  };
}