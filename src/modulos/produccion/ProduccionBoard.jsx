import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import ProduccionColumn from "./ProduccionColumn";
import { restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers";

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
  columnasContraidas,
  onToggleColumnaContraida,
  onEditarDetalleManual,
  puedeGestionarColumnas,
  onMoverColumna,
  ahoraTick,
  puedeMoverPedidos = true,
  puedeEditarDetalleManual = true,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  function manejarDragEnd(event) {
    if (!puedeMoverPedidos) return;

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
      collisionDetection={pointerWithin}
      modifiers={[restrictToFirstScrollableAncestor]}
      autoScroll={puedeMoverPedidos}
      measuring={{
        droppable: {
          strategy: "always",
        },
      }}
      onDragEnd={manejarDragEnd}
    >
      <div className="produccion-board">
        {columnas.map((columna) => {
          const intermedias = columnas.filter((c) => !c.esInicial && !c.esFinal);
          const indexIntermedia = intermedias.findIndex((c) => c.id === columna.id);

          const puedeMoverIzquierda =
            !columna.esInicial &&
            !columna.esFinal &&
            indexIntermedia > 0;

          const puedeMoverDerecha =
            !columna.esInicial &&
            !columna.esFinal &&
            indexIntermedia !== -1 &&
            indexIntermedia < intermedias.length - 1;

          return (
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
              estaContraida={columnasContraidas?.includes(columna.id)}
              onToggleContraer={() => onToggleColumnaContraida?.(columna.id)}
              onEditarDetalleManual={onEditarDetalleManual}
              puedeGestionarColumnas={puedeGestionarColumnas}
              onMoverColumna={onMoverColumna}
              puedeMoverIzquierda={puedeMoverIzquierda}
              puedeMoverDerecha={puedeMoverDerecha}
              ahoraTick={ahoraTick}
              puedeMoverPedidos={puedeMoverPedidos}
              puedeEditarDetalleManual={puedeEditarDetalleManual}
            />
          );
        })}
      </div>
    </DndContext>
  );
}