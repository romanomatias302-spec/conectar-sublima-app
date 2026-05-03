import {
  collectionGroup,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  collection,
} from "firebase/firestore";
import { db } from "../firebase";
import { obtenerColumnasProduccion } from "./produccionColumnas";

function normalizarFecha(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;
  return new Date(valor);
}

export async function obtenerHistorialProduccionGlobal({
  perfil,
  fechaDesde = null,
  fechaHasta = null,
  pageSize = 500,
}) {
  const ref = collectionGroup(db, "historial_produccion");

  const filtros = [];

  if (perfil?.rol !== "superadmin") {
    filtros.push(where("clienteId", "==", perfil.clienteId));
  }

  if (fechaDesde) {
    const desde = new Date(fechaDesde);
    desde.setHours(0, 0, 0, 0);
    filtros.push(where("createdAt", ">=", desde));
  }

  if (fechaHasta) {
    const hasta = new Date(fechaHasta);
    hasta.setHours(23, 59, 59, 999);
    filtros.push(where("createdAt", "<=", hasta));
  }

  const q = query(
    ref,
    ...filtros,
    orderBy("createdAt", "desc"),
    limit(pageSize)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();

    return {
      firebaseId: d.id,
      pedidoId: data.pedidoId || "",
      pedidoVisibleId: data.pedidoVisibleId || "",
      pedidoNumero: data.pedidoNumero || data.numeroPedido || "",
      clienteNombre: data.clienteNombre || data.cliente || "",

      columnaOrigenNombre:
        data.columnaOrigenNombre || data.origenNombre || data.columnaOrigen || "",
      columnaDestinoNombre:
        data.columnaDestinoNombre || data.destinoNombre || data.columnaDestino || "",

      usuarioActorNombre:
        data.usuarioActorNombre || data.movidoPorNombre || data.actorNombre || "",
      usuarioActorUid:
        data.usuarioActorUid || data.movidoPorUid || data.actorUid || "",

      usuarioAsignadoNombre:
        data.usuarioAsignadoNombre || data.asignadoNombre || "",
      usuarioAsignadoUid:
        data.usuarioAsignadoUid || data.asignadoUid || "",

      duracionEnOrigenMinutos: data.duracionEnOrigenMinutos || 0,
      pedidoFinalizado: data.pedidoFinalizado === true,

      createdAt: data.createdAt || null,
      fechaDate: normalizarFecha(data.createdAt),

      raw: data,
    };
  });
}

export async function obtenerEstadoActualProduccion({ perfil }) {
  const pedidosRef = collection(db, "pedidos");

  const q =
    perfil?.rol === "superadmin"
      ? query(pedidosRef)
      : query(pedidosRef, where("clienteId", "==", perfil.clienteId));

  const snapshot = await getDocs(q);

  const pedidos = snapshot.docs
    .map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
    .filter((p) => {
      if (p.estado === "Cancelado") return false;
      if (p.produccionFinalizada === true) return false;
      return true;
    });

    let columnasMap = {};

if (perfil?.clienteId) {
  const columnas = await obtenerColumnasProduccion(perfil.clienteId);
  columnasMap = columnas.reduce((acc, col) => {
    acc[col.id] = col.nombre;
    return acc;
  }, {});
}

  return pedidos.map((p) => {
    const ultimaFecha =
      p.produccionActualizadoAt?.toDate
        ? p.produccionActualizadoAt.toDate()
        : p.produccionActualizadoAt
        ? new Date(p.produccionActualizadoAt)
        : null;

    let minutosSinMover = 0;

    if (ultimaFecha) {
      minutosSinMover = Math.round(
        (Date.now() - ultimaFecha.getTime()) / 60000
      );
    }

    return {
      firebaseId: p.firebaseId,
      pedidoVisibleId: p.id || p.numeroPedido || p.numero || "",
      clienteNombre: p.clienteNombre || p.cliente || "",
      columnaActualId: p.columnaProduccionId || "",
        columnaActualNombre:
        columnasMap[p.columnaProduccionId] ||
        p.columnaProduccionNombre ||
        p.estadoProduccion ||
        "Sin etapa",
      usuarioAsignadoUid: p.produccionAsignadoUid || "",
      usuarioAsignadoNombre:
        p.produccionAsignadoNombre ||
        p.produccionAsignadoEmail ||
        "Sin asignar",
      minutosSinMover,
      fechaEntrega: p.fechaEntrega || "",
      produccionMetros: p.produccionMetros || 0,
    };
  });
}