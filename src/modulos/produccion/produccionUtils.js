export function calcularProgresoPorColumna(columnasOrdenadas, columnaDestinoId) {
  const columnasActivas = [...columnasOrdenadas].sort((a, b) => a.orden - b.orden);
  const total = columnasActivas.length;

  if (total <= 1) return 0;

  const index = columnasActivas.findIndex((col) => col.id === columnaDestinoId);
  if (index === -1) return 0;

  return Math.round((index / (total - 1)) * 100);
}

export function calcularEstadoProduccion(columna) {
  if (!columna) return "pendiente";
  if (columna.esFinal) return "finalizado";
  if (columna.esInicial) return "pendiente";
  return "en_proceso";
}

export function calcularProduccionFinalizada(columna) {
  return !!columna?.esFinal;
}

export function agruparPedidosPorColumna(columnas, pedidos) {
  const agrupado = {};

  columnas.forEach((col) => {
    agrupado[col.id] = [];
  });

  pedidos.forEach((pedido) => {
    const colId = pedido.columnaProduccionId;
    if (agrupado[colId]) {
      agrupado[colId].push(pedido);
    }
  });

  return agrupado;
}