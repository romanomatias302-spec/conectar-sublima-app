let mockDatos = {};

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("./produccionColumnas", () => ({
  obtenerColumnasProduccion: jest.fn(async () => []),
}));
jest.mock("firebase/firestore", () => {
  const restriccion = (tipo, valores) => ({ tipo, valores });

  return {
    collection: (_db, path) => ({ path }),
    collectionGroup: (_db, path) => ({ path }),
    where: (...valores) => restriccion("where", valores),
    orderBy: (...valores) => restriccion("orderBy", valores),
    limit: (cantidad) => restriccion("limit", [cantidad]),
    startAfter: (doc) => restriccion("startAfter", [doc]),
    query: (ref, ...restricciones) => ({ ref, restricciones }),
    getDocs: async ({ ref, restricciones }) => {
      let datos = [...(mockDatos[ref.path] || [])];

      restricciones
        .filter((r) => r.tipo === "where")
        .forEach(({ valores: [campo, operador, valor] }) => {
          if (operador === "==") {
            datos = datos.filter((item) => item.data[campo] === valor);
          }
          if (operador === ">") {
            datos = datos.filter((item) => item.data[campo] > valor);
          }
        });

      const cursor = restricciones.find((r) => r.tipo === "startAfter")
        ?.valores[0];
      const inicio = cursor
        ? datos.findIndex((item) => item.id === cursor.id) + 1
        : 0;
      const cantidad =
        restricciones.find((r) => r.tipo === "limit")?.valores[0] ??
        datos.length;

      return {
        docs: datos.slice(inicio, inicio + cantidad).map((item) => ({
          id: item.id,
          data: () => item.data,
        })),
      };
    },
  };
});

const {
  acumularMovimientoEnResumen,
  crearResumenMovimientosVacio,
  obtenerMovimientosCompletos,
  obtenerMovimientosPaginados,
  obtenerResumenMovimientosCompleto,
} = require("./movimientos");
const {
  obtenerGastosPendientesProveedorPaginados,
  obtenerSaldosPendientesClientes,
  obtenerSaldosPendientesProveedores,
  obtenerVentasPendientesClientePaginadas,
} = require("./informesFinancieros");
const {
  obtenerMetricasHistorialProduccion,
} = require("./informesProduccion");

const perfilA = { clienteId: "tenant-a", rol: "admin" };

function documentos(cantidad, crearData, prefijo = "doc") {
  return Array.from({ length: cantidad }, (_, index) => ({
    id: `${prefijo}-${index}`,
    data: crearData(index),
  }));
}

beforeEach(() => {
  mockDatos = {};
});

test("250 movimientos paginados producen el mismo resumen que reducirlos juntos", async () => {
  const datos = documentos(250, (index) => ({
    clienteId: "tenant-a",
    fecha: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
    tipo: index % 2 ? "egreso" : "ingreso",
    monto: 10,
  }));
  mockDatos.movimientos = datos;

  const esperado = datos.reduce(
    (resumen, doc) => acumularMovimientoEnResumen(resumen, doc.data),
    crearResumenMovimientosVacio()
  );
  const obtenido = await obtenerResumenMovimientosCompleto({
    perfil: perfilA,
    pageSize: 100,
  });

  expect(obtenido).toEqual(esperado);
  expect(obtenido.cantidadMovimientos).toBe(250);
});

test("la tabla puede tener 100 filas y cargar otra página sin cambiar los KPIs completos", async () => {
  mockDatos.movimientos = documentos(250, () => ({
    clienteId: "tenant-a",
    fecha: "2026-09-01",
    tipo: "ingreso",
    monto: 1,
  }));

  const primera = await obtenerMovimientosPaginados({
    perfil: perfilA,
    pageSize: 100,
  });
  const kpisAntes = await obtenerResumenMovimientosCompleto({
    perfil: perfilA,
    pageSize: 100,
  });
  const segunda = await obtenerMovimientosPaginados({
    perfil: perfilA,
    ultimoDoc: primera.ultimoDoc,
    pageSize: 100,
  });
  const kpisDespues = await obtenerResumenMovimientosCompleto({
    perfil: perfilA,
    pageSize: 100,
  });

  expect(primera.movimientos).toHaveLength(100);
  expect(segunda.movimientos).toHaveLength(100);
  expect(kpisAntes.totalIngresos).toBe(250);
  expect(kpisDespues).toEqual(kpisAntes);
});

test("el resumen preserva anulados, impactaResultado y compatibilidad legacy", async () => {
  mockDatos.movimientos = [
    { id: "anulado", data: { clienteId: "tenant-a", tipo: "ingreso", monto: 50, anulado: true } },
    { id: "no-impacta", data: { clienteId: "tenant-a", tipo: "ingreso", monto: 40, impactaResultado: false } },
    { id: "legacy", data: { clienteId: "tenant-a", tipo: "ingreso", monto: "30" } },
    { id: "egreso", data: { clienteId: "tenant-a", tipo: "egreso", monto: 5 } },
  ];

  const resumen = await obtenerResumenMovimientosCompleto({
    perfil: perfilA,
    pageSize: 2,
  });

  expect(resumen.totalIngresos).toBe(30);
  expect(resumen.totalEgresos).toBe(5);
  expect(resumen.resultado).toBe(25);
  expect(resumen.cantidadMovimientos).toBe(2);
});

test("la exportación obtiene todas las páginas y aplica el mismo filtro de impacto", async () => {
  mockDatos.movimientos = [
    ...documentos(250, () => ({
      clienteId: "tenant-a",
      fecha: "2026-09-01",
      tipo: "ingreso",
      monto: 1,
    })),
    { id: "excluido", data: { clienteId: "tenant-a", tipo: "ingreso", monto: 1, estado: "anulado" } },
  ];

  const exportables = await obtenerMovimientosCompletos({
    perfil: perfilA,
    pageSize: 100,
  });

  expect(exportables).toHaveLength(250);
  expect(exportables.some((item) => item.firebaseId === "excluido")).toBe(false);
});

test("más de 200 ventas y gastos pendientes se computan completamente", async () => {
  mockDatos.ventas = documentos(205, () => ({
    clienteId: "tenant-a",
    estadoVenta: "activa",
    saldoPendiente: 2,
    clienteRefId: "cliente-1",
    clienteNombre: "Cliente",
  }), "venta");
  mockDatos.gastos = documentos(203, () => ({
    clienteId: "tenant-a",
    estado: "activo",
    saldo: 3,
    proveedorId: "proveedor-1",
    proveedorNombre: "Proveedor",
  }), "gasto");

  const [clientes, proveedores] = await Promise.all([
    obtenerSaldosPendientesClientes({ perfil: perfilA, pageSize: 200 }),
    obtenerSaldosPendientesProveedores({ perfil: perfilA, pageSize: 200 }),
  ]);

  expect(clientes[0]).toMatchObject({ cantidad: 205, totalPendiente: 410 });
  expect(proveedores[0]).toMatchObject({ cantidad: 203, totalPendiente: 609 });
});

test("el resumen completo de saldos convive con detalle lazy paginado", async () => {
  mockDatos.ventas = documentos(230, () => ({
    clienteId: "tenant-a",
    estadoVenta: "activa",
    saldoPendiente: 2,
    clienteRefId: "cliente-1",
    clienteNombre: "Cliente",
  }), "venta-lazy");
  mockDatos.gastos = documentos(225, () => ({
    clienteId: "tenant-a",
    estado: "activo",
    saldo: 3,
    proveedorId: "proveedor-1",
    proveedorNombre: "Proveedor",
  }), "gasto-lazy");

  const [resumenClientes, resumenProveedores, ventasPagina, gastosPagina] =
    await Promise.all([
      obtenerSaldosPendientesClientes({ perfil: perfilA, pageSize: 50 }),
      obtenerSaldosPendientesProveedores({ perfil: perfilA, pageSize: 50 }),
      obtenerVentasPendientesClientePaginadas({
        perfil: perfilA,
        clienteClave: "cliente-1",
        pageSize: 25,
        scanPageSize: 50,
      }),
      obtenerGastosPendientesProveedorPaginados({
        perfil: perfilA,
        proveedorClave: "proveedor-1",
        pageSize: 25,
        scanPageSize: 50,
      }),
    ]);

  expect(resumenClientes[0]).toMatchObject({ cantidad: 230, totalPendiente: 460 });
  expect(resumenProveedores[0]).toMatchObject({ cantidad: 225, totalPendiente: 675 });
  expect(ventasPagina.ventas).toHaveLength(25);
  expect(gastosPagina.gastos).toHaveLength(25);
  expect(ventasPagina.hayMas).toBe(true);
  expect(gastosPagina.hayMas).toBe(true);
});

test("el detalle lazy no pierde el remanente de una página Firestore corta", async () => {
  mockDatos.ventas = documentos(30, () => ({
    clienteId: "tenant-a",
    estadoVenta: "activa",
    saldoPendiente: 1,
    clienteRefId: "cliente-corto",
  }), "venta-corta");

  const primera = await obtenerVentasPendientesClientePaginadas({
    perfil: perfilA,
    clienteClave: "cliente-corto",
    pageSize: 25,
    scanPageSize: 50,
  });
  const segunda = await obtenerVentasPendientesClientePaginadas({
    perfil: perfilA,
    clienteClave: "cliente-corto",
    ultimoDoc: primera.ultimoDoc,
    pageSize: 25,
    scanPageSize: 50,
  });

  expect(primera.ventas).toHaveLength(25);
  expect(primera.hayMas).toBe(true);
  expect(segunda.ventas).toHaveLength(5);
  expect(segunda.hayMas).toBe(false);
});

test("más de 500 eventos de producción se computan completamente", async () => {
  mockDatos.historial_produccion = documentos(550, (index) => ({
    clienteId: "tenant-a",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    duracionEnOrigenMinutos: 2,
    pedidoFinalizado: index % 10 === 0,
    usuarioAsignadoUid: "usuario-1",
    usuarioAsignadoNombre: "Usuario",
    columnaOrigenNombre: "Diseño",
  }), "evento");

  const metricas = await obtenerMetricasHistorialProduccion({
    perfil: perfilA,
    pageSize: 500,
  });

  expect(metricas.totalMovimientos).toBe(550);
  expect(metricas.pedidosFinalizados).toBe(55);
  expect(metricas.promedioGeneralMinutos).toBe(2);
  expect(metricas.productividadKpi[0].intervenciones).toBe(550);
});

test("las consultas completas mantienen aislamiento por clienteId", async () => {
  mockDatos.movimientos = [
    ...documentos(3, () => ({ clienteId: "tenant-a", tipo: "ingreso", monto: 10 }), "a"),
    ...documentos(4, () => ({ clienteId: "tenant-b", tipo: "ingreso", monto: 100 }), "b"),
  ];
  mockDatos.ventas = [
    { id: "venta-a", data: { clienteId: "tenant-a", estadoVenta: "activa", saldoPendiente: 7, clienteRefId: "a" } },
    { id: "venta-b", data: { clienteId: "tenant-b", estadoVenta: "activa", saldoPendiente: 70, clienteRefId: "b" } },
  ];
  mockDatos.historial_produccion = [
    { id: "evento-a", data: { clienteId: "tenant-a", createdAt: new Date(), duracionEnOrigenMinutos: 3 } },
    { id: "evento-b", data: { clienteId: "tenant-b", createdAt: new Date(), duracionEnOrigenMinutos: 30 } },
  ];

  const [resumen, saldos, produccion] = await Promise.all([
    obtenerResumenMovimientosCompleto({ perfil: perfilA, pageSize: 2 }),
    obtenerSaldosPendientesClientes({ perfil: perfilA, pageSize: 1 }),
    obtenerMetricasHistorialProduccion({ perfil: perfilA, pageSize: 1 }),
  ]);

  expect(resumen.cantidadMovimientos).toBe(3);
  expect(resumen.totalIngresos).toBe(30);
  expect(saldos).toHaveLength(1);
  expect(saldos[0].totalPendiente).toBe(7);
  expect(produccion.totalMovimientos).toBe(1);
  expect(produccion.promedioGeneralMinutos).toBe(3);
});
