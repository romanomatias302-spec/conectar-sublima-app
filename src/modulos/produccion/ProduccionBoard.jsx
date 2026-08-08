import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import ProduccionColumn from "./ProduccionColumn";

import {
  useMemo,
  useRef,
  useState,
} from "react";

export default function ProduccionBoard({
  columnas,
  columnasGlobales = [],

  sectores = [],
  sectorSeleccionadoId = "",
  sectorSeleccionadoNombre = "",
  columnaEntradaId = "",
  columnaSalidaId = "",
  columnasSectorIds = [],

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

const dragScrollRafRef = useRef(null);

const dragWrapperRef = useRef(null);

const dragWrapperRectRef = useRef(null);

const ultimoCentroDragRef = useRef({
  x: 0,
  y: 0,
});

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

const columnasReferencia = useMemo(() => {
  return columnasGlobales.length > 0
    ? columnasGlobales
    : columnas;
}, [
  columnasGlobales,
  columnas,
]);

const columnasIntermedias = useMemo(() => {
  return columnasReferencia.filter(
    (columna) =>
      !columna.esInicial &&
      !columna.esFinal
  );
}, [columnasReferencia]);

const indiceIntermediaPorId = useMemo(() => {
  return new Map(
    columnasIntermedias.map(
      (columna, index) => [
        columna.id,
        index,
      ]
    )
  );
}, [columnasIntermedias]);

const sectorPorId = useMemo(() => {
  return new Map(
    sectores.map((sector) => [
      String(sector.id),
      sector,
    ])
  );
}, [sectores]);

const columnasSectorSet = useMemo(() => {
  return new Set(columnasSectorIds);
}, [columnasSectorIds]);

function manejarDragStart() {
  const wrapper = document.querySelector(
    ".produccion-board-wrapper"
  );

  dragWrapperRef.current =
    wrapper || null;

  dragWrapperRectRef.current =
    wrapper?.getBoundingClientRect() ||
    null;
}

function manejarDragMove(event) {
  const wrapper =
    dragWrapperRef.current;

  const rect =
    dragWrapperRectRef.current;

  if (!wrapper || !rect) return;

  const activeRect =
    event?.active?.rect?.current
      ?.translated;

  if (!activeRect) return;

  /*
   * Sólo guardamos la última posición conocida.
   * No tocamos el DOM todavía.
   */
  ultimoCentroDragRef.current = {
    x:
      activeRect.left +
      activeRect.width / 2,

    y:
      activeRect.top +
      activeRect.height / 2,
  };

  /*
   * Como máximo una operación de scroll
   * por frame del navegador.
   */
  if (dragScrollRafRef.current) {
    return;
  }

  dragScrollRafRef.current =
    window.requestAnimationFrame(() => {
      dragScrollRafRef.current =
        null;

      const {
        x,
        y,
      } = ultimoCentroDragRef.current;

      const zonaX = 90;
      const zonaY = 120;

      const velocidadX = 18;
      const velocidadY = 16;

      let deltaX = 0;
      let deltaY = 0;

      if (x > rect.right - zonaX) {
        deltaX = velocidadX;
      } else if (
        x < rect.left + zonaX
      ) {
        deltaX = -velocidadX;
      }

      if (y > rect.bottom - zonaY) {
        deltaY = velocidadY;
      } else if (
        y < rect.top + zonaY
      ) {
        deltaY = -velocidadY;
      }

      if (deltaX !== 0) {
        wrapper.scrollLeft +=
          deltaX;
      }

      if (deltaY !== 0) {
        wrapper.scrollTop +=
          deltaY;
      }
    });
}


function limpiarEstadoDrag() {
  if (dragScrollRafRef.current) {
    window.cancelAnimationFrame(
      dragScrollRafRef.current
    );

    dragScrollRafRef.current =
      null;
  }

  dragWrapperRef.current = null;
  dragWrapperRectRef.current = null;
}


function manejarDragEnd(event) {
limpiarEstadoDrag();

if (!puedeMoverPedidos) return;

const { active, over } = event;

if (!active || !over) return;

const overData =
  over.data?.current || {};

const representacionId =
  String(active.id || "");

const columnaDestinoId =
  overData.columnaId ||
  over.id;

if (
  !representacionId ||
  !columnaDestinoId
) {
  return;
}



const columnaDestino = columnasReferencia.find(
  (c) => c.id === columnaDestinoId
);
const ordenManualActivo =
  columnaDestino?.ordenManualActivo === true ||
  columnaDestino?.tipoOrden === "manual";

const pedidoActual =
  Object.values(pedidosPorColumna)
    .flat()
    .find((p) => {
      const idRepresentacion =
        p.produccionRepresentacionId ||
        `principal:${
          p.pedidoFirebaseId ||
          p.firebaseId ||
          p.id
        }`;

      return (
        String(idRepresentacion) ===
        String(representacionId)
      );
    });

if (!pedidoActual) return;

const pedidoId =
  pedidoActual.pedidoFirebaseId ||
  pedidoActual.firebaseId ||
  pedidoActual.id ||
  "";

const representacionTipo =
  pedidoActual.produccionRepresentacionTipo ||
  "principal";

const etapaVinculadaId =
  pedidoActual.produccionEtapaVinculadaId ||
  "";

const grupoVinculadoId =
  pedidoActual.produccionGrupoVinculadoId ||
  "";

if (!pedidoId) return;

const pedidoObjetivoId =
  overData.pedidoId || null;    

const columnaActualId =
  pedidoActual?.columnaRepresentacionId ||
  pedidoActual?.columnaProduccionId ||
  "";

const mismaColumna =
  columnaActualId === columnaDestinoId;

/*
 * Las ramas vinculadas todavía NO escriben en Firestore.
 *
 * Dejamos preparada la identidad pero bloqueamos su
 * movimiento hasta conectar moverEtapaVinculadaProduccion().
 *
 * Hoy no afecta nada porque todavía no renderizamos ramas.
 */
if (
  representacionTipo === "vinculada"
) {
  console.warn(
    "Movimiento de etapa vinculada todavía no habilitado:",
    {
      representacionId,
      pedidoId,
      etapaVinculadaId,
      grupoVinculadoId,
      columnaDestinoId,
    }
  );

  return;
}  

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

        onDragStart={manejarDragStart}
        onDragMove={manejarDragMove}
        onDragCancel={limpiarEstadoDrag}
        onDragEnd={manejarDragEnd}
      >
      <div className="produccion-board">
        {columnas.map((columna) => {
          const indexIntermedia =
            indiceIntermediaPorId.get(
              columna.id
            ) ?? -1;

          const puedeMoverIzquierda =
            !columna.esInicial &&
            !columna.esFinal &&
            indexIntermedia > 0;

          const puedeMoverDerecha =
            !columna.esInicial &&
            !columna.esFinal &&
            indexIntermedia !== -1 &&
            indexIntermedia <
              columnasIntermedias.length - 1;

          const sectorColumna =
            sectorPorId.get(
              String(columna.sectorId || "")
            ) || null;

          const perteneceSectorSeleccionado =
            !!sectorSeleccionadoId &&
            columnasSectorSet.has(
              columna.id
            );

          const esContextoEntrada =
            columna.id === columnaEntradaId;

          const esContextoSalida =
            columna.id === columnaSalidaId;  

          return (
            <ProduccionColumn
              key={columna.id}
              columna={columna}
              columnas={columnasReferencia}
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
              sectorNombre={sectorColumna?.nombre || ""}

              sectorSeleccionadoNombre={
                sectorSeleccionadoNombre
              }

              perteneceSectorSeleccionado={
                perteneceSectorSeleccionado
              }

              esContextoEntrada={esContextoEntrada}
              esContextoSalida={esContextoSalida}
            />
          );
        })}
      </div>
    </DndContext>
  );
}