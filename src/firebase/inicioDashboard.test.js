let mockVentas = [];
let mockPagos = {};
const mockGetCountFromServer = jest.fn();
const mockGetDocs = jest.fn();

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => {
  const restriccion = (tipo, valores) => ({ tipo, valores });
  const crearDocs = (datos) => datos.map((item) => ({
    id: item.id,
    data: () => item.data,
  }));
  return {
    collection: (_db, ...partes) => ({ path: partes.join("/") }),
    collectionGroup: (_db, nombre) => ({ path: `collectionGroup/${nombre}`, collectionGroup: true }),
    where: (...valores) => restriccion("where", valores),
    orderBy: (...valores) => restriccion("orderBy", valores),
    limit: (cantidad) => restriccion("limit", [cantidad]),
    startAfter: (doc) => restriccion("startAfter", [doc]),
    query: (ref, ...restricciones) => ({ ref, restricciones }),
    getCountFromServer: (...args) => mockGetCountFromServer(...args),
    getDocs: async (entrada) => {
      mockGetDocs(entrada);
      const ref = entrada.ref || entrada;
      if (ref.collectionGroup) {
        let datos = Object.values(mockPagos).flat();
        entrada.restricciones
          .filter((r) => r.tipo === "where")
          .forEach(({ valores: [campo, operador, valor] }) => {
            if (operador === "==") datos = datos.filter((item) => item.data[campo] === valor);
            if (operador === ">=") datos = datos.filter((item) => item.data[campo] >= valor);
            if (operador === "<") datos = datos.filter((item) => item.data[campo] < valor);
          });
        const cursor = entrada.restricciones.find((r) => r.tipo === "startAfter")?.valores[0];
        const inicio = cursor ? datos.findIndex((item) => item.id === cursor.id) + 1 : 0;
        const cantidad = entrada.restricciones.find((r) => r.tipo === "limit")?.valores[0] ?? datos.length;
        return { docs: crearDocs(datos.slice(inicio, inicio + cantidad)) };
      }
      if (ref.path !== "ventas") {
        const ventaId = ref.path.split("/")[1];
        return { docs: crearDocs(mockPagos[ventaId] || []) };
      }
      let datos = [...mockVentas];
      entrada.restricciones
        .filter((r) => r.tipo === "where")
        .forEach(({ valores: [campo, operador, valor] }) => {
          if (operador === "==") datos = datos.filter((item) => item.data[campo] === valor);
          if (operador === ">=") datos = datos.filter((item) => item.data[campo] >= valor);
          if (operador === "<") datos = datos.filter((item) => item.data[campo] < valor);
        });
      const cursor = entrada.restricciones.find((r) => r.tipo === "startAfter")?.valores[0];
      const inicio = cursor ? datos.findIndex((item) => item.id === cursor.id) + 1 : 0;
      const cantidad = entrada.restricciones.find((r) => r.tipo === "limit")?.valores[0] ?? datos.length;
      return { docs: crearDocs(datos.slice(inicio, inicio + cantidad)) };
    },
  };
});

const {
  acumularVentaYCobrosInicio,
  obtenerCantidadPedidosPeriodo,
  obtenerResumenVentasCobros,
  obtenerTotalCobradoCollectionGroupPreparado,
  obtenerTotalVentasPeriodo,
  pedidoCuentaComoAtrasado,
} = require("./inicioDashboard");

beforeEach(() => {
  mockVentas = [];
  mockPagos = {};
  mockGetCountFromServer.mockReset();
  mockGetDocs.mockReset();
  mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
});

test("Pedidos consulta exclusivamente el tenant y el rango seleccionado", async () => {
  mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) });
  const cantidad = await obtenerCantidadPedidosPeriodo({
    perfil: { clienteId: "tenant-a" },
    fechaDesde: "2026-09-03",
    fechaHasta: "2026-09-03",
  });
  expect(cantidad).toBe(3);
  const consulta = mockGetCountFromServer.mock.calls[0][0];
  expect(consulta.restricciones.map((r) => r.valores)).toEqual([
    ["clienteId", "==", "tenant-a"],
    ["fechaPedido", ">=", "2026-09-03"],
    ["fechaPedido", "<=", "2026-09-03"],
  ]);
});

test("separa total vendido de cobros recibidos en el período", () => {
  const resumen = { ventas: 0, cobrado: 0 };
  acumularVentaYCobrosInicio({
    resumen,
    venta: { fechaVenta: "2026-08-20", total: 100000 },
    pagos: [{ fechaPago: "2026-09-03", monto: 40000 }],
    fechaDesde: "2026-09-03",
    fechaHasta: "2026-09-03",
  });
  acumularVentaYCobrosInicio({
    resumen,
    venta: { fechaVenta: "2026-09-03", total: 100000 },
    pagos: [
      { fechaPago: "2026-09-03", monto: 20000 },
      { fechaPago: "2026-09-03", monto: 5000, estadoPagoRegistro: "anulado" },
    ],
    fechaDesde: "2026-09-03",
    fechaHasta: "2026-09-03",
  });
  expect(resumen).toEqual({ ventas: 100000, cobrado: 60000 });
});

test("una venta anulada no suma a Ventas y un pago anulado no suma a Cobrado", () => {
  const resumen = { ventas: 0, cobrado: 0 };
  acumularVentaYCobrosInicio({
    resumen,
    venta: { fechaVenta: "2026-09-03", total: 500, estadoVenta: "anulada" },
    pagos: [{ fechaPago: "2026-09-03", monto: 100, anulado: true }],
    fechaDesde: "2026-09-03",
    fechaHasta: "2026-09-03",
  });
  expect(resumen).toEqual({ ventas: 0, cobrado: 0 });
});

test("atrasados es estado actual, incluye pedidos antiguos y excluye finalizados/cancelados", () => {
  expect(pedidoCuentaComoAtrasado({ fechaEntrega: "2026-01-01" }, "2026-09-03")).toBe(true);
  expect(pedidoCuentaComoAtrasado({
    fechaEntrega: "2026-01-01", produccionFinalizada: true,
  }, "2026-09-03")).toBe(false);
  expect(pedidoCuentaComoAtrasado({
    fechaEntrega: "2026-01-01", estado: "Cancelado",
  }, "2026-09-03")).toBe(false);
});

test("el resumen usa collectionGroup para Cobrado y mantiene aislamiento por clienteId", async () => {
  mockVentas = [
    { id: "a-1", data: { clienteId: "tenant-a", fechaVenta: "2026-09-03", total: 10 } },
    { id: "b-1", data: { clienteId: "tenant-b", fechaVenta: "2026-09-03", total: 999 } },
    { id: "a-2", data: { clienteId: "tenant-a", fechaVenta: "2026-09-03", total: 20 } },
  ];
  mockPagos = {
    "a-1": [{ id: "p1", data: { clienteId: "tenant-a", estadoPagoRegistro: "activo", fechaPago: "2026-09-03", monto: 4 } }],
    "a-2": [{ id: "p2", data: { clienteId: "tenant-a", estadoPagoRegistro: "activo", fechaPago: "2026-09-03", monto: 6 } }],
  };
  const resumen = await obtenerResumenVentasCobros({
    perfil: { clienteId: "tenant-a" },
    fechaDesde: "2026-09-03",
    fechaHasta: "2026-09-03",
    pageSize: 1,
  });
  expect(resumen).toEqual({ ventas: 30, cobrado: 10 });
  expect(
    mockGetDocs.mock.calls.some(
      ([entrada]) => (entrada.ref || entrada).collectionGroup === true
    )
  ).toBe(true);
  expect(
    mockGetDocs.mock.calls.some(
      ([entrada]) => {
        const ref = entrada.ref || entrada;
        return ref.collectionGroup !== true && ref.path?.includes("/pagos");
      }
    )
  ).toBe(false);
});

test("Ventas usa tenant, rango exclusivo y paginación sin leer pagos", async () => {
  mockVentas = [
    { id: "antes", data: { clienteId: "tenant-a", fechaVenta: "2026-09-01", total: 999 } },
    { id: "a-1", data: { clienteId: "tenant-a", fechaVenta: "2026-09-02", total: 10 } },
    { id: "a-2", data: { clienteId: "tenant-a", fechaVenta: "2026-09-03", total: 20 } },
    { id: "anulada", data: { clienteId: "tenant-a", fechaVenta: "2026-09-03", total: 50, estadoVenta: "anulada" } },
    { id: "b-1", data: { clienteId: "tenant-b", fechaVenta: "2026-09-03", total: 1000 } },
    { id: "despues", data: { clienteId: "tenant-a", fechaVenta: "2026-09-04", total: 999 } },
  ];
  const total = await obtenerTotalVentasPeriodo({
    perfil: { clienteId: "tenant-a" },
    fechaDesde: "2026-09-02",
    fechaHasta: "2026-09-03",
    pageSize: 2,
  });
  expect(total).toBe(30);
  const primeraConsulta = mockGetDocs.mock.calls[0][0];
  expect(primeraConsulta.restricciones.map((r) => r.valores)).toEqual([
    ["clienteId", "==", "tenant-a"],
    ["fechaVenta", ">=", "2026-09-02"],
    ["fechaVenta", "<", "2026-09-04"],
    ["fechaVenta", "asc"],
    [2],
  ]);
  expect(mockGetDocs.mock.calls.every(([entrada]) => (entrada.ref || entrada).path === "ventas")).toBe(true);
});

test("Collection Group preparado filtra tenant, activo y rango, y pagina sin duplicados", async () => {
  mockPagos = {
    "v-1": [
      { id: "a-antes", data: { clienteId: "tenant-a", estadoPagoRegistro: "activo", fechaPago: "2026-09-01", monto: 999 } },
      { id: "a-1", data: { clienteId: "tenant-a", estadoPagoRegistro: "activo", fechaPago: "2026-09-02", monto: 10 } },
      { id: "a-2", data: { clienteId: "tenant-a", estadoPagoRegistro: "activo", fechaPago: "2026-09-03", monto: 20 } },
    ],
    "v-2": [
      { id: "a-anulado", data: { clienteId: "tenant-a", estadoPagoRegistro: "anulado", fechaPago: "2026-09-03", monto: 50 } },
      { id: "b-1", data: { clienteId: "tenant-b", estadoPagoRegistro: "activo", fechaPago: "2026-09-03", monto: 1000 } },
      { id: "a-despues", data: { clienteId: "tenant-a", estadoPagoRegistro: "activo", fechaPago: "2026-09-04", monto: 999 } },
    ],
  };
  const total = await obtenerTotalCobradoCollectionGroupPreparado({
    perfil: { clienteId: "tenant-a" }, fechaDesde: "2026-09-02", fechaHasta: "2026-09-03", pageSize: 1,
  });
  expect(total).toBe(30);
  const consulta = mockGetDocs.mock.calls[0][0];
  expect(consulta.ref.collectionGroup).toBe(true);
  expect(consulta.restricciones.map((r) => r.valores)).toEqual([
    ["clienteId", "==", "tenant-a"],
    ["estadoPagoRegistro", "==", "activo"],
    ["fechaPago", ">=", "2026-09-02"],
    ["fechaPago", "<", "2026-09-04"],
    ["fechaPago", "asc"],
    [1],
  ]);
});
