import React from "react";
import "@testing-library/jest-dom";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import Configuracion from "./Configuracion";
import {getDoc, getDocs, onSnapshot} from "firebase/firestore";
import {obtenerUsuariosPorCliente} from "../../firebase/usuariosConfig";
import {escucharInvitacionesPorCliente} from "../../firebase/invitacionesUsuarios";

jest.mock("../../firebase", () => ({db: {}, storage: {}}));
jest.mock("firebase/storage", () => ({ref: jest.fn(), uploadBytes: jest.fn(), getDownloadURL: jest.fn()}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn((...parts) => ({parts})),
  collection: jest.fn((...parts) => ({parts})),
  query: jest.fn((value) => value),
  where: jest.fn(),
  updateDoc: jest.fn(),
  getDoc: jest.fn(async () => ({
    exists: () => true,
    id: "tenant-1",
    data: () => ({planId: "start", billingCurrency: "USD", moneda: "ARS"}),
  })),
  getDocs: jest.fn(async () => ({docs: []})),
  onSnapshot: jest.fn(() => jest.fn()),
}));
jest.mock("../../firebase/usuariosConfig", () => ({obtenerUsuariosPorCliente: jest.fn(async () => [])}));
jest.mock("../../firebase/invitacionesUsuarios", () => ({escucharInvitacionesPorCliente: jest.fn(async () => [])}));
jest.mock("./ConfiguracionProductos", () => () => null);
jest.mock("./ConfiguracionProduccion", () => () => null);
jest.mock("./ConfiguracionCuentaPlan", () => () => <div>Uso actualizado</div>);
jest.mock("./ConfiguracionUsuarios", () => ({onEntitlementsChanged}) => (
  <div>
    {[
      "crear invitación", "cancelar invitación", "desactivar usuario", "reactivar usuario",
    ].map((label) => <button key={label} onClick={onEntitlementsChanged}>{label}</button>)}
  </div>
));
jest.mock("./ConfiguracionSucursales", () => ({onEntitlementsChanged}) => (
  <div>
    {["crear sucursal", "desactivar sucursal", "reactivar sucursal"].map((label) =>
      <button key={label} onClick={onEntitlementsChanged}>{label}</button>)}
  </div>
));

beforeEach(() => {
  localStorage.setItem("pestañaActivaConfig", "general");
  jest.clearAllMocks();
  getDoc.mockResolvedValue({
    exists: () => true,
    id: "tenant-1",
    data: () => ({planId: "start", billingCurrency: "USD", moneda: "ARS"}),
  });
  getDocs.mockResolvedValue({docs: []});
  obtenerUsuariosPorCliente.mockResolvedValue([]);
  escucharInvitacionesPorCliente.mockResolvedValue([]);
  onSnapshot.mockImplementation(() => jest.fn());
});

test.each([
  ["Usuarios", "crear invitación"],
  ["Usuarios", "cancelar invitación"],
  ["Usuarios", "desactivar usuario"],
  ["Usuarios", "reactivar usuario"],
  ["Sucursales", "crear sucursal"],
  ["Sucursales", "desactivar sucursal"],
  ["Sucursales", "reactivar sucursal"],
])("refresca Cuenta después de %s / %s", async (tab, action) => {
  render(<Configuracion perfil={{clienteId: "tenant-1", rol: "admin"}} modoOscuro={false} setModoOscuro={jest.fn()} />);
  await waitFor(() => expect(obtenerUsuariosPorCliente).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", {name: tab}));
  fireEvent.click(screen.getByRole("button", {name: action}));
  const listenersBeforeAccount = onSnapshot.mock.calls.length;
  fireEvent.click(screen.getByRole("button", {name: "Cuenta"}));
  await waitFor(() => expect(onSnapshot.mock.calls.length).toBeGreaterThan(listenersBeforeAccount));
  expect(screen.getByText("Uso actualizado")).toBeInTheDocument();
});
