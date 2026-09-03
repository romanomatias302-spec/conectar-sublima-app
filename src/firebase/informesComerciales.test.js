jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({}));

const {
  acumularVentaComercial,
  crearAcumuladorComercial,
  fechaISOEnRango,
  finalizarInformeComercial,
} = require("./informesComerciales");

function procesar(acumulador, venta, items = [], pagos = []) {
  return acumularVentaComercial({
    acumulador,
    venta,
    items,
    pagos,
    fechaDesde: "2026-09-01",
    fechaHasta: "2026-09-30",
  });
}

test("un producto presente en múltiples ventas suma cantidad e importe neto", () => {
  const acumulador = crearAcumuladorComercial();
  const item = {
    productoBaseId: "producto-1",
    productoListaNombre: "Remera",
    varianteId: "azul",
    varianteNombre: "Azul",
    cantidad: 2,
    precioUnitario: 100,
    subtotal: 200,
  };

  procesar(acumulador, {
    clienteId: "tenant-a",
    clienteRefId: "cliente-1",
    clienteNombre: "Cliente",
    fechaVenta: "2026-09-02",
    total: 180,
  }, [item]);
  procesar(acumulador, {
    clienteId: "tenant-a",
    clienteRefId: "cliente-1",
    clienteNombre: "Cliente",
    fechaVenta: "2026-09-03",
    total: 90,
  }, [{ ...item, cantidad: 1, subtotal: 100 }]);

  const informe = finalizarInformeComercial(acumulador);
  expect(informe.productos[0]).toMatchObject({
    cantidadVendida: 3,
    cantidadVentas: 2,
    importeTotal: 270,
  });
  expect(informe.resumen.importeTotalVendido).toBe(270);
});

test("ventas anuladas no suman productos ni facturación", () => {
  const acumulador = crearAcumuladorComercial();
  procesar(acumulador, {
    clienteId: "tenant-a",
    fechaVenta: "2026-09-02",
    estadoVenta: "anulada",
    total: 500,
  }, [{ descripcion: "Producto", cantidad: 1, precioUnitario: 500 }]);

  expect(finalizarInformeComercial(acumulador).resumen).toMatchObject({
    ventasCantidad: 0,
    pedidosCantidad: 0,
    importeTotalVendido: 0,
    unidadesVendidas: 0,
  });
});

test("cuenta pedidos únicos asociados a ventas activas del período", () => {
  const acumulador = crearAcumuladorComercial();
  const ventaBase = {
    clienteId: "tenant-a",
    fechaVenta: "2026-09-02",
    total: 10,
    origenVenta: "pedido",
  };
  procesar(acumulador, { ...ventaBase, firebaseId: "venta-1", pedidoRefId: "pedido-1" });
  procesar(acumulador, { ...ventaBase, firebaseId: "venta-2", pedidoRefId: "pedido-1" });
  procesar(acumulador, { ...ventaBase, firebaseId: "venta-3", pedidoVisibleId: "2" });
  procesar(acumulador, { ...ventaBase, firebaseId: "venta-4", estadoVenta: "anulada" });
  procesar(acumulador, {
    ...ventaBase,
    firebaseId: "venta-5",
    fechaVenta: "2026-10-01",
    pedidoRefId: "pedido-3",
  });

  expect(finalizarInformeComercial(acumulador).resumen.pedidosCantidad).toBe(2);
});

test("datos legacy sin productoId se agrupan por nombre y variante normalizados", () => {
  const acumulador = crearAcumuladorComercial();
  const venta = {
    clienteId: "tenant-a",
    fechaVenta: "2026-09-04",
    total: 30,
  };
  procesar(acumulador, venta, [
    { descripcion: "Sticker", varianteNombre: "Mate", cantidad: 1, subtotal: 10 },
    { descripcion: " sticker ", varianteNombre: "MATE", cantidad: 2, subtotal: 20 },
  ]);

  const informe = finalizarInformeComercial(acumulador);
  expect(informe.productos).toHaveLength(1);
  expect(informe.productos[0]).toMatchObject({
    legacy: true,
    cantidadVendida: 3,
    importeTotal: 30,
  });
});

test("ranking procesa múltiples bloques y separa vendido de cobrado", () => {
  const acumulador = crearAcumuladorComercial();
  const bloques = [
    { total: 100, fecha: "2026-09-02", pago: 40 },
    { total: 200, fecha: "2026-09-03", pago: 70 },
    { total: 50, fecha: "2026-09-04", pago: 10 },
  ];

  bloques.forEach((bloque) => procesar(acumulador, {
    clienteId: "tenant-a",
    clienteRefId: "cliente-1",
    clienteNombre: "Cliente",
    fechaVenta: bloque.fecha,
    total: bloque.total,
  }, [{ descripcion: "Producto", cantidad: 1, subtotal: bloque.total }], [{
    fechaPago: bloque.fecha,
    monto: bloque.pago,
  }]));

  const informe = finalizarInformeComercial(acumulador);
  expect(informe.clientesVentas[0]).toMatchObject({
    cantidadVentas: 3,
    totalVendido: 350,
  });
  expect(informe.clientesIngresos[0]).toMatchObject({
    cantidadCobros: 3,
    ingresosRecibidos: 120,
  });
});

test("el período usa fechas ISO sin conversión de zona horaria", () => {
  expect(fechaISOEnRango("2026-09-01", "2026-09-01", "2026-09-30")).toBe(true);
  expect(fechaISOEnRango("2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
  expect(fechaISOEnRango("fecha inválida", "2026-09-01", "2026-09-30")).toBe(false);
});

test("tenants distintos no se mezclan aunque reutilicen IDs", () => {
  const acumulador = crearAcumuladorComercial();
  ["tenant-a", "tenant-b"].forEach((clienteId) => procesar(acumulador, {
    clienteId,
    clienteRefId: "cliente-1",
    clienteNombre: "Cliente",
    fechaVenta: "2026-09-02",
    total: 10,
  }, [{ productoBaseId: "producto-1", descripcion: "Producto", cantidad: 1, subtotal: 10 }]));

  const informe = finalizarInformeComercial(acumulador);
  expect(informe.clientesVentas).toHaveLength(2);
  expect(informe.productos).toHaveLength(2);
});

test("cero resultados y números legacy faltantes no generan NaN", () => {
  const vacio = finalizarInformeComercial(crearAcumuladorComercial());
  expect(vacio.productos).toEqual([]);

  const acumulador = crearAcumuladorComercial();
  procesar(acumulador, {
    clienteId: "tenant-a",
    fechaVenta: "2026-09-02",
  }, [{ descripcion: "Legacy", cantidad: undefined, subtotal: undefined }]);
  const informe = finalizarInformeComercial(acumulador);
  expect(Number.isNaN(informe.resumen.importeTotalVendido)).toBe(false);
  expect(Number.isNaN(informe.productos[0].importeTotal)).toBe(false);
});
