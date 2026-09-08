const VISTAS_INICIO = {
  pedidos: "pedidos",
  ventas: "ventas-listado",
  produccion: "produccion",
  clientes: "listado",
  gastos: "gastos",
  configuracion: "configuracion",
};

export function resolverVistaInicio(modulo) {
  return VISTAS_INICIO[modulo] || "";
}
