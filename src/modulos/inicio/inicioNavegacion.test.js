import { resolverVistaInicio } from "./inicioNavegacion";

test("los accesos rápidos usan las vistas reales de App", () => {
  expect(resolverVistaInicio("pedidos")).toBe("pedidos");
  expect(resolverVistaInicio("ventas")).toBe("ventas-listado");
  expect(resolverVistaInicio("produccion")).toBe("produccion");
  expect(resolverVistaInicio("clientes")).toBe("listado");
  expect(resolverVistaInicio("gastos")).toBe("gastos");
  expect(resolverVistaInicio("configuracion")).toBe("configuracion");
  expect(resolverVistaInicio("inexistente")).toBe("");
});
