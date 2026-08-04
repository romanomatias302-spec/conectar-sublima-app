function obtenerPedidoFirebaseId(pedido) {
  return String(
    pedido?.firebaseId ||
      pedido?.pedidoFirebaseId ||
      ""
  );
}

/**
 * Convierte un pedido tradicional en una representación
 * renderizable dentro del tablero.
 *
 * IMPORTANTE:
 * - no modifica el objeto original;
 * - conserva firebaseId;
 * - conserva columnaProduccionId;
 * - conserva todos los campos que hoy usa ProduccionCard;
 * - todavía representa exclusivamente la etapa principal.
 */
export function crearRepresentacionPrincipalProduccion(
  pedido
) {
  if (!pedido) return null;

  const pedidoFirebaseId =
    obtenerPedidoFirebaseId(pedido);

  if (!pedidoFirebaseId) {
    console.warn(
      "Pedido sin firebaseId en Producción:",
      pedido
    );

    return null;
  }

  return {
    ...pedido,

    /*
     * Identidad comercial real.
     * Siempre apunta al documento pedidos/{id}.
     */
    pedidoFirebaseId,

    /*
     * Identidad futura de la representación visual.
     * Todavía no reemplaza firebaseId en dnd-kit.
     */
    produccionRepresentacionId:
      `principal:${pedidoFirebaseId}`,

    produccionRepresentacionTipo: "principal",
    produccionEsEtapaVinculada: false,

    /*
     * En una futura etapa vinculada este valor será
     * el ID del documento de la colección vinculada.
     */
    produccionEtapaVinculadaId: "",

    /*
     * La columna continúa viniendo del pedido original.
     */
    columnaRepresentacionId:
      pedido.columnaProduccionId || "",
  };
}

/**
 * Punto único para construir todo lo que renderizará
 * el tablero.
 *
 * Por ahora sólo recibe pedidos tradicionales.
 * Más adelante incorporará etapas vinculadas sin cambiar
 * ProduccionColumn ni el formato general de las tarjetas.
 */
export function construirRepresentacionesProduccion({
  pedidos = [],
  etapasVinculadas = [],
}) {
  const representacionesPrincipales = pedidos
    .map(crearRepresentacionPrincipalProduccion)
    .filter(Boolean);

  /*
   * Todavía no procesamos etapasVinculadas.
   * El parámetro existe para dejar estable la interfaz
   * de esta función desde ahora.
   */
  if (
    Array.isArray(etapasVinculadas) &&
    etapasVinculadas.length > 0
  ) {
    console.warn(
      "Se recibieron etapas vinculadas, pero todavía no están habilitadas."
    );
  }

  return representacionesPrincipales;
}

export function obtenerPedidoIdDesdeRepresentacion(
  representacion
) {
  return String(
    representacion?.pedidoFirebaseId ||
      representacion?.firebaseId ||
      ""
  );
}