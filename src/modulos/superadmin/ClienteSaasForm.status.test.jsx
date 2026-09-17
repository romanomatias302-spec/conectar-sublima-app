import React from "react";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import {updateDoc} from "firebase/firestore";
import ClienteSaasForm from "./ClienteSaasForm";
import {resolveSaasClientStatus} from "../../domain/saasPanel";

jest.mock("../../firebase", () => ({db: {}}));
jest.mock("../../firebase/invitacionesUsuarios", () => ({escucharInvitacionesPorCliente: jest.fn()}));
jest.mock("firebase/firestore", () => ({addDoc: jest.fn(), collection: jest.fn(), deleteField: jest.fn(), doc: jest.fn(), getDocs: jest.fn(), query: jest.fn(), updateDoc: jest.fn(), where: jest.fn()}));

test.each([["Mensual", "legacy_monthly"], ["Anual", "legacy_annual"], ["Personalizado", "custom"]])("formulario ofrece y selecciona %s", (plan, selection) => {
  const {container} = render(<ClienteSaasForm clienteEditando={{id: "a", plan, planNombre: plan}} />);
  expect(container.querySelector('select[name="planId"]').value).toBe(selection);
  expect(screen.getByRole("option", {name: "Legacy mensual"})).toBeTruthy();
  expect(screen.getByRole("option", {name: "Legacy anual"})).toBeTruthy();
  expect(screen.getByRole("option", {name: "Personalizado"})).toBeTruthy();
});

test.each(["Mensual", "Anual", "Personalizado"])("guardar %s sin cambio no migra ni altera precio/ciclo", async (plan) => {
  updateDoc.mockClear();
  const previous = {id: "a", nombre: "Histórico", plan, planNombre: plan, planPrecio: 99,
    fechaAlta: "2026-01-01", frecuenciaCobro: plan === "Personalizado" ? "especial" : plan === "Anual" ? "anual" : "mensual"};
  render(<ClienteSaasForm clienteEditando={previous} onGuardado={jest.fn()} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", {name: "Guardar"}));
  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const payload = updateDoc.mock.calls[0][1];
  expect(payload.planNombre).toBe(plan);
  expect(payload.plan).toBe(plan);
  expect(payload.planPrecio).toBe(99);
  expect(payload.frecuenciaCobro).toBe(previous.frecuenciaCobro);
  expect(payload.planId).toBeUndefined();
  expect(payload.billingCycle).toBeUndefined();
});

test("formulario no muestra Activo cuando el modelo canónico está suspendido", () => {
  const client = {id: "a", estado: "activo", subscriptionStatus: "suspended", planId: "legacy", plan: "Anual", billingCycle: "annual"};
  const {container} = render(<ClienteSaasForm clienteEditando={client} />);
  const status = container.querySelector('select[name="estado"]');
  expect(status.value).toBe(resolveSaasClientStatus(client));
  expect(status.options[status.selectedIndex].text).toBe("Suspendido");
});
