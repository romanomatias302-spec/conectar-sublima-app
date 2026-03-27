import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import ProduccionColumn from "./ProduccionColumn";

export default function ProduccionBoard({
  columnas,
  pedidosPorColumna,
  onMoverPedido,
  onVerPedido,
  onEditarColumna,
  onEliminarColumna,
  columnaEditandoId,
  nombreEditarColumna,
  setNombreEditarColumna,
  onGuardarEdicionColumna,
  guardandoEdicionColumna,
  eliminandoColumnaId,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  function manejarDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) return;

    const pedidoId = active.id;
    const columnaDestinoId = over.data?.current?.columnaId || over.id;

    if (!pedidoId || !columnaDestinoId) return;

    onMoverPedido?.(pedidoId, columnaDestinoId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={manejarDragEnd}
    >
      <div className="produccion-board">
        {columnas.map((columna) => (
          <ProduccionColumn
            key={columna.id}
            columna={columna}
            pedidos={pedidosPorColumna[columna.id] || []}
            onVerPedido={onVerPedido}
            onEditarColumna={onEditarColumna}
            onEliminarColumna={onEliminarColumna}
            columnaEditandoId={columnaEditandoId}
            nombreEditarColumna={nombreEditarColumna}
            setNombreEditarColumna={setNombreEditarColumna}
            onGuardarEdicionColumna={onGuardarEdicionColumna}
            guardandoEdicionColumna={guardandoEdicionColumna}
            eliminandoColumnaId={eliminandoColumnaId}
          />
        ))}
      </div>
    </DndContext>
  );
}