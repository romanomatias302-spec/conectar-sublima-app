import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { fechaISOEnRango } from "./informesComerciales";
import { desplazarFechaISO, obtenerLimitesPeriodoUTC } from "../utils/fechas";

function exigirTenant(perfil) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId para Inicio.");
  return perfil.clienteId;
}

function normalizarEstado(valor) {
  return String(valor || "").trim().toLowerCase();
}

export function ventaCuentaComoActiva(venta) {
  return !["anulada", "cancelada", "cancelado"].includes(
    normalizarEstado(venta?.estadoVenta)
  );
}

export function pagoCuentaComoActivo(pago) {
  return (
    normalizarEstado(pago?.estadoPagoRegistro || "activo") === "activo" &&
    pago?.anulado !== true &&
    pago?.activo !== false
  );
}

export function pedidoEstaFinalizado(pedido) {
  return (
    pedido?.produccionFinalizada === true ||
    normalizarEstado(pedido?.estadoProduccion) === "finalizado" ||
    ["terminado", "finalizado", "producción finalizada", "produccion finalizada"].includes(
      normalizarEstado(pedido?.estado)
    )
  );
}

export function pedidoEstaCancelado(pedido) {
  return (
    normalizarEstado(pedido?.estado) === "cancelado" ||
    normalizarEstado(pedido?.estadoProduccion) === "cancelado"
  );
}

export function pedidoCuentaComoAtrasado(pedido, hoyNegocio) {
  const fechaEntrega = String(pedido?.fechaEntrega || "");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega) &&
    fechaEntrega < hoyNegocio &&
    !pedidoEstaFinalizado(pedido) &&
    !pedidoEstaCancelado(pedido)
  );
}

export function acumularVentaYCobrosInicio({
  resumen,
  venta,
  pagos = [],
  fechaDesde,
  fechaHasta,
}) {
  if (
    ventaCuentaComoActiva(venta) &&
    fechaISOEnRango(venta?.fechaVenta, fechaDesde, fechaHasta)
  ) {
    resumen.ventas += Number(venta?.total) || 0;
  }

  pagos.forEach((pago) => {
    if (
      pagoCuentaComoActivo(pago) &&
      fechaISOEnRango(pago?.fechaPago, fechaDesde, fechaHasta)
    ) {
      resumen.cobrado += Number(pago?.monto) || 0;
    }
  });

  return resumen;
}

export async function obtenerCantidadPedidosPeriodo({ perfil, fechaDesde, fechaHasta }) {
  const clienteId = exigirTenant(perfil);
  const resultado = await getCountFromServer(
    query(
      collection(db, "pedidos"),
      where("clienteId", "==", clienteId),
      where("fechaPedido", ">=", fechaDesde),
      where("fechaPedido", "<=", fechaHasta)
    )
  );
  return resultado.data().count || 0;
}

export async function obtenerCantidadSinIniciar({ perfil }) {
  const clienteId = exigirTenant(perfil);
  const resultado = await getCountFromServer(
    query(
      collection(db, "pedidos"),
      where("clienteId", "==", clienteId),
      where("estadoProduccion", "==", "pendiente")
    )
  );
  return resultado.data().count || 0;
}

export async function obtenerCantidadFinalizadosPeriodo({
  perfil,
  fechaDesde,
  fechaHasta,
}) {
  const clienteId = exigirTenant(perfil);
  const { inicio, finExclusivo } = obtenerLimitesPeriodoUTC({
    desde: fechaDesde,
    hasta: fechaHasta,
    perfil,
  });
  const resultado = await getCountFromServer(
    query(
      collection(db, "pedidos"),
      where("clienteId", "==", clienteId),
      where("estadoProduccion", "==", "finalizado"),
      where("produccionActualizadoAt", ">=", inicio),
      where("produccionActualizadoAt", "<", finExclusivo)
    )
  );
  return resultado.data().count || 0;
}

export async function obtenerCantidadClientesNuevosPeriodo({
  perfil,
  fechaDesde,
  fechaHasta,
}) {
  const clienteId = exigirTenant(perfil);
  const { inicio, finExclusivo } = obtenerLimitesPeriodoUTC({
    desde: fechaDesde,
    hasta: fechaHasta,
    perfil,
  });
  const resultado = await getCountFromServer(
    query(
      collection(db, "clientes"),
      where("clienteId", "==", clienteId),
      where("createdAt", ">=", inicio),
      where("createdAt", "<", finExclusivo)
    )
  );
  return resultado.data().count || 0;
}

export async function obtenerResumenVentasCobros({
  perfil,
  fechaDesde,
  fechaHasta,
  pageSize = 100,
}) {
  exigirTenant(perfil);
  const [ventas, cobrado] = await Promise.all([
    obtenerTotalVentasPeriodo({ perfil, fechaDesde, fechaHasta, pageSize }),
    obtenerTotalCobradoCollectionGroupPreparado({
      perfil,
      fechaDesde,
      fechaHasta,
      pageSize,
    }),
  ]);
  return { ventas, cobrado };
}

export async function obtenerTotalVentasPeriodo({
  perfil,
  fechaDesde,
  fechaHasta,
  pageSize = 100,
}) {
  const clienteId = exigirTenant(perfil);
  const finExclusivo = desplazarFechaISO(fechaHasta, 1);
  let total = 0;
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const snapshot = await getDocs(
      query(
        collection(db, "ventas"),
        where("clienteId", "==", clienteId),
        where("fechaVenta", ">=", fechaDesde),
        where("fechaVenta", "<", finExclusivo),
        orderBy("fechaVenta", "asc"),
        ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
        limit(pageSize)
      )
    );

    for (const ventaDoc of snapshot.docs) {
      const venta = ventaDoc.data();
      if (venta.clienteId !== clienteId) continue;
      if (!ventaCuentaComoActiva(venta)) continue;
      if (!fechaISOEnRango(venta.fechaVenta, fechaDesde, fechaHasta)) continue;
      total += Number(venta.total) || 0;
    }

    ultimoDoc = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;
    hayMas = snapshot.docs.length === pageSize && Boolean(ultimoDoc);
  }

  return total;
}

export async function obtenerTotalCobradoPeriodoSeguro({
  perfil,
  fechaDesde,
  fechaHasta,
  pageSize = 100,
}) {
  const clienteId = exigirTenant(perfil);
  const resumen = { ventas: 0, cobrado: 0 };
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const snapshot = await getDocs(
      query(
        collection(db, "ventas"),
        where("clienteId", "==", clienteId),
        ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
        limit(pageSize)
      )
    );

    const ventas = await Promise.all(
      snapshot.docs.map(async (ventaDoc) => {
        const venta = { firebaseId: ventaDoc.id, ...ventaDoc.data() };
        if (venta.clienteId !== clienteId) return null;

        const pagosSnapshot = await getDocs(
          collection(db, "ventas", ventaDoc.id, "pagos")
        );
        let pagos = pagosSnapshot.docs
          .map((pagoDoc) => ({ firebaseId: pagoDoc.id, ...pagoDoc.data() }))
          .filter((pago) => !pago.clienteId || pago.clienteId === clienteId);

        if (!pagos.length && Array.isArray(venta.pagos)) pagos = venta.pagos;
        return { venta, pagos };
      })
    );

    ventas.forEach((entrada) => {
      if (!entrada) return;
      acumularVentaYCobrosInicio({
        resumen,
        venta: {},
        pagos: entrada.pagos,
        fechaDesde,
        fechaHasta,
      });
    });

    ultimoDoc = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;
    hayMas = snapshot.docs.length === pageSize && Boolean(ultimoDoc);
  }

  return resumen.cobrado;
}

// Datasource optimizado, activado después de normalizar y validar los pagos
// históricos compatibles con la consulta collection group.
export async function obtenerTotalCobradoCollectionGroupPreparado({
  perfil,
  fechaDesde,
  fechaHasta,
  pageSize = 100,
}) {
  const clienteId = exigirTenant(perfil);
  const finExclusivo = desplazarFechaISO(fechaHasta, 1);
  let total = 0;
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const snapshot = await getDocs(
      query(
        collectionGroup(db, "pagos"),
        where("clienteId", "==", clienteId),
        where("estadoPagoRegistro", "==", "activo"),
        where("fechaPago", ">=", fechaDesde),
        where("fechaPago", "<", finExclusivo),
        orderBy("fechaPago", "asc"),
        ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
        limit(pageSize)
      )
    );

    for (const pagoDoc of snapshot.docs) {
      const pago = pagoDoc.data();
      if (pago.clienteId !== clienteId) continue;
      if (!pagoCuentaComoActivo(pago)) continue;
      if (!fechaISOEnRango(pago.fechaPago, fechaDesde, fechaHasta)) continue;
      total += Number(pago.monto) || 0;
    }

    ultimoDoc = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;
    hayMas = snapshot.docs.length === pageSize && Boolean(ultimoDoc);
  }

  return total;
}

export async function obtenerPedidosAtrasadosActuales({
  perfil,
  hoyNegocio,
  pageSize = 100,
}) {
  const clienteId = exigirTenant(perfil);
  let ultimoDoc = null;
  let hayMas = true;
  let cantidad = 0;
  let pedidoMasAtrasado = null;

  while (hayMas) {
    const snapshot = await getDocs(
      query(
        collection(db, "pedidos"),
        where("clienteId", "==", clienteId),
        where("fechaEntrega", "<", hoyNegocio),
        orderBy("fechaEntrega", "asc"),
        ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
        limit(pageSize)
      )
    );

    for (const pedidoDoc of snapshot.docs) {
      const pedido = { firebaseId: pedidoDoc.id, ...pedidoDoc.data() };
      if (pedido.clienteId !== clienteId) continue;
      if (!pedidoCuentaComoAtrasado(pedido, hoyNegocio)) continue;
      cantidad += 1;
      if (!pedidoMasAtrasado) pedidoMasAtrasado = pedido;
    }

    ultimoDoc = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;
    hayMas = snapshot.docs.length === pageSize && Boolean(ultimoDoc);
  }

  return { cantidad, pedidoMasAtrasado };
}

export async function obtenerSeriePedidos({ perfil, dias }) {
  const clienteId = exigirTenant(perfil);
  if (!dias.length) return [];
  const snapshot = await getDocs(
    query(
      collection(db, "pedidos"),
      where("clienteId", "==", clienteId),
      where("fechaPedido", ">=", dias[0].fecha),
      where("fechaPedido", "<=", dias[dias.length - 1].fecha)
    )
  );
  const mapa = Object.fromEntries(dias.map((dia) => [dia.fecha, { ...dia }]));
  snapshot.docs.forEach((pedidoDoc) => {
    const pedido = pedidoDoc.data();
    if (pedido.clienteId !== clienteId || !mapa[pedido.fechaPedido]) return;
    mapa[pedido.fechaPedido].cantidad += 1;
  });
  return dias.map((dia) => mapa[dia.fecha]);
}
