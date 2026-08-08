function obtenerPedidoFirebaseId(pedido) {
  return String(
    pedido?.firebaseId ||
      pedido?.pedidoFirebaseId ||
      pedido?.id ||
      ""
  );
}

function obtenerGrupoActivoPedido(
  pedidoId,
  gruposVinculados = []
) {
  return (
    gruposVinculados.find(
      (grupo) =>
        String(grupo?.pedidoId || "") ===
          String(pedidoId || "") &&
        ["activo", "listo_reunion"].includes(
          String(grupo?.estado || "")
        )
    ) || null
  );
}

/**
 * Representación tradicional.
 *
 * Mantiene todos los campos actuales del pedido
 * para no romper ProduccionCard, filtros, colores,
 * asignaciones, detalle, historial, etc.
 */
export function crearRepresentacionPrincipalProduccion(
  pedido
) {
  if (!pedido) return null;

  const pedidoFirebaseId =
    obtenerPedidoFirebaseId(pedido);

  if (!pedidoFirebaseId) return null;

  return {
    ...pedido,

    pedidoFirebaseId,

    produccionRepresentacionId:
      `principal:${pedidoFirebaseId}`,

    produccionRepresentacionTipo:
      "principal",

    produccionEsEtapaVinculada: false,

    produccionEtapaVinculadaId: "",
    produccionGrupoVinculadoId: "",

    produccionNombreRama: "",

    columnaRepresentacionId:
      pedido.columnaProduccionId || "",
  };
}

/**
 * Crea una representación visual de una rama.
 *
 * IMPORTANTE:
 * firebaseId continúa apuntando al pedido comercial.
 * NO lo reemplazamos por el ID de la etapa.
 *
 * La identidad visual independiente queda en:
 * produccionRepresentacionId.
 */
export function crearRepresentacionVinculadaProduccion({
  pedido,
  etapa,
  grupo,
}) {
  if (!pedido || !etapa) return null;

  const pedidoFirebaseId =
    obtenerPedidoFirebaseId(pedido);

  if (!pedidoFirebaseId) return null;
  if (!etapa?.id) return null;

  return {
    ...pedido,

    /*
     * Sigue siendo el mismo pedido comercial.
     */
    firebaseId: pedidoFirebaseId,
    pedidoFirebaseId,

    /*
     * Identidad única de ESTA tarjeta.
     */
    produccionRepresentacionId:
      `vinculada:${etapa.id}`,

    produccionRepresentacionTipo:
      "vinculada",

    produccionEsEtapaVinculada: true,

    produccionEtapaVinculadaId:
      etapa.id,

    produccionGrupoVinculadoId:
      etapa.grupoVinculadoId || "",

    /*
     * Identidad operativa de la rama.
     */
    produccionNombreRama:
      String(etapa.nombre || "").trim() ||
      "Etapa vinculada",

    produccionEstadoRama:
      etapa.estado || "activa",

    /*
     * La posición visual pertenece a la rama,
     * no al pedido principal.
     */
    columnaRepresentacionId:
      etapa.columnaProduccionId || "",

    /*
     * Mantenemos también columnaProduccionId
     * con el valor de la rama para compatibilidad
     * con código visual existente.
     *
     * NO significa que modificamos el pedido real.
     */
    columnaProduccionId:
      etapa.columnaProduccionId || "",

    /*
     * Información del grupo.
     */
    produccionColumnaReunionId:
      grupo?.columnaReunionId || "",

    produccionEstadoGrupo:
      grupo?.estado || "activo",

    produccionTotalEtapas:
      Number(grupo?.totalEtapas || 0),
  };
}

/**
 * Construye TODAS las representaciones operativas.
 *
 * Regla:
 *
 * Pedido SIN grupo activo
 * → representación normal.
 *
 * Pedido CON grupo activo
 * → desaparece temporalmente la representación normal
 *   y aparecen únicamente sus ramas ACTIVAS.
 *
 * Las ramas "lista" no ocupan lugar en el tablero.
 */
export function construirRepresentacionesProduccion({
  pedidos = [],
  gruposVinculados = [],
  etapasVinculadas = [],
}) {
  const resultado = [];

  const pedidosPorId = new Map();

  pedidos.forEach((pedido) => {
    const pedidoId =
      obtenerPedidoFirebaseId(pedido);

    if (!pedidoId) return;

    pedidosPorId.set(
      String(pedidoId),
      pedido
    );
  });

  pedidos.forEach((pedido) => {
    const pedidoId =
      obtenerPedidoFirebaseId(pedido);

    if (!pedidoId) return;

    const grupoActivo =
      obtenerGrupoActivoPedido(
        pedidoId,
        gruposVinculados
      );

    /*
     * Pedido tradicional.
     */
    if (!grupoActivo) {
      const principal =
        crearRepresentacionPrincipalProduccion(
          pedido
        );

      if (principal) {
        resultado.push(principal);
      }

      return;
    }

    /*
     * Pedido con producción paralela:
     * no mostramos la tarjeta principal.
     */
    const ramasActivas =
      etapasVinculadas
        .filter(
          (etapa) =>
            String(
              etapa?.grupoVinculadoId || ""
            ) === String(grupoActivo.id) &&
            String(etapa?.pedidoId || "") ===
              String(pedidoId) &&
            String(etapa?.estado || "") ===
              "activa"
        )
        .sort(
          (a, b) =>
            Number(a?.ordenRama || 0) -
            Number(b?.ordenRama || 0)
        );

    ramasActivas.forEach((etapa) => {
      const representacion =
        crearRepresentacionVinculadaProduccion({
          pedido,
          etapa,
          grupo: grupoActivo,
        });

      if (representacion) {
        resultado.push(representacion);
      }
    });
  });

  return resultado;
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

export function obtenerRepresentacionIdProduccion(
  representacion
) {
  return String(
    representacion?.produccionRepresentacionId ||
      (
        representacion?.firebaseId
          ? `principal:${representacion.firebaseId}`
          : ""
      )
  );
}

export function esRepresentacionVinculada(
  representacion
) {
  return (
    representacion
      ?.produccionRepresentacionTipo ===
      "vinculada" &&
    Boolean(
      representacion
        ?.produccionEtapaVinculadaId
    )
  );
}