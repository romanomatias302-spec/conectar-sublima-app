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
  etapasGrupo = [],
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

    produccionEtapaFinalizada:
      etapa.estado === "lista",

    produccionEtapaFinalizadaAt:
      etapa.listaAt || null,

    produccionEtapaFinalizadaPorUid:
      etapa.listaPorUid || "",

    produccionEtapaFinalizadaPorNombre:
      etapa.listaPorNombre || "",  

    produccionFlujoVinculado: {
  grupoId: grupo?.id || etapa?.grupoVinculadoId || "",

  estadoGrupo:
    grupo?.estado || "activo",

  columnaOrigenId:
    grupo?.columnaOrigenId || "",

  columnaReunionId:
    grupo?.columnaReunionId || "",

  totalEtapas:
    Number(
      grupo?.totalEtapas ||
        etapasGrupo.length ||
        0
    ),

  etapasFinalizadas:
    Number(
      grupo?.etapasFinalizadas ??
        etapasGrupo.filter(
          (item) =>
            item?.estado === "lista"
        ).length
    ),

  ramas: etapasGrupo
    .filter(
      (item) =>
        item?.estado !== "cancelada"
    )
    .sort(
      (a, b) =>
        Number(a?.ordenRama || 0) -
        Number(b?.ordenRama || 0)
    )
    .map((item) => ({
      id: item.id || "",

      nombre:
        String(item.nombre || "").trim() ||
        "Etapa vinculada",

      estado:
        item.estado || "activa",

      columnaProduccionId:
        item.columnaProduccionId || "",

      ordenRama:
        Number(item.ordenRama || 0),

      listaPorUid:
        item.listaPorUid || "",

      listaPorNombre:
        item.listaPorNombre || "",

      listaAt:
        item.listaAt || null,
    })),
},  

    /*
     * La posición visual pertenece a la rama,
     * no al pedido principal.
     */
    columnaRepresentacionId:
      etapa.columnaProduccionId || "",

    produccionSortOrder:
     etapa.produccionSortOrder ?? null,  

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



export function crearRepresentacionEsperaReunionProduccion({
  pedido,
  grupo,
}) {
  if (!pedido || !grupo) {
    return null;
  }

  const pedidoFirebaseId =
    obtenerPedidoFirebaseId(pedido);

  if (!pedidoFirebaseId) {
    return null;
  }

  if (!grupo?.id) {
    return null;
  }

  const columnaReunionId =
    grupo.columnaReunionId || "";

  if (!columnaReunionId) {
    return null;
  }

  return {
    ...pedido,

    /*
     * Sigue siendo el mismo pedido comercial.
     */
    firebaseId:
      pedidoFirebaseId,

    pedidoFirebaseId,

    /*
     * Identidad visual temporal.
     *
     * Todavía NO es la representación
     * principal normal.
     */
    produccionRepresentacionId:
      `reunion:${grupo.id}`,

    produccionRepresentacionTipo:
      "reunion",

    produccionEsperaReunion:
      true,

    produccionEsEtapaVinculada:
      false,

    produccionEtapaVinculadaId:
      "",

    produccionGrupoVinculadoId:
      grupo.id,

    produccionEstadoGrupo:
      grupo.estado || "",

    produccionTotalEtapas:
      Number(
        grupo.totalEtapas || 0
      ),

    produccionEtapasFinalizadas:
      Number(
        grupo.etapasFinalizadas || 0
      ),

    produccionColumnaReunionId:
      columnaReunionId,

    /*
     * Visualmente aparece en el punto
     * de reunión.
     *
     * El pedido real todavía no fue movido.
     */
    columnaRepresentacionId:
      columnaReunionId,

    columnaProduccionId:
      columnaReunionId,

    /*
     * Todavía no ocupa un orden permanente.
     * Al tocar "Tomar" calcularemos su
     * orden definitivo.
     */
    produccionSortOrder:
      null,
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
const etapasGrupo =
  etapasVinculadas
    .filter(
      (etapa) =>
        String(
          etapa?.grupoVinculadoId || ""
        ) === String(grupoActivo.id) &&
        String(etapa?.pedidoId || "") ===
          String(pedidoId) &&
        String(etapa?.estado || "") !==
          "cancelada"
    )
    .sort(
      (a, b) =>
        Number(a?.ordenRama || 0) -
        Number(b?.ordenRama || 0)
    );

/*
 * Mostramos todas las etapas vinculadas
 * que sigan perteneciendo al flujo:
 *
 * - activa → se puede seguir trabajando;
 * - lista  → permanece visible como finalizada.
 *
 * Las canceladas ya fueron excluidas
 * previamente en etapasGrupo.
 */
etapasGrupo.forEach((etapa) => {
  const estadoEtapa =
    String(etapa?.estado || "");

  if (
    estadoEtapa !== "activa" &&
    estadoEtapa !== "lista"
  ) {
    return;
  }

  const representacion =
    crearRepresentacionVinculadaProduccion({
      pedido,
      etapa,
      grupo: grupoActivo,
      etapasGrupo,
    });

  if (representacion) {
    resultado.push(representacion);
  }
});
/*
 * Cuando todas las etapas terminaron,
 * aparece una única card de espera
 * en el punto de reunión.
 *
 * Todavía no mostramos la card principal.
 */
if (
  String(grupoActivo.estado || "") ===
  "listo_reunion"
) {
  const esperaReunion =
    crearRepresentacionEsperaReunionProduccion({
      pedido,
      grupo: grupoActivo,
    });

  if (esperaReunion) {
    resultado.push(
      esperaReunion
    );
  }
}

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