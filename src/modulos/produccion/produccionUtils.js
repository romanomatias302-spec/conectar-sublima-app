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

export function agruparPedidosPorColumna(
  columnas,
  representaciones
) {
  const agrupado = {};

  columnas.forEach((columna) => {
    agrupado[columna.id] = [];
  });

  representaciones.forEach((representacion) => {
    /*
     * Primero utiliza la columna específica de la
     * representación.
     *
     * El fallback mantiene compatibilidad con todos
     * los pedidos históricos actuales.
     */
    const columnaId =
      representacion.columnaRepresentacionId ||
      representacion.columnaProduccionId ||
      "";

    if (!columnaId) return;

    if (!agrupado[columnaId]) return;

    agrupado[columnaId].push(
      representacion
    );
  });

  return agrupado;
}