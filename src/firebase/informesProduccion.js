import {
  collectionGroup,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  collection,
  startAfter,
} from "firebase/firestore";
import { db } from "../firebase";
import { obtenerColumnasProduccion } from "./produccionColumnas";

function normalizarFecha(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;
  return new Date(valor);
}

function mapearEventoProduccion(d) {
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
}

function crearFiltrosHistorial({ perfil, fechaDesde, fechaHasta }) {
  const filtros = [];

  if (perfil?.rol !== "superadmin") {
    filtros.push(where("clienteId", "==", perfil.clienteId));
  }

  // Se conserva la interpretación de fechas existente en esta etapa.
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

  return filtros;
}

export function crearMetricasProduccionVacias() {
  return {
    totalMovimientos: 0,
    pedidosFinalizados: 0,
    cantidadConDuracion: 0,
    totalDuracionMinutos: 0,
    productividadPorUsuarioEtapa: {},
    porEtapa: {},
  };
}

export function acumularEventoProduccion(metricas, evento, usuarioUid = "") {
  if (usuarioUid && evento.usuarioAsignadoUid !== usuarioUid) return metricas;

  metricas.totalMovimientos += 1;
  if (evento.pedidoFinalizado === true) metricas.pedidosFinalizados += 1;

  const duracion = Number(evento.duracionEnOrigenMinutos) || 0;
  if (duracion <= 0) return metricas;

  metricas.cantidadConDuracion += 1;
  metricas.totalDuracionMinutos += duracion;

  const usuarioKey =
    evento.usuarioAsignadoUid ||
    evento.usuarioAsignadoNombre ||
    "sin_asignar";
  const usuarioNombre = evento.usuarioAsignadoNombre || "Sin asignar";
  const etapa = evento.columnaOrigenNombre || "Sin etapa";
  const productividadKey = `${usuarioKey}_${etapa}`;

  if (!metricas.productividadPorUsuarioEtapa[productividadKey]) {
    metricas.productividadPorUsuarioEtapa[productividadKey] = {
      usuario: usuarioNombre,
      etapa,
      intervenciones: 0,
      totalMinutos: 0,
      peorCasoMinutos: 0,
    };
  }

  const productividad =
    metricas.productividadPorUsuarioEtapa[productividadKey];
  productividad.intervenciones += 1;
  productividad.totalMinutos += duracion;
  productividad.peorCasoMinutos = Math.max(
    productividad.peorCasoMinutos,
    duracion
  );

  if (!metricas.porEtapa[etapa]) {
    metricas.porEtapa[etapa] = {
      etapa,
      totalMinutos: 0,
      peorCasoMinutos: 0,
      intervenciones: 0,
    };
  }

  const etapaAcumulada = metricas.porEtapa[etapa];
  etapaAcumulada.intervenciones += 1;
  etapaAcumulada.totalMinutos += duracion;
  etapaAcumulada.peorCasoMinutos = Math.max(
    etapaAcumulada.peorCasoMinutos,
    duracion
  );
  return metricas;
}

export function finalizarMetricasProduccion(metricas) {
  const productividadKpi = Object.values(
    metricas.productividadPorUsuarioEtapa
  )
    .map((item) => ({
      ...item,
      promedioMinutos: item.intervenciones
        ? Math.round(item.totalMinutos / item.intervenciones)
        : 0,
    }))
    .sort((a, b) => b.promedioMinutos - a.promedioMinutos);

  const etapasKpi = Object.values(metricas.porEtapa)
    .map((item) => ({
      ...item,
      promedioMinutos: item.intervenciones
        ? Math.round(item.totalMinutos / item.intervenciones)
        : 0,
    }))
    .sort((a, b) => b.promedioMinutos - a.promedioMinutos);

  return {
    totalMovimientos: metricas.totalMovimientos,
    pedidosFinalizados: metricas.pedidosFinalizados,
    promedioGeneralMinutos: metricas.cantidadConDuracion
      ? Math.round(
          metricas.totalDuracionMinutos / metricas.cantidadConDuracion
        )
      : 0,
    productividadKpi,
    etapasKpi,
  };
}

export async function obtenerHistorialProduccionGlobal({
  perfil,
  fechaDesde = null,
  fechaHasta = null,
  pageSize = 500,
}) {
  const q = query(
    collectionGroup(db, "historial_produccion"),
    ...crearFiltrosHistorial({ perfil, fechaDesde, fechaHasta }),
    orderBy("createdAt", "desc"),
    limit(pageSize)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapearEventoProduccion);
}

export async function obtenerMetricasHistorialProduccion({
  perfil,
  fechaDesde = null,
  fechaHasta = null,
  usuarioUid = "",
  pageSize = 500,
}) {
  const ref = collectionGroup(db, "historial_produccion");
  const filtros = crearFiltrosHistorial({ perfil, fechaDesde, fechaHasta });
  const metricas = crearMetricasProduccionVacias();
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const q = query(
      ref,
      ...filtros,
      orderBy("createdAt", "desc"),
      ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
      limit(pageSize)
    );
    const snapshot = await getDocs(q);

    snapshot.docs.forEach((doc) =>
      acumularEventoProduccion(
        metricas,
        mapearEventoProduccion(doc),
        usuarioUid
      )
    );
    ultimoDoc = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;
    hayMas = snapshot.docs.length === pageSize && Boolean(ultimoDoc);
  }

  return finalizarMetricasProduccion(metricas);
}

export async function obtenerEstadoActualProduccion({ perfil }) {
  const pedidosRef = collection(db, "pedidos");
  const q =
    perfil?.rol === "superadmin"
      ? query(pedidosRef)
      : query(pedidosRef, where("clienteId", "==", perfil.clienteId));
  const snapshot = await getDocs(q);

  const pedidos = snapshot.docs
    .map((d) => ({ firebaseId: d.id, ...d.data() }))
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
    const ultimaFecha = p.produccionActualizadoAt?.toDate
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
