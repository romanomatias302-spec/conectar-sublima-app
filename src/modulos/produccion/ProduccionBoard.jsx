import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import ProduccionColumn from "./ProduccionColumn";

import { useState } from "react";

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

const [columnaResaltadaId, setColumnaResaltadaId] = useState(null);

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 450,
      tolerance: 12,
    },
  })

);


function manejarDragMove(event) {
  const wrapper = document.querySelector(".produccion-board-wrapper");
  if (!wrapper) return;

  const rect = wrapper.getBoundingClientRect();
  const activeRect = event?.active?.rect?.current?.translated;

  if (!activeRect) return;

  const x = activeRect.left + activeRect.width / 2;

  const zona = 90;
  const velocidad = 18;

  if (x > rect.right - zona) {
    wrapper.scrollLeft += velocidad;
  }

  if (x < rect.left + zona) {
    wrapper.scrollLeft -= velocidad;
  }
}


  function manejarDragEnd(event) {
    if (!puedeMoverPedidos) return;

    const { active, over } = event;

    if (!active || !over) return;

    const pedidoId = active.id;
    const columnaDestinoId = over.data?.current?.columnaId || over.id;

    if (!pedidoId || !columnaDestinoId) return;

    onMoverPedido?.(pedidoId, columnaDestinoId);
    setColumnaResaltadaId(columnaDestinoId);

    setTimeout(() => {
      setColumnaResaltadaId(null);
    }, 2200);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      modifiers={[]}
      autoScroll={false}
      measuring={{
        droppable: {
          strategy: "always",
        },
      }}
      onDragMove={manejarDragMove}
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
              resaltada={columnaResaltadaId === columna.id}
            />
          );
        })}
      </div>
    </DndContext>
  );
}