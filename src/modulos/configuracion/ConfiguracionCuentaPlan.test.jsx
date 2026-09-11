import React from "react";
import "@testing-library/jest-dom";
import {fireEvent, render, screen} from "@testing-library/react";
import ConfiguracionCuentaPlan from "./ConfiguracionCuentaPlan";

const usage = {
  usedUsers: 3,
  activeBranches: 2,
  usersOverLimit: false,
  branchesOverLimit: false,
};

test("muestra el plan Legacy sin convertirlo y ofrece los cuatro planes actuales", () => {
  render(<ConfiguracionCuentaPlan account={{plan: "Mensual", planPrecio: 25, billingCurrency: "USD"}} usage={usage} />);

  expect(screen.getByText("Legacy")).toBeInTheDocument();
  expect(screen.getByText("Plan histórico compatible")).toBeInTheDocument();
  ["Start", "Profesional", "Profesional Plus", "Empresa"].forEach((name) => {
    expect(screen.getByRole("heading", {name})).toBeInTheDocument();
  });
  expect(screen.getAllByRole("button", {name: "Mejorar plan"})).toHaveLength(4);
});

test("informa el exceso sin ocultar ni eliminar recursos existentes", () => {
  render(<ConfiguracionCuentaPlan account={{planId: "start", billingCurrency: "USD"}} usage={{...usage, usersOverLimit: true}} />);

  expect(screen.getByText("3 de 2 usados")).toBeInTheDocument();
  expect(screen.getByText(/Conservás los recursos existentes/)).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Plan actual"})).toBeDisabled();
});

test("el cambio abre un paso informativo y no confirma cargos ni persistencia", () => {
  render(<ConfiguracionCuentaPlan account={{planId: "start", billingCurrency: "USD"}} usage={usage} />);

  fireEvent.click(screen.getAllByRole("button", {name: "Cambiar plan"})[0]);
  expect(screen.getByRole("dialog")).toHaveTextContent("Este paso no modifica tu plan ni genera cargos");
  expect(screen.getByText(/checkout se habilitarán cuando el circuito comercial/)).toBeInTheDocument();
});
