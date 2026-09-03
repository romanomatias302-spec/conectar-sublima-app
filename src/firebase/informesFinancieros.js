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

export function claveSaldoCliente(venta) {
  return venta.clienteRefId || venta.clienteNombre || "sin_cliente";
}

export function claveSaldoProveedor(gasto) {
  return (
    gasto.proveedorId ||
    gasto.proveedorNombre ||
    gasto.proveedor ||
    "sin_proveedor"
  );
}

async function recorrerConsultaPaginada({
  crearConsulta,
  pageSize,
  procesarDocumento,
}) {
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const snap = await getDocs(crearConsulta(ultimoDoc));
    snap.docs.forEach(procesarDocumento);
    ultimoDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    hayMas = snap.docs.length === pageSize && Boolean(ultimoDoc);
  }
}

export async function obtenerSaldosPendientesClientes({ perfil, pageSize = 200 }) {
  if (!perfil?.clienteId) return [];

  const porCliente = {};

  await recorrerConsultaPaginada({
    pageSize,
    crearConsulta: (ultimoDoc) =>
      query(
        collection(db, "ventas"),
        where("clienteId", "==", perfil.clienteId),
        where("estadoVenta", "==", "activa"),
        where("saldoPendiente", ">", 0),
        orderBy("saldoPendiente", "desc"),
        ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
        limit(pageSize)
      ),
    procesarDocumento: (d) => {
    const venta = { firebaseId: d.id, ...d.data() };
    const key = claveSaldoCliente(venta);

    if (!porCliente[key]) {
      porCliente[key] = {
        clienteId: venta.clienteRefId || "",
        clienteNombre: venta.clienteNombre || "Sin cliente",
        cantidad: 0,
        totalPendiente: 0,
        ultimaVenta: "",
        ultimaFecha: "",
      };
    }

    porCliente[key].cantidad += 1;
    porCliente[key].totalPendiente += Number(venta.saldoPendiente || 0);

    if (!porCliente[key].ultimaFecha || venta.fechaVenta > porCliente[key].ultimaFecha) {
      porCliente[key].ultimaFecha = venta.fechaVenta || "";
      porCliente[key].ultimaVenta = venta.numeroVenta || "";
    }
    },
  });

  return Object.values(porCliente).sort(
    (a, b) => b.totalPendiente - a.totalPendiente
  );
}

export async function obtenerSaldosPendientesProveedores({ perfil, pageSize = 200 }) {
  if (!perfil?.clienteId) return [];

  const porProveedor = {};

  await recorrerConsultaPaginada({
    pageSize,
    crearConsulta: (ultimoDoc) =>
      query(
        collection(db, "gastos"),
        where("clienteId", "==", perfil.clienteId),
        where("estado", "==", "activo"),
        where("saldo", ">", 0),
        orderBy("saldo", "desc"),
        ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
        limit(pageSize)
      ),
    procesarDocumento: (d) => {
    const gasto = { firebaseId: d.id, ...d.data() };
    const key = claveSaldoProveedor(gasto);

    if (!porProveedor[key]) {
      porProveedor[key] = {
        proveedorId: gasto.proveedorId || "",
        proveedorNombre: gasto.proveedorNombre || gasto.proveedor || "Sin proveedor",
        cantidad: 0,
        totalPendiente: 0,
        ultimoGasto: "",
        ultimaFecha: "",
      };
    }

    porProveedor[key].cantidad += 1;
    porProveedor[key].totalPendiente += Number(gasto.saldo || 0);

    if (!porProveedor[key].ultimaFecha || gasto.fecha > porProveedor[key].ultimaFecha) {
      porProveedor[key].ultimaFecha = gasto.fecha || "";
      porProveedor[key].ultimoGasto = gasto.numeroGasto || "";
    }
    },
  });

  return Object.values(porProveedor).sort(
    (a, b) => b.totalPendiente - a.totalPendiente
  );
}

async function obtenerDetalleSaldoPaginado({
  crearConsulta,
  ultimoDoc = null,
  pageSize,
  scanPageSize,
  coincide,
  mapear,
}) {
  const resultados = [];
  let cursor = ultimoDoc;
  let recorridoCompleto = false;

  while (resultados.length < pageSize && !recorridoCompleto) {
    const snap = await getDocs(crearConsulta(cursor));
    let seDetuvoPorLimite = false;

    for (const documento of snap.docs) {
      cursor = documento;
      const data = { firebaseId: documento.id, ...documento.data() };
      if (coincide(data)) resultados.push(mapear(data));
      if (resultados.length === pageSize) {
        seDetuvoPorLimite = true;
        break;
      }
    }

    recorridoCompleto =
      !seDetuvoPorLimite &&
      (snap.docs.length < scanPageSize || snap.docs.length === 0);
  }

  return {
    resultados,
    ultimoDoc: cursor,
    hayMas: !recorridoCompleto,
  };
}

export async function obtenerVentasPendientesClientePaginadas({
  perfil,
  clienteClave,
  ultimoDoc = null,
  pageSize = 25,
  scanPageSize = 200,
}) {
  if (!perfil?.clienteId || !clienteClave) {
    return { ventas: [], ultimoDoc: null, hayMas: false };
  }

  const resultado = await obtenerDetalleSaldoPaginado({
    ultimoDoc,
    pageSize,
    scanPageSize,
    crearConsulta: (cursor) =>
      query(
        collection(db, "ventas"),
        where("clienteId", "==", perfil.clienteId),
        where("estadoVenta", "==", "activa"),
        where("saldoPendiente", ">", 0),
        orderBy("saldoPendiente", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(scanPageSize)
      ),
    coincide: (venta) => claveSaldoCliente(venta) === clienteClave,
    mapear: (venta) => ({
      firebaseId: venta.firebaseId,
      numeroVenta: venta.numeroVenta || "",
      fechaVenta: venta.fechaVenta || "",
      total: Number(venta.total || 0),
      totalPagado: Number(venta.totalPagado || 0),
      saldoPendiente: Number(venta.saldoPendiente || 0),
      estadoPago: venta.estadoPago || "",
    }),
  });

  return { ...resultado, ventas: resultado.resultados };
}

export async function obtenerGastosPendientesProveedorPaginados({
  perfil,
  proveedorClave,
  ultimoDoc = null,
  pageSize = 25,
  scanPageSize = 200,
}) {
  if (!perfil?.clienteId || !proveedorClave) {
    return { gastos: [], ultimoDoc: null, hayMas: false };
  }

  const resultado = await obtenerDetalleSaldoPaginado({
    ultimoDoc,
    pageSize,
    scanPageSize,
    crearConsulta: (cursor) =>
      query(
        collection(db, "gastos"),
        where("clienteId", "==", perfil.clienteId),
        where("estado", "==", "activo"),
        where("saldo", ">", 0),
        orderBy("saldo", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(scanPageSize)
      ),
    coincide: (gasto) => claveSaldoProveedor(gasto) === proveedorClave,
    mapear: (gasto) => ({
      firebaseId: gasto.firebaseId,
      numeroGasto: gasto.numeroGasto || "",
      fecha: gasto.fecha || "",
      categoria: gasto.categoria || "",
      descripcion: gasto.descripcion || "",
      total: Number(gasto.total || gasto.monto || 0),
      totalPagado: Number(gasto.totalPagado || 0),
      saldo: Number(gasto.saldo || 0),
    }),
  });

  return { ...resultado, gastos: resultado.resultados };
}
