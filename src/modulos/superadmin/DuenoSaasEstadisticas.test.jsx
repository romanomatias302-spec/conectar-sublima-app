import React from "react";
import {render, screen, within} from "@testing-library/react";
import DuenoSaasEstadisticas from "./DuenoSaasEstadisticas";

test("trial histórico y moderno forman una sola fila de plan", () => {
  render(<DuenoSaasEstadisticas clientes={[{id: "a", planNombre: "Prueba"}, {id: "b", planId: "trial"}]} />);
  const row = screen.getByText("Prueba gratis 7 días").closest("tr");
  expect(within(row).getAllByRole("cell")[1].textContent).toBe("2");
});

test("estadísticas presentan cuenta corriente y planes por país sin los bloques retirados", () => {
  render(<DuenoSaasEstadisticas
    clientes={[{id: "a", pais: "Argentina", planId: "start", saldoCuentaCorriente: 30}]}
    movimientosSaas={[{id: "c", clienteSaasId: "a", tipoMovimiento: "cargo", monto: 30, billingCurrency: "USD"}]}
    formatearFecha={() => "—"} />);
  expect(screen.queryByText("MRR por moneda")).toBeNull();
  expect(screen.queryByText("Suspensión y recuperación")).toBeNull();
  expect(screen.queryByText("Cuenta corriente del período")).toBeNull();
  expect(screen.queryByText("Saldo pendiente actual")).toBeNull();
  expect(screen.getByText("Ingresos mensuales esperados")).toBeTruthy();
  expect(screen.getAllByText("TOTAL")).toHaveLength(2);
  expect(screen.getByText("Con deuda")).toBeTruthy();
  expect(screen.getByText("Últimos pagos recibidos")).toBeTruthy();
  expect(screen.getByText("Últimos usos de la aplicación")).toBeTruthy();
  expect(screen.queryByText("En gracia")).toBeNull();
});

test("bloques recientes muestran pago válido y uso de cliente en gracia", () => {
  render(<DuenoSaasEstadisticas clientes={[{id: "a", nombre: "Cuenta vigente", plan: "Mensual", estadoSuscripcion: "gracia"}]}
    movimientosSaas={[{id: "p", tipoMovimiento: "pago", clienteNombre: "Pago vigente", monto: 40, billingCurrency: "USD"},
      {id: "x", tipoMovimiento: "pago", clienteNombre: "Pago anulado", anulado: true}]}
    usoClientes={{a: {ultimoUso: "2026-09-15", pedidosUltimos30: 7}}} />);
  expect(screen.getByText("Pago vigente")).toBeTruthy();
  expect(screen.queryByText("Pago anulado")).toBeNull();
  expect(screen.getByText("Cuenta vigente")).toBeTruthy();
});
