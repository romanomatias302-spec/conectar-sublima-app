export default function ProduccionEstadoCell({ pedido, onIrProduccion = () => {} }) {
  const progreso = pedido?.progresoProduccion || 0;
  const estadoGeneral = pedido?.estado || "Pendiente";
  const etapaProduccion = pedido?.estadoProduccion || "Pendiente";

  function colorEstado() {
    if (estadoGeneral === "Cancelado") return "#d32f2f";
    if (estadoGeneral === "En proceso") return "#1976d2";
    if (estadoGeneral === "Terminado") return "#2e7d32";
    return "#666";
  }

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          lineHeight: "8px",
          color: colorEstado(),
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {estadoGeneral}
      </div>

      <div
        onClick={(e) => {
          e.stopPropagation();
          onIrProduccion(pedido);
        }}
        title={`${etapaProduccion} · ${progreso}%`}
        style={{
          width: "100%",
          height: "13px",
          background: "#e3e6ea",
          borderRadius: "6px",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progreso}%`,
            height: "100%",
            background: "#7c3aed",
            transition: "0.3s",
          }}
        />
      </div>
    </div>
  );
}