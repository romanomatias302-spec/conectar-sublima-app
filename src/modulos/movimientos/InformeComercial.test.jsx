import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import InformeComercial from "./InformeComercial";
import { obtenerInformeComercialCompleto } from "../../firebase/informesComerciales";

jest.mock("../../firebase/informesComerciales", () => ({
  obtenerInformeComercialCompleto: jest.fn(),
}));

function informe({ total = 0, clientes = [], productos = [] } = {}) {
  return {
    resumen: {
      ventasCantidad: clientes.length,
      pedidosCantidad: 2,
      importeTotalVendido: total,
      unidadesVendidas: productos.length,
      productosDistintos: productos.length,
      pagosCantidad: 0,
      ingresosRecibidos: 0,
      ventasSinItems: 0,
      fuentesInvalidas: 0,
    },
    productos,
    clientesVentas: clientes,
    clientesIngresos: [],
  };
}

function diferida() {
  let resolver;
  const promesa = new Promise((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

beforeEach(() => {
  obtenerInformeComercialCompleto.mockReset();
});

test("una respuesta vieja no pisa el informe de un período nuevo", async () => {
  const anterior = diferida();
  const nueva = diferida();
  obtenerInformeComercialCompleto
    .mockReturnValueOnce(anterior.promesa)
    .mockReturnValueOnce(nueva.promesa);

  const { rerender } = render(
    <InformeComercial
      perfil={{ clienteId: "tenant-a" }}
      fechaDesde="2026-09-01"
      fechaHasta="2026-09-10"
    />
  );
  rerender(
    <InformeComercial
      perfil={{ clienteId: "tenant-a" }}
      fechaDesde="2026-09-11"
      fechaHasta="2026-09-20"
    />
  );

  await act(async () => {
    nueva.resolver(informe({
      total: 20,
      clientes: [{
        clave: "nuevo",
        clienteNombre: "Cliente nuevo",
        cantidadVentas: 1,
        totalVendido: 20,
      }],
    }));
  });
  expect(screen.getByText("Cliente nuevo")).toBeTruthy();

  await act(async () => {
    anterior.resolver(informe({
      total: 10,
      clientes: [{
        clave: "anterior",
        clienteNombre: "Cliente anterior",
        cantidadVentas: 1,
        totalVendido: 10,
      }],
    }));
  });
  expect(screen.queryByText("Cliente anterior")).toBeNull();
  expect(screen.getByText("Cliente nuevo")).toBeTruthy();
});

test("cambiar la página visual no altera las métricas completas", async () => {
  const productos = Array.from({ length: 30 }, (_, index) => ({
    clave: `producto-${index}`,
    productoNombre: `Producto ${index}`,
    varianteNombre: "",
    cantidadVendida: 1,
    cantidadVentas: 1,
    importeTotal: 10,
    legacy: false,
  }));
  obtenerInformeComercialCompleto.mockResolvedValue(
    informe({ total: 1000, productos })
  );

  render(
    <InformeComercial
      perfil={{ clienteId: "tenant-a" }}
      fechaDesde="2026-09-01"
      fechaHasta="2026-09-30"
    />
  );

  expect(await screen.findByText("Producto 0")).toBeTruthy();
  const totalAntes = screen.getByText("$ 1.000");
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

  expect(screen.getByText("Página 2 de 2")).toBeTruthy();
  expect(screen.getByText("$ 1.000")).toBe(totalAntes);
});

test("un perfil equivalente no vuelve a consultar el informe", async () => {
  obtenerInformeComercialCompleto.mockResolvedValue(informe());
  const { rerender } = render(
    <InformeComercial
      perfil={{ clienteId: "tenant-a", rol: "admin" }}
      fechaDesde="2026-09-01"
      fechaHasta="2026-09-30"
    />
  );

  expect(await screen.findByText("Cantidad de pedidos")).toBeTruthy();
  rerender(
    <InformeComercial
      perfil={{ clienteId: "tenant-a", rol: "admin" }}
      fechaDesde="2026-09-01"
      fechaHasta="2026-09-30"
    />
  );

  expect(obtenerInformeComercialCompleto).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Productos distintos")).toBeNull();
  expect(screen.getByText("Cobros de ventas")).toBeTruthy();
});
