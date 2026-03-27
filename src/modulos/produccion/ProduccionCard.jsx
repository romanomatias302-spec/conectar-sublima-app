import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export default function ProduccionCard({ pedido, onVerPedido = () => {} }) {
  const id = pedido.firebaseId || pedido.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`produccion-card ${isDragging ? "dragging" : ""}`}
    >
      <button
        type="button"
        className="produccion-card-drag-handle"
        {...listeners}
        {...attributes}
        title="Mover tarjeta"
        onClick={(e) => e.stopPropagation()}
      >
        ⋮⋮
      </button>

      <div
        className="produccion-card-clickable"
        onClick={() => onVerPedido(pedido)}
      >
        <div className="produccion-card-numero">
          {pedido.id || pedido.numeroPedido || pedido.numero || "Sin número"}
        </div>

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
    </div>
  );
}