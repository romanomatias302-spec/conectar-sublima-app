import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

function colorMarcaStyles(color) {
  switch (color) {
    case "amarillo":
      return { background: "#FFF4CC", color: "#8A6D00" };
    case "verde":
      return { background: "#E7F6EC", color: "#2E7D32" };
    case "azul":
      return { background: "#EAF2FF", color: "#2B5FB8" };
    case "rojo":
      return { background: "#FDEEEE", color: "#C62828" };
    case "violeta":
      return { background: "#F3ECFF", color: "#6F42C1" };
    default:
      return null;
  }
}

function obtenerEtiquetasPedido(pedido) {
  if (Array.isArray(pedido?.produccionEtiquetas)) {
    return pedido.produccionEtiquetas.slice(0, 4);
  }

  if (pedido?.produccionEtiquetaId) {
    return [
      {
        id: pedido.produccionEtiquetaId,
        nombre: pedido.produccionEtiquetaNombre || "",
        color: pedido.produccionEtiquetaColor || "",
      },
    ];
  }

  return [];
}

function formatearTiempoEnEtapa(timestamp, ahoraTick) {
  if (!timestamp?.seconds) return "Sin tiempo";

  const inicio = timestamp.seconds * 1000;
  const diffMs = Math.max(0, ahoraTick - inicio);

  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;

  const dias = Math.floor(horas / 24);
  return `${dias} d`;
}

export default function ProduccionCard({
  pedido,
  onVerPedido = () => {},
  onEditarDetalleManual = () => {},
  ahoraTick = Date.now(),
  puedeMoverPedidos = true,
  puedeEditarDetalleManual = true,
}) {
  const id = pedido.firebaseId || pedido.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    disabled: pedido.produccionFinalizada === true || !puedeMoverPedidos,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

const etiquetasPedido = obtenerEtiquetasPedido(pedido);

  const tiempoEtapa = formatearTiempoEnEtapa(
    pedido.produccionActualizadoAt || pedido.ultimaAccionProduccionAt,
    ahoraTick
  );

  const ultimoUsuario = pedido.ultimaAccionProduccionPorNombre || "";
  const usuarioAsignado =
    pedido.produccionAsignadoNombre ||
    pedido.produccionAsignadoEmail ||
    "";

  const tieneDetalleManual =
    etiquetasPedido.length > 0 ||
    !!usuarioAsignado ||
    (pedido.produccionMetros !== "" &&
      pedido.produccionMetros !== null &&
      pedido.produccionMetros !== undefined) ||
    !!pedido.produccionNotaCorta ||
    !!tiempoEtapa ||
    !!ultimoUsuario;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`produccion-card ${isDragging ? "dragging" : ""} ${pedido.__animandoSalida ? "finalizando" : ""}`}
      {...(pedido.produccionFinalizada === true || !puedeMoverPedidos ? {} : listeners)}
      {...(pedido.produccionFinalizada === true || !puedeMoverPedidos ? {} : attributes)}
    >
      <button
        type="button"
        className="produccion-card-drag-handle"

        title={
          pedido.produccionFinalizada === true
            ? "Pedido finalizado"
            : !puedeMoverPedidos
            ? "Sin permiso para mover"
            : "Mover tarjeta"
        }
        onClick={(e) => e.stopPropagation()}
      >
        ⋮⋮
      </button>

      <div
        className="produccion-card-clickable"
        onClick={() => onEditarDetalleManual(pedido)}
      >

        {pedido.produccionImagenPortada && (
          <div className="produccion-card-cover">
            <img src={pedido.produccionImagenPortada} alt="" />
          </div>
        )}
        <div className="produccion-card-top-row">
          <div className="produccion-card-numero">
            {pedido.id || pedido.numeroPedido || pedido.numero || "Sin número"}
          </div>

          {puedeEditarDetalleManual && (
            <button
              type="button"
              className="produccion-card-mini-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEditarDetalleManual(pedido);
              }}
              title="Editar detalle manual"
            >
              ✎
            </button>
          )}
        </div>

        <div className="produccion-card-layout">
          <div className="produccion-card-main">
            <div className="produccion-card-desktop-info">
              <div className="produccion-card-cliente">
                {pedido.cliente || pedido.clienteNombre || pedido.nombreCliente || "Cliente sin nombre"}
              </div>

              <div className="produccion-card-fecha">
                Entrega: {pedido.fechaEntrega || "-"}
              </div>
            </div>

            <div className="produccion-card-mobile-mainline">
              <span className="produccion-card-pedido-numero">
                #{pedido.id || pedido.numeroPedido || pedido.numero || "S/N"}
              </span>

              <span className="produccion-card-cliente produccion-card-cliente-mobile">
                {pedido.cliente || pedido.clienteNombre || pedido.nombreCliente || "Cliente sin nombre"}
              </span>
            </div>

            <div className="produccion-card-mobile-fecha">
              Entrega: {pedido.fechaEntrega || "-"}
            </div>



            <button
              type="button"
              className="produccion-card-link"
              onClick={(e) => {
                e.stopPropagation();
                onVerPedido(pedido);
              }}
            >
              Ver pedido
            </button>
          </div>

          {tieneDetalleManual && (
            <div className="produccion-card-side">
              <div className="produccion-card-meta-row">
                <div className="produccion-card-tiempo">
                  <span className="produccion-card-tiempo-icono">⏱</span>
                  <span>{tiempoEtapa}</span>
                </div>


              </div>

        {etiquetasPedido.length > 0 && (
          <div className="produccion-card-etiquetas">
            {etiquetasPedido.map((etiqueta) => (
              <div
                key={etiqueta.id}
                className="produccion-card-marca"
                style={colorMarcaStyles(etiqueta.color)}
                title={etiqueta.nombre}
              >
                {etiqueta.nombre}
              </div>
            ))}
          </div>
        )}




            </div>
          )}
        </div>
      </div>
    </div>
  );
}