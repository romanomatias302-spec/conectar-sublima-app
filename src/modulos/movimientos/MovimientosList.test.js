jest.mock("../../firebase/movimientos", () => ({}));
jest.mock("../../firebase/auditoriaMovimientos", () => ({}));
jest.mock("../../firebase/informesProduccion", () => ({}));
jest.mock("../../firebase/informesFinancieros", () => ({}));
jest.mock("../../firebase/ventas", () => ({}));
jest.mock("../../firebase/gastos", () => ({}));
jest.mock("../ventas/VentaDetalle", () => () => null);
jest.mock("./GastoDetalleInforme", () => () => null);
jest.mock("./SaldoPendienteModal", () => () => null);
jest.mock("./InformeComercial", () => () => null);
jest.mock("../../utils/fechas", () => ({
  fechaHoyNegocio: () => "2026-09-02",
}));
jest.mock("xlsx", () => ({}));

const {
  crearControlSolicitudes,
  resolverDetalleRealMovimiento,
} = require("./MovimientosList");

test("una respuesta vieja no puede reemplazar los KPIs del filtro más nuevo", () => {
  const control = crearControlSolicitudes();
  const respuestaAplicada = [];
  const solicitudAnterior = control.iniciar();
  const solicitudNueva = control.iniciar();

  if (control.esActual(solicitudNueva)) respuestaAplicada.push("nueva");
  if (control.esActual(solicitudAnterior)) respuestaAplicada.push("anterior");

  expect(respuestaAplicada).toEqual(["nueva"]);
});

test("un movimiento de venta resuelve el detalle real", async () => {
  const movimiento = { origen: "venta", origenRefId: "venta-1" };
  const resultado = await resolverDetalleRealMovimiento({
    movimiento,
    perfil: { clienteId: "tenant-a" },
    cargarVenta: async () => ({ firebaseId: "venta-1", clienteId: "tenant-a" }),
  });

  expect(resultado).toMatchObject({ tipo: "venta", id: "venta-1" });
});

test("un movimiento de gasto resuelve el detalle real", async () => {
  const movimiento = { origen: "gasto", origenRefId: "gasto-1" };
  const resultado = await resolverDetalleRealMovimiento({
    movimiento,
    perfil: { clienteId: "tenant-a" },
    cargarGasto: async () => ({ firebaseId: "gasto-1", clienteId: "tenant-a" }),
  });

  expect(resultado).toMatchObject({ tipo: "gasto", id: "gasto-1" });
});

test("una asociación faltante rechaza de forma controlada para activar el fallback", async () => {
  await expect(
    resolverDetalleRealMovimiento({
      movimiento: { origen: "venta", origenRefId: "inexistente" },
      perfil: { clienteId: "tenant-a" },
      cargarVenta: async () => {
        throw new Error("La venta no existe.");
      },
    })
  ).rejects.toThrow("La venta no existe");
});
