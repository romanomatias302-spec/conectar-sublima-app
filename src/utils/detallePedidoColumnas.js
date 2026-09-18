export const COLUMNAS_DETALLE_PEDIDO_CATALOGO = [
  { key: "producto", label: "Producto", fija: true, visible: true, orden: 1 },

  { key: "color", label: "Color", fija: false, visible: true, orden: 2 },

  { key: "detalle", label: "Detalle", fija: false, visible: true, orden: 3 },

  { key: "atributos", label: "Atributos", fija: false, visible: false, orden: 4 },

  { key: "zonasResumen", label: "Zonas", fija: false, visible: false, orden: 5 },

  { key: "tallesResumen", label: "Talles", fija: false, visible: false, orden: 6 },

  {
    key: "detallesCosturaResumen",
    label: "Costura",
    fija: false,
    visible: false,
    orden: 7,
  },

  {
    key: "imagenesResumen",
    label: "Imágenes",
    fija: false,
    visible: false,
    orden: 8,
  },

  { key: "cantidad", label: "Cantidad", fija: true, visible: true, orden: 98 },

  { key: "acciones", label: "Acciones", fija: true, visible: true, orden: 99 },
];

export function getColumnasDetallePedidoDefault() {
  return [...COLUMNAS_DETALLE_PEDIDO_CATALOGO].sort(
    (a, b) => a.orden - b.orden
  );
}

export function normalizarColumnasDetallePedido(columnasGuardadas = []) {
  if (!Array.isArray(columnasGuardadas) || columnasGuardadas.length === 0) {
    return getColumnasDetallePedidoDefault();
  }

  const mapaCatalogo = COLUMNAS_DETALLE_PEDIDO_CATALOGO.reduce((acc, col) => {
    acc[col.key] = col;
    return acc;
  }, {});

  // Compatibilidad con configuraciones antiguas:
  // la vieja columna "observaciones" pasa a representar "atributos".
  const columnasCompatibles = columnasGuardadas.map((col) => {
    if (col?.key === "observaciones") {
      return {
        ...col,
        key: "atributos",
      };
    }

    return col;
  });

  const mergeadas = columnasCompatibles
    .filter((col) => mapaCatalogo[col.key])
    .map((col) => ({
      ...mapaCatalogo[col.key],
      ...col,

      // El nombre y la condición fija siempre los define
      // el catálogo actual, no una configuración vieja.
      label: mapaCatalogo[col.key].label,
      fija: mapaCatalogo[col.key].fija,
    }));

  const keysExistentes = new Set(mergeadas.map((c) => c.key));

  const faltantes = COLUMNAS_DETALLE_PEDIDO_CATALOGO.filter(
    (col) => !keysExistentes.has(col.key)
  );

  return [...mergeadas, ...faltantes].sort((a, b) => a.orden - b.orden);
}