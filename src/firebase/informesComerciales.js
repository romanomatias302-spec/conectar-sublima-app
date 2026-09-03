import {
  collection,
  getDocs,
  limit,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export function fechaISOEnRango(fecha, desde = "", hasta = "") {
  const valor = String(fecha || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  if (desde && valor < desde) return false;
  if (hasta && valor > hasta) return false;
  return true;
}

function textoNormalizado(valor) {
  return String(valor || "").trim().toLowerCase();
}

function claveCliente(venta) {
  const tenant = textoNormalizado(venta.clienteId) || "sin_tenant";
  const identidad = venta.clienteRefId
    ? `id:${venta.clienteRefId}`
    : `nombre:${textoNormalizado(venta.clienteNombre) || "sin_cliente"}`;
  return `${tenant}|${identidad}`;
}

function claveProducto(item, tenantId = "") {
  const tenant = textoNormalizado(tenantId) || "sin_tenant";
  const variante =
    item.varianteId || textoNormalizado(item.varianteNombre) || "sin_variante";

  if (item.productoBaseId) {
    return `${tenant}|id:${item.productoBaseId}|var:${variante}`;
  }

  const nombre = textoNormalizado(
    item.productoListaNombre || item.descripcion
  ) || "sin_nombre";
  return `${tenant}|legacy:${nombre}|var:${variante}`;
}

function clavePedido(venta) {
  const tenant = textoNormalizado(venta.clienteId) || "sin_tenant";
  const referencia =
    venta.pedidoRefId ||
    venta.pedidoVisibleId ||
    ((venta.origenVenta || "").toLowerCase() === "pedido"
      ? venta.firebaseId || venta.numeroVenta
      : "");
  return referencia ? `${tenant}|${referencia}` : "";
}

export function crearAcumuladorComercial() {
  return {
    ventasCantidad: 0,
    pedidos: new Set(),
    importeTotalVendido: 0,
    unidadesVendidas: 0,
    productos: {},
    clientesVentas: {},
    clientesIngresos: {},
    pagosCantidad: 0,
    ingresosRecibidos: 0,
    ventasSinItems: 0,
    fuentesInvalidas: 0,
  };
}

function acumularClienteVentas(acumulador, venta) {
  const clave = claveCliente(venta);
  if (!acumulador.clientesVentas[clave]) {
    acumulador.clientesVentas[clave] = {
      clave,
      clienteId: venta.clienteRefId || "",
      clienteNombre: venta.clienteNombre || "Sin cliente",
      cantidadVentas: 0,
      totalVendido: 0,
    };
  }

  const cliente = acumulador.clientesVentas[clave];
  cliente.cantidadVentas += 1;
  cliente.totalVendido += Number(venta.total) || 0;
}

function acumularProductos(acumulador, venta, items) {
  const activos = items.filter(
    (item) => (item.estadoItem || "activo") === "activo"
  );
  if (!activos.length) {
    acumulador.ventasSinItems += 1;
    return;
  }

  const subtotales = activos.map((item) => {
    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(item.precioUnitario) || 0;
    return Number(item.subtotal) || cantidad * precio;
  });
  const subtotalVenta = subtotales.reduce((total, valor) => total + valor, 0);
  const totalVenta = Number(venta.total) || 0;
  const factor = subtotalVenta > 0 ? totalVenta / subtotalVenta : 0;
  const productosVistos = new Set();

  activos.forEach((item, index) => {
    const clave = claveProducto(item, venta.clienteId);
    const cantidad = Number(item.cantidad) || 0;
    const importe = subtotales[index] * factor;

    if (!acumulador.productos[clave]) {
      acumulador.productos[clave] = {
        clave,
        productoId: item.productoBaseId || "",
        productoNombre:
          item.productoListaNombre || item.descripcion || "Sin nombre",
        varianteNombre: item.varianteNombre || "",
        cantidadVendida: 0,
        cantidadVentas: 0,
        importeTotal: 0,
        legacy: !item.productoBaseId,
      };
    }

    const producto = acumulador.productos[clave];
    producto.cantidadVendida += cantidad;
    producto.importeTotal += importe;
    acumulador.unidadesVendidas += cantidad;

    if (!productosVistos.has(clave)) {
      producto.cantidadVentas += 1;
      productosVistos.add(clave);
    }
  });
}

function acumularPagos(acumulador, venta, pagos, desde, hasta) {
  pagos
    .filter(
      (pago) =>
        (pago.estadoPagoRegistro || "activo") === "activo" &&
        fechaISOEnRango(pago.fechaPago, desde, hasta)
    )
    .forEach((pago) => {
      const monto = Number(pago.monto) || 0;
      const clave = claveCliente(venta);

      if (!acumulador.clientesIngresos[clave]) {
        acumulador.clientesIngresos[clave] = {
          clave,
          clienteId: venta.clienteRefId || "",
          clienteNombre: venta.clienteNombre || "Sin cliente",
          cantidadCobros: 0,
          ingresosRecibidos: 0,
        };
      }

      acumulador.clientesIngresos[clave].cantidadCobros += 1;
      acumulador.clientesIngresos[clave].ingresosRecibidos += monto;
      acumulador.pagosCantidad += 1;
      acumulador.ingresosRecibidos += monto;
    });
}

export function acumularVentaComercial({
  acumulador,
  venta,
  items = [],
  pagos = [],
  fechaDesde = "",
  fechaHasta = "",
}) {
  const ventaActiva = (venta.estadoVenta || "activa") !== "anulada";

  if (
    ventaActiva &&
    fechaISOEnRango(venta.fechaVenta, fechaDesde, fechaHasta)
  ) {
    acumulador.ventasCantidad += 1;
    const pedido = clavePedido(venta);
    if (pedido) acumulador.pedidos.add(pedido);
    acumulador.importeTotalVendido += Number(venta.total) || 0;
    acumularClienteVentas(acumulador, venta);
    acumularProductos(acumulador, venta, items);
  }

  acumularPagos(acumulador, venta, pagos, fechaDesde, fechaHasta);
  return acumulador;
}

export function finalizarInformeComercial(acumulador) {
  return {
    resumen: {
      ventasCantidad: acumulador.ventasCantidad,
      pedidosCantidad: acumulador.pedidos.size,
      importeTotalVendido: acumulador.importeTotalVendido,
      unidadesVendidas: acumulador.unidadesVendidas,
      productosDistintos: Object.keys(acumulador.productos).length,
      pagosCantidad: acumulador.pagosCantidad,
      ingresosRecibidos: acumulador.ingresosRecibidos,
      ventasSinItems: acumulador.ventasSinItems,
      fuentesInvalidas: acumulador.fuentesInvalidas,
    },
    productos: Object.values(acumulador.productos).sort(
      (a, b) => b.importeTotal - a.importeTotal
    ),
    clientesVentas: Object.values(acumulador.clientesVentas).sort(
      (a, b) => b.totalVendido - a.totalVendido
    ),
    clientesIngresos: Object.values(acumulador.clientesIngresos).sort(
      (a, b) => b.ingresosRecibidos - a.ingresosRecibidos
    ),
  };
}

export async function obtenerInformeComercialCompleto({
  perfil,
  fechaDesde = "",
  fechaHasta = "",
  pageSize = 100,
}) {
  if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
    return finalizarInformeComercial(crearAcumuladorComercial());
  }

  const acumulador = crearAcumuladorComercial();
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const filtros =
      perfil?.rol === "superadmin"
        ? []
        : [where("clienteId", "==", perfil.clienteId)];
    const consulta = query(
      collection(db, "ventas"),
      ...filtros,
      ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
      limit(pageSize)
    );
    const snapshot = await getDocs(consulta);

    const paginas = await Promise.all(
      snapshot.docs.map(async (ventaDoc) => {
        const venta = { firebaseId: ventaDoc.id, ...ventaDoc.data() };
        const debeLeerItems =
          (venta.estadoVenta || "activa") !== "anulada" &&
          fechaISOEnRango(venta.fechaVenta, fechaDesde, fechaHasta);
        const [itemsSnap, pagosSnap] = await Promise.all([
          debeLeerItems
            ? getDocs(collection(db, "ventas", ventaDoc.id, "items"))
            : Promise.resolve({ docs: [] }),
          getDocs(collection(db, "ventas", ventaDoc.id, "pagos")),
        ]);
        const perteneceAlTenant =
          perfil?.rol === "superadmin" ||
          venta.clienteId === perfil.clienteId;

        if (!perteneceAlTenant) {
          acumulador.fuentesInvalidas += 1;
          return null;
        }

        let items = itemsSnap.docs
          .map((doc) => ({ firebaseId: doc.id, ...doc.data() }))
          .filter(
            (item) =>
              !item.clienteId || item.clienteId === venta.clienteId
          );
        if (!items.length && Array.isArray(venta.items)) {
          items = venta.items;
        }
        if (
          !items.length &&
          venta.descripcion &&
          Number(venta.cantidad || 0) > 0
        ) {
          items = [{
            descripcion: venta.descripcion,
            cantidad: venta.cantidad,
            precioUnitario: venta.precioUnitario,
            subtotal:
              Number(venta.subtotal) ||
              Number(venta.cantidad || 0) *
                Number(venta.precioUnitario || 0),
          }];
        }

        let pagos = pagosSnap.docs
          .map((doc) => ({ firebaseId: doc.id, ...doc.data() }))
          .filter(
            (pago) =>
              !pago.clienteId || pago.clienteId === venta.clienteId
          );
        if (!pagos.length && Array.isArray(venta.pagos)) {
          pagos = venta.pagos;
        }

        return {
          venta,
          items,
          pagos,
        };
      })
    );

    paginas.forEach((pagina) => {
      if (!pagina) return;
      acumularVentaComercial({
        acumulador,
        ...pagina,
        fechaDesde,
        fechaHasta,
      });
    });

    ultimoDoc = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;
    hayMas = snapshot.docs.length === pageSize && Boolean(ultimoDoc);
  }

  return finalizarInformeComercial(acumulador);
}
