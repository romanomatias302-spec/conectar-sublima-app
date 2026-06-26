import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";

export async function obtenerSaldosPendientesClientes({ perfil, pageSize = 200 }) {
  if (!perfil?.clienteId) return [];

  const q = query(
    collection(db, "ventas"),
    where("clienteId", "==", perfil.clienteId),
    where("estadoVenta", "==", "activa"),
    where("saldoPendiente", ">", 0),
    orderBy("saldoPendiente", "desc"),
    limit(pageSize)
  );

  const snap = await getDocs(q);

  const porCliente = {};

  snap.docs.forEach((d) => {
    const venta = { firebaseId: d.id, ...d.data() };
    const key = venta.clienteRefId || venta.clienteNombre || "sin_cliente";

    if (!porCliente[key]) {
      porCliente[key] = {
        clienteId: venta.clienteRefId || "",
        clienteNombre: venta.clienteNombre || "Sin cliente",
        cantidad: 0,
        totalPendiente: 0,
        ultimaVenta: "",
        ultimaFecha: "",
        ventas: [],
      };
    }

    porCliente[key].cantidad += 1;
    porCliente[key].totalPendiente += Number(venta.saldoPendiente || 0);

    porCliente[key].ventas.push({
    firebaseId: venta.firebaseId,
    numeroVenta: venta.numeroVenta || "",
    fechaVenta: venta.fechaVenta || "",
    total: Number(venta.total || 0),
    totalPagado: Number(venta.totalPagado || 0),
    saldoPendiente: Number(venta.saldoPendiente || 0),
    estadoPago: venta.estadoPago || "",
    });

    if (!porCliente[key].ultimaFecha || venta.fechaVenta > porCliente[key].ultimaFecha) {
      porCliente[key].ultimaFecha = venta.fechaVenta || "";
      porCliente[key].ultimaVenta = venta.numeroVenta || "";
    }
  });

  return Object.values(porCliente).sort(
    (a, b) => b.totalPendiente - a.totalPendiente
  );
}

export async function obtenerSaldosPendientesProveedores({ perfil, pageSize = 200 }) {
  if (!perfil?.clienteId) return [];

  const q = query(
    collection(db, "gastos"),
    where("clienteId", "==", perfil.clienteId),
    where("estado", "==", "activo"),
    where("saldo", ">", 0),
    orderBy("saldo", "desc"),
    limit(pageSize)
  );

  const snap = await getDocs(q);

  const porProveedor = {};

  snap.docs.forEach((d) => {
    const gasto = { firebaseId: d.id, ...d.data() };
    const key = gasto.proveedorId || gasto.proveedorNombre || gasto.proveedor || "sin_proveedor";

    if (!porProveedor[key]) {
      porProveedor[key] = {
        proveedorId: gasto.proveedorId || "",
        proveedorNombre: gasto.proveedorNombre || gasto.proveedor || "Sin proveedor",
        cantidad: 0,
        totalPendiente: 0,
        ultimoGasto: "",
        ultimaFecha: "",
        gastos: [],
      };
    }

    porProveedor[key].cantidad += 1;
    porProveedor[key].totalPendiente += Number(gasto.saldo || 0);

    porProveedor[key].gastos.push({
    firebaseId: gasto.firebaseId,
    numeroGasto: gasto.numeroGasto || "",
    fecha: gasto.fecha || "",
    categoria: gasto.categoria || "",
    total: Number(gasto.total || gasto.monto || 0),
    totalPagado: Number(gasto.totalPagado || 0),
    saldo: Number(gasto.saldo || 0),
    });

    if (!porProveedor[key].ultimaFecha || gasto.fecha > porProveedor[key].ultimaFecha) {
      porProveedor[key].ultimaFecha = gasto.fecha || "";
      porProveedor[key].ultimoGasto = gasto.numeroGasto || "";
    }
  });

  return Object.values(porProveedor).sort(
    (a, b) => b.totalPendiente - a.totalPendiente
  );
}