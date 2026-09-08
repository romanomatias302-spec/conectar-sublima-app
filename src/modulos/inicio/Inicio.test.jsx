import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Inicio from "./Inicio";

const mockPedidosPeriodo = jest.fn();
const mockGetDoc = jest.fn();
const mockResumenVentasCobros = jest.fn();
const mockSinIniciar = jest.fn();
const mockFinalizados = jest.fn();
const mockClientesNuevos = jest.fn();
const mockAtrasados = jest.fn();
const mockSerie = jest.fn();
const mockEstadoProduccion = jest.fn();

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({})),
  getDoc: (...args) => mockGetDoc(...args),
}));
jest.mock("../../utils/permisos", () => ({
  puedeHacer: () => true,
}));
jest.mock("../../utils/fechas", () => {
  const real = jest.requireActual("../../utils/fechas");
  return {
    ...real,
    fechaHoyNegocio: () => "2026-09-03",
  };
});
jest.mock("../../firebase/informesProduccion", () => ({
  obtenerEstadoActualProduccion: (...args) => mockEstadoProduccion(...args),
}));
jest.mock("../../firebase/inicioDashboard", () => ({
  obtenerCantidadPedidosPeriodo: (...args) => mockPedidosPeriodo(...args),
  obtenerResumenVentasCobros: (...args) => mockResumenVentasCobros(...args),
  obtenerCantidadSinIniciar: (...args) => mockSinIniciar(...args),
  obtenerCantidadFinalizadosPeriodo: (...args) => mockFinalizados(...args),
  obtenerCantidadClientesNuevosPeriodo: (...args) => mockClientesNuevos(...args),
  obtenerPedidosAtrasadosActuales: (...args) => mockAtrasados(...args),
  obtenerSeriePedidos: (...args) => mockSerie(...args),
}));

function diferida() {
  let resolver;
  const promise = new Promise((resolve) => { resolver = resolve; });
  return { promise, resolver };
}

const perfil = {
  clienteId: "tenant-a",
  rol: "admin",
  timezone: "America/Argentina/Buenos_Aires",
  moneda: "ARS",
  localeMoneda: "es-AR",
};

beforeEach(() => {
  mockPedidosPeriodo.mockReset();
  mockGetDoc.mockResolvedValue({ exists: () => false });
  mockResumenVentasCobros.mockResolvedValue({ ventas: 100, cobrado: 40 });
  mockSinIniciar.mockResolvedValue(2);
  mockFinalizados.mockResolvedValue(3);
  mockClientesNuevos.mockResolvedValue(4);
  mockAtrasados.mockResolvedValue({ cantidad: 1, pedidoMasAtrasado: null });
  mockEstadoProduccion.mockResolvedValue([]);
  mockSerie.mockImplementation(async ({ dias }) => dias);
});

test("una respuesta anterior no pisa el período seleccionado más recientemente", async () => {
  const primera = diferida();
  const segunda = diferida();
  mockPedidosPeriodo
    .mockReturnValueOnce(primera.promise)
    .mockReturnValueOnce(segunda.promise);

  render(<Inicio perfil={perfil} onNavigate={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Últimos 7 días" }));
  await waitFor(() => expect(mockPedidosPeriodo).toHaveBeenCalledTimes(2));

  await act(async () => { segunda.resolver(7); });
  const cardPedidos = screen.getByTestId("kpi-pedidos");
  expect(within(cardPedidos).getByText("7")).not.toBeNull();

  await act(async () => { primera.resolver(1); });
  expect(within(cardPedidos).getByText("7")).not.toBeNull();
  expect(within(cardPedidos).queryByText("1")).toBeNull();
});

test("el acceso Configuración entrega el módulo correcto al navegador de App", async () => {
  mockPedidosPeriodo.mockResolvedValue(0);
  const onNavigate = jest.fn();
  render(<Inicio perfil={perfil} onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
  expect(onNavigate).toHaveBeenCalledWith("configuracion");
  await waitFor(() =>
    expect(screen.getByTestId("inicio-kpis")).toHaveAttribute("aria-busy", "false")
  );
});

test("los importes monetarios muy largos reciben el ajuste visual progresivo", async () => {
  mockPedidosPeriodo.mockResolvedValue(0);
  mockResumenVentasCobros.mockResolvedValue({
    ventas: 150000000,
    cobrado: 25000000,
  });
  render(<Inicio perfil={perfil} onNavigate={jest.fn()} />);
  const importe = await screen.findByTitle(/150\.000\.000/);
  expect(importe).toHaveClass("inicio-kpi-valor-monetario", "muy-largo");
});
