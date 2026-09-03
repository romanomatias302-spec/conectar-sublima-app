const mockGetDocs = jest.fn();
const mockWhere = jest.fn((...args) => ({ tipo: "where", args }));
const mockQuery = jest.fn((...args) => ({ tipo: "query", args }));
const mockCollection = jest.fn((...args) => ({ tipo: "collection", args }));
const mockOrderBy = jest.fn((...args) => ({ tipo: "orderBy", args }));
const mockLimit = jest.fn((...args) => ({ tipo: "limit", args }));
const mockStartAfter = jest.fn((...args) => ({ tipo: "startAfter", args }));
const mockStartAt = jest.fn((...args) => ({ tipo: "startAt", args }));
const mockEndAt = jest.fn((...args) => ({ tipo: "endAt", args }));

jest.mock("../firebase", () => ({ db: {}, storage: {} }));
jest.mock("firebase/firestore", () => ({
  addDoc: jest.fn(),
  collection: mockCollection,
  doc: jest.fn(),
  endAt: mockEndAt,
  getDoc: jest.fn(),
  getDocs: mockGetDocs,
  increment: jest.fn(),
  limit: mockLimit,
  onSnapshot: jest.fn(),
  orderBy: mockOrderBy,
  query: mockQuery,
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
  startAfter: mockStartAfter,
  startAt: mockStartAt,
  updateDoc: jest.fn(),
  where: mockWhere,
  writeBatch: jest.fn(),
}));
jest.mock("firebase/storage", () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
}));

const { obtenerGastosPaginados } = require("./gastos");
const {
  buscarPedidosGlobales,
  obtenerPedidosFiltradosPaginados,
} = require("./pedidos");
const {
  buscarCotizacionesEnFirestore,
  obtenerCotizacionesPaginadas,
} = require("./cotizaciones");
const {
  obtenerHistorialCajas,
  obtenerUltimaCajaCerradaAnterior,
} = require("./cajas");

function documento(id, data) {
  return { id, data: () => data };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("gastos encuentra coincidencias históricas fuera de la primera página", async () => {
  mockGetDocs
    .mockResolvedValueOnce({
      docs: Array.from({ length: 100 }, (_, index) =>
        documento(`g-${index}`, { clienteId: "tenant-a", descripcion: "otro" })
      ),
    })
    .mockResolvedValueOnce({
      docs: [
        documento("historico", {
          clienteId: "tenant-a",
          descripcion: "Proveedor histórico",
        }),
      ],
    });

  const resultado = await obtenerGastosPaginados({
    perfil: { clienteId: "tenant-a" },
    pageSize: 10,
    textoBusqueda: "histórico",
  });

  expect(resultado.gastos.map((item) => item.firebaseId)).toEqual(["historico"]);
  expect(mockGetDocs).toHaveBeenCalledTimes(2);
});

test("pedidos escanea páginas hasta encontrar los filtros estructurales", async () => {
  mockGetDocs
    .mockResolvedValueOnce({
      docs: Array.from({ length: 100 }, (_, index) =>
        documento(`p-${index}`, { clienteId: "tenant-a", estado: "Pendiente" })
      ),
    })
    .mockResolvedValueOnce({
      docs: [documento("pedido-viejo", { clienteId: "tenant-a", estado: "Terminado" })],
    });

  const resultado = await obtenerPedidosFiltradosPaginados({
    perfil: { clienteId: "tenant-a" },
    pageSize: 10,
    coincide: (pedido) => pedido.estado === "Terminado",
  });

  expect(resultado.pedidos.map((item) => item.firebaseId)).toEqual(["pedido-viejo"]);
  expect(mockWhere).toHaveBeenCalledWith("clienteId", "==", "tenant-a");
});

test("la búsqueda remota de pedidos recupera un pedido histórico", async () => {
  mockGetDocs.mockResolvedValue({
    docs: [documento("pedido-historico", { clienteId: "tenant-a", id: "1" })],
  });

  const resultado = await buscarPedidosGlobales({
    perfil: { clienteId: "tenant-a" },
    texto: "1",
  });

  expect(resultado).toHaveLength(1);
  expect(resultado[0].firebaseId).toBe("pedido-historico");
  expect(mockWhere).toHaveBeenCalledWith("clienteId", "==", "tenant-a");
});

test("cotizaciones aplica el período sobre todas las páginas", async () => {
  mockGetDocs
    .mockResolvedValueOnce({
      docs: Array.from({ length: 100 }, (_, index) =>
        documento(`c-${index}`, { fechaCotizacion: "2026-08-01" })
      ),
    })
    .mockResolvedValueOnce({
      docs: [documento("cotizacion-vieja", { fechaCotizacion: "2026-07-15" })],
    });

  const resultado = await obtenerCotizacionesPaginadas({
    perfil: { clienteId: "tenant-a" },
    pageSize: 10,
    fechaDesde: "2026-07-01",
    fechaHasta: "2026-07-31",
  });

  expect(resultado.cotizaciones.map((item) => item.firebaseId)).toEqual([
    "cotizacion-vieja",
  ]);
});

test("la búsqueda remota de cotizaciones no depende de matches locales", async () => {
  mockGetDocs.mockResolvedValue({
    docs: [
      documento("cotizacion-historica", {
        clienteId: "tenant-a",
        clienteNombre: "Juan",
      }),
    ],
  });

  const resultado = await buscarCotizacionesEnFirestore({
    perfil: { clienteId: "tenant-a" },
    texto: "juan",
  });

  expect(resultado).toHaveLength(1);
  expect(resultado[0].firebaseId).toBe("cotizacion-historica");
});

test("caja anterior continúa hasta encontrar el cierre realmente anterior", async () => {
  mockGetDocs
    .mockResolvedValueOnce({
      docs: Array.from({ length: 60 }, (_, index) =>
        documento(`abierta-${index}`, { fechaCaja: "2026-09-02", estado: "abierta" })
      ),
    })
    .mockResolvedValueOnce({
      docs: [documento("cerrada", { fechaCaja: "2026-08-30", estado: "cerrada" })],
    });

  const resultado = await obtenerUltimaCajaCerradaAnterior({
    perfil: { clienteId: "tenant-a" },
    fechaCaja: "2026-09-03",
  });

  expect(resultado.firebaseId).toBe("cerrada");
  expect(mockOrderBy).toHaveBeenCalledWith("fechaCaja", "desc");
  expect(mockStartAfter).toHaveBeenCalled();
});

test("historial sigue paginando hasta completar el límite de la sucursal", async () => {
  mockGetDocs
    .mockResolvedValueOnce({
      docs: Array.from({ length: 30 }, (_, index) =>
        documento(`otra-${index}`, { fechaCaja: "2026-09-02", sucursalId: "otra" })
      ),
    })
    .mockResolvedValueOnce({
      docs: [
        documento("principal-1", { fechaCaja: "2026-09-01", sucursalId: "principal" }),
        documento("principal-2", { fechaCaja: "2026-08-31", sucursalId: "principal" }),
      ],
    });

  const resultado = await obtenerHistorialCajas({
    perfil: { clienteId: "tenant-a" },
    limite: 2,
    sucursal: { firebaseId: "principal", esPrincipal: true },
  });

  expect(resultado.map((item) => item.firebaseId)).toEqual([
    "principal-1",
    "principal-2",
  ]);
  expect(mockGetDocs).toHaveBeenCalledTimes(2);
});
