export default function ProduccionEstadoCell({
  pedido,
  columnasProduccion = [],
  onIrProduccion = () => {},
}) {
  const progreso = pedido?.progresoProduccion || 0;

  const columnaActual =
    pedido?.estado === "Cancelado"
      ? null
      : columnasProduccion.find((c) => c.id === pedido.columnaProduccionId);

  const etiqueta = pedido?.estado === "Cancelado"
    ? "Cancelado"
    : columnaActual?.nombre || "Pendiente";

  function colorEstado() {
    if (pedido?.estado === "Cancelado") return "#d32f2f";
    if (pedido?.estado === "Terminado") return "#2e7d32";
    if (pedido?.estado === "En proceso") return "#1976d2";
    return "#666";
  }

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          lineHeight: "11px",
          color: colorEstado(),
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {etiqueta}
      </div>

      <div
        onClick={(e) => {
          e.stopPropagation();
          onIrProduccion(pedido);
        }}
        title={`${etiqueta} · ${progreso}%`}
        style={{
          width: "100%",
          height: "13px",
          background: pedido?.estado === "Cancelado" ? "#ececec" : "#e3e6ea",
          borderRadius: "6px",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: pedido?.estado === "Cancelado" ? "0%" : `${progreso}%`,
            height: "100%",
            background: pedido?.estado === "Cancelado" ? "#bdbdbd" : "#7c3aed",
            transition: "0.3s",
          }}
        />
      </div>
    </div>
  );
}