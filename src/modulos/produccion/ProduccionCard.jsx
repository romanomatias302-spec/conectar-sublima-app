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

function obtenerTextoMarca(pedido) {
  return (
    pedido?.produccionColorMarcaTexto ||
    pedido?.produccionColorMarcaNombre ||
    pedido?.produccionColorMarca ||
    ""
  );
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

  const marcaStyle = colorMarcaStyles(pedido.produccionColorMarca);
  const marcaTexto = obtenerTextoMarca(pedido);

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
    !!marcaStyle ||
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
    >
      <button
        type="button"
        className="produccion-card-drag-handle"
        {...(pedido.produccionFinalizada === true || !puedeMoverPedidos ? {} : listeners)}
        {...(pedido.produccionFinalizada === true || !puedeMoverPedidos ? {} : attributes)}
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
        onClick={() => onVerPedido(pedido)}
      >
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
            <div className="produccion-card-cliente">
              {pedido.cliente || pedido.clienteNombre || pedido.nombreCliente || "Cliente sin nombre"}
            </div>

            <div className="produccion-card-fecha">
              Entrega: {pedido.fechaEntrega || "-"}
            </div>

            <div className="produccion-card-link">
              Ver pedido
            </div>
          </div>

          {tieneDetalleManual && (
            <div className="produccion-card-side">
              <div className="produccion-card-meta-top">
                <div className="produccion-card-tiempo">
                  <span className="produccion-card-tiempo-icono">⏱</span>
                  <span>{tiempoEtapa}</span>
                </div>

                {marcaStyle && (
                  <div
                    className="produccion-card-marca"
                    style={marcaStyle}
                    title={marcaTexto}
                  >
                    {marcaTexto}
                  </div>
                )}
              </div>

              {usuarioAsignado && (
                <div className="produccion-card-asignado" title={usuarioAsignado}>
                  <span className="produccion-card-asignado-icono">👤</span>
                  <span className="produccion-card-asignado-texto">{usuarioAsignado}</span>
                </div>
              )}

              {(pedido.produccionMetros !== "" &&
                pedido.produccionMetros !== null &&
                pedido.produccionMetros !== undefined) && (
                <div className="produccion-card-metros">
                  {pedido.produccionMetros} mts
                </div>
              )}

              {pedido.produccionNotaCorta && (
                <div className="produccion-card-nota" title={pedido.produccionNotaCorta}>
                  {pedido.produccionNotaCorta}
                </div>
              )}

              {ultimoUsuario && (
                <div className="produccion-card-usuario" title={ultimoUsuario}>
                  Último mov.: {ultimoUsuario}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}