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
  onMoverEtapaVinculada,
  
  onReordenarRepresentacionManual,
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
  onGestionarEtapaVinculada,
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







function manejarDragMove(event) {
  const wrapper =
    document.querySelector(
      ".produccion-board-wrapper"
    );

  if (!wrapper) return;

  const rect =
    wrapper.getBoundingClientRect();

  const activeRect =
    event?.active?.rect?.current
      ?.translated;

  if (!activeRect) return;

  const x =
    activeRect.left +
    activeRect.width / 2;

  const y =
    activeRect.top +
    activeRect.height / 2;

  const zonaX = 90;
  const zonaY = 120;

  const velocidadX = 18;
  const velocidadY = 16;

  if (x > rect.right - zonaX) {
    wrapper.scrollLeft +=
      velocidadX;
  }

  if (x < rect.left + zonaX) {
    wrapper.scrollLeft -=
      velocidadX;
  }

  if (y > rect.bottom - zonaY) {
    wrapper.scrollTop +=
      velocidadY;
  }

  if (y < rect.top + zonaY) {
    wrapper.scrollTop -=
      velocidadY;
  }
}




function manejarDragEnd(event) {


if (!puedeMoverPedidos) return;

const { active, over } = event;

if (!active || !over) return;

const overData =
  over.data?.current || {};

const activeId =
  String(active.id || "");

const columnaDestinoId =
  overData.columnaId ||
  over.id;

if (
  !activeId ||
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
  Object.values(
    pedidosPorColumna
  )
    .flat()
    .find((pedido) => {
      const pedidoId =
        pedido.pedidoFirebaseId ||
        pedido.firebaseId ||
        pedido.id ||
        "";

      const representacionId =
        pedido.produccionRepresentacionId ||
        `principal:${pedidoId}`;

      return (
        String(pedidoId) === activeId ||
        String(representacionId) ===
          activeId
      );
    });

if (!pedidoActual) return;

const pedidoId =
  pedidoActual.pedidoFirebaseId ||
  pedidoActual.firebaseId ||
  pedidoActual.id ||
  "";

const representacionId =
  pedidoActual.produccionRepresentacionId ||
  `principal:${pedidoId}`;  

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

const representacionObjetivoId =
  overData.representacionId || null;



const columnaActualId =
  pedidoActual?.columnaRepresentacionId ||
  pedidoActual?.columnaProduccionId ||
  "";

const mismaColumna =
  columnaActualId === columnaDestinoId;

if (
  ordenManualActivo &&
  mismaColumna &&
  representacionObjetivoId
) {
  onReordenarRepresentacionManual?.({
    representacionId,
    representacionObjetivoId,
    columnaId: columnaDestinoId,
  });

  setColumnaResaltadaId(
    columnaDestinoId
  );

  setTimeout(() => {
    setColumnaResaltadaId(null);
  }, 1200);

  return;
}  

if (
  representacionTipo === "vinculada"
) {
  if (!etapaVinculadaId) {
    return;
  }

  /*
   * Una rama vinculada se mueve de manera
   * independiente al pedido comercial.
   *
   * NO modificamos pedidos/{pedidoId}.
   */
  onMoverEtapaVinculada?.({
    etapaId: etapaVinculadaId,
    grupoVinculadoId,
    pedidoId,
    columnaDestinoId,
  });

  setColumnaResaltadaId(
    columnaDestinoId
  );

  setTimeout(() => {
    setColumnaResaltadaId(null);
  }, 2200);

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
              onGestionarEtapaVinculada={
                onGestionarEtapaVinculada
              }
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