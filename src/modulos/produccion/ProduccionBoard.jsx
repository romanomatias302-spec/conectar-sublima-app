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
  onReordenarPedidoManual,
  onCambiarColorTarjeta,
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
  onToggleOrdenManualColumna,
  ahoraTick,
  puedeMoverPedidos = true,
  puedeEditarDetalleManual = true,
  pedidoNuevoResaltadoId = null,
  puedeGestionarOrdenManual = false,
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
  const y = activeRect.top + activeRect.height / 2;

  const zonaX = 90;
  const zonaY = 120;

  const velocidadX = 18;
  const velocidadY = 16;

  // Horizontal
  if (x > rect.right - zonaX) {
    wrapper.scrollLeft += velocidadX;
  }

  if (x < rect.left + zonaX) {
    wrapper.scrollLeft -= velocidadX;
  }

  // Vertical
  if (y > rect.bottom - zonaY) {
    wrapper.scrollTop += velocidadY;
  }

  if (y < rect.top + zonaY) {
    wrapper.scrollTop -= velocidadY;
  }
}


  function manejarDragEnd(event) {
    if (!puedeMoverPedidos) return;

    const { active, over } = event;

    if (!active || !over) return;

const pedidoId = active.id;
const overData = over.data?.current || {};

const columnaDestinoId = overData.columnaId || over.id;
const pedidoObjetivoId = overData.pedidoId || null;

if (!pedidoId || !columnaDestinoId) return;

const columnaDestino = columnas.find((c) => c.id === columnaDestinoId);
const ordenManualActivo =
  columnaDestino?.ordenManualActivo === true ||
  columnaDestino?.tipoOrden === "manual";

const pedidoActual = Object.values(pedidosPorColumna)
  .flat()
  .find((p) => (p.firebaseId || p.id) === pedidoId);

const mismaColumna = pedidoActual?.columnaProduccionId === columnaDestinoId;

if (ordenManualActivo && mismaColumna && pedidoObjetivoId) {
  onReordenarPedidoManual?.({
    pedidoId,
    pedidoObjetivoId,
    columnaId: columnaDestinoId,
  });

  setColumnaResaltadaId(columnaDestinoId);

  setTimeout(() => {
    setColumnaResaltadaId(null);
  }, 1200);

  return;
}

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
              columnas={columnas}
              onMoverPedido={onMoverPedido}
              ordenManualActivo={
                columna.ordenManualActivo === true || columna.tipoOrden === "manual"
              }
              onCambiarColorTarjeta={onCambiarColorTarjeta}
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
              onToggleOrdenManualColumna={onToggleOrdenManualColumna}
              puedeMoverIzquierda={puedeMoverIzquierda}
              puedeMoverDerecha={puedeMoverDerecha}
              ahoraTick={ahoraTick}
              puedeMoverPedidos={puedeMoverPedidos}
              puedeEditarDetalleManual={puedeEditarDetalleManual}
              resaltada={columnaResaltadaId === columna.id}
              pedidoNuevoResaltadoId={pedidoNuevoResaltadoId}
              puedeGestionarOrdenManual={puedeGestionarOrdenManual}
            />
          );
        })}
      </div>
    </DndContext>
  );
}