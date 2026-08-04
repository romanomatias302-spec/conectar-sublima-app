import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  FaCrown,
  FaExpandArrowsAlt,
} from "react-icons/fa";
import {
  useMemo,
  useState,
} from "react";

function MiniColumnaMapa({
  columna,
  cantidadPedidos = 0,
  altura = 52,
  neutral = false,
  puedeArrastrar = false,
}) {
  const draggableId =
    `mapa-columna:${columna.id}`;

  const droppableId =
    `mapa-objetivo:${columna.id}`;

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: draggableId,
    disabled: !puedeArrastrar,
    data: {
      tipo: "columna",
      columnaId: columna.id,
      sectorId: columna.sectorId || "",
    },
  });

  const {
    setNodeRef: setDroppableRef,
    isOver,
  } = useDroppable({
    id: droppableId,
    disabled: !puedeArrastrar,
    data: {
      tipo: "columna-objetivo",
      columnaId: columna.id,
      sectorId: columna.sectorId || "",
    },
  });

  function asignarRefs(node) {
    setDraggableRef(node);
    setDroppableRef(node);
  }

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={asignarRefs}
      className={[
        "produccion-vista-mini-columna",
        neutral ? "neutral" : "",
        puedeArrastrar ? "arrastrable" : "",
        isDragging ? "arrastrando" : "",
        isOver ? "destino-activo" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      title={`${columna.nombre} · ${cantidadPedidos} pedido${
        cantidadPedidos === 1 ? "" : "s"
      }${
        puedeArrastrar
          ? " · Arrastrá para reordenar"
          : ""
      }`}
      onClick={(event) => {
        event.stopPropagation();
      }}
      {...attributes}
      {...listeners}
    >
        <div
        className="produccion-vista-mini-columna-cuerpo"
        style={{
            height: `${altura}px`,
        }}
        >
        <span className="produccion-vista-mini-columna-titulo">
            {columna.nombre}
        </span>
        </div>
    </div>
  );
}

function SectorMapa({
  sectorId,
  children,
  puedeRecibir = false,
  className = "",
}) {
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: `mapa-sector:${sectorId || "sin-sector"}`,
    disabled: !puedeRecibir,
    data: {
      tipo: "sector",
      sectorId: sectorId || "",
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "produccion-vista-sector-wrap",
        className,
        isOver ? "sector-destino-activo" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export default function ProduccionVistaSectores({
  sectores = [],
  columnas = [],
  pedidosPorColumna = {},

  sectorSeleccionadoId = "",
  onSeleccionarSector = () => {},
  onVistaCompleta = () => {},

  disponible = true,
  motivoBloqueo = "Disponible en el plan Pro",

  puedeReordenarColumnas = false,
  reordenandoColumnas = false,
  onReordenarColumna = () => {},
}) {
  const [
    columnaArrastrando,
    setColumnaArrastrando,
  ] = useState(null);

  const [
    huboDragReciente,
    setHuboDragReciente,
  ] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 7,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 350,
        tolerance: 10,
      },
    })
  );

  const columnasOrdenadas = useMemo(() => {
    return [...columnas].sort(
      (a, b) =>
        Number(a?.orden ?? 0) -
        Number(b?.orden ?? 0)
    );
  }, [columnas]);

  const sectoresConColumnas = useMemo(() => {
    return sectores
      .map((sector) => {
        const columnasSector =
          columnasOrdenadas.filter(
            (columna) =>
              String(columna.sectorId || "") ===
              String(sector.id)
          );

        const cantidadPedidos =
          columnasSector.reduce(
            (total, columna) =>
              total +
              Number(
                pedidosPorColumna?.[
                  columna.id
                ]?.length || 0
              ),
            0
          );

        return {
          ...sector,
          columnas: columnasSector,
          cantidadPedidos,
          primerOrden:
            columnasSector.length > 0
              ? Number(
                  columnasSector[0].orden ?? 0
                )
              : Number.POSITIVE_INFINITY,
        };
      })
      .filter(
        (sector) =>
          sector.columnas.length > 0
      )
      .sort(
        (a, b) =>
          Number(a.primerOrden) -
          Number(b.primerOrden)
      );
  }, [
    sectores,
    columnasOrdenadas,
    pedidosPorColumna,
  ]);

  const columnasSinSector = useMemo(() => {
    return columnasOrdenadas.filter(
      (columna) =>
        !columna.esInicial &&
        !columna.esFinal &&
        !columna.sectorId
    );
  }, [columnasOrdenadas]);

  const vistaCompletaActiva =
    !sectorSeleccionadoId;

  function seleccionarSector(sectorId) {
    if (!disponible) return;
    if (huboDragReciente) return;

    onSeleccionarSector(sectorId);
  }

  function manejarDragStart(event) {
    const columnaId =
      event?.active?.data?.current?.columnaId;

    const columna =
      columnasOrdenadas.find(
        (item) => item.id === columnaId
      ) || null;

    setColumnaArrastrando(columna);
    setHuboDragReciente(true);
  }

  function manejarDragCancel() {
    setColumnaArrastrando(null);

    window.setTimeout(() => {
      setHuboDragReciente(false);
    }, 120);
  }

  async function manejarDragEnd(event) {
    const { active, over } = event;

    setColumnaArrastrando(null);

    window.setTimeout(() => {
      setHuboDragReciente(false);
    }, 120);

    if (!active || !over) return;
    if (!puedeReordenarColumnas) return;
    if (reordenandoColumnas) return;

    const columnaId =
      active.data?.current?.columnaId;

    const overData =
      over.data?.current || {};

    if (!columnaId) return;

    let sectorDestinoId = "";
    let columnaObjetivoId = "";
    let posicion = "antes";

    if (
      overData.tipo ===
      "columna-objetivo"
    ) {
      columnaObjetivoId =
        overData.columnaId || "";

      sectorDestinoId =
        overData.sectorId || "";

      const activeRect =
        active.rect?.current?.translated;

      const overRect = over.rect;

      if (activeRect && overRect) {
        const centroActivo =
          activeRect.left +
          activeRect.width / 2;

        const centroObjetivo =
          overRect.left +
          overRect.width / 2;

        posicion =
          centroActivo > centroObjetivo
            ? "despues"
            : "antes";
      }
    } else if (
      overData.tipo === "sector"
    ) {
      sectorDestinoId =
        overData.sectorId || "";
      columnaObjetivoId = "";
      posicion = "despues";
    } else {
      return;
    }

    await onReordenarColumna({
      columnaId,
      sectorDestinoId,
      columnaObjetivoId,
      posicion,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={manejarDragStart}
      onDragCancel={manejarDragCancel}
      onDragEnd={manejarDragEnd}
    >
      <section
        className={[
          "produccion-vista-sectores",
          "produccion-vista-sectores-modal",
          !disponible ? "bloqueada" : "",
          reordenandoColumnas
            ? "reordenando"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="produccion-vista-sectores-contenido">
          <button
            type="button"
            className={`produccion-vista-completa-card ${
              vistaCompletaActiva
                ? "activa"
                : ""
            }`}
            onClick={() => {
              if (!disponible) return;
              if (huboDragReciente) return;

              onVistaCompleta();
            }}
            disabled={!disponible}
          >
            <div className="produccion-vista-completa-icono">
              <FaExpandArrowsAlt />
            </div>

            <div>
              <strong>Vista completa</strong>

              <span>
                Mostrar las{" "}
                {columnasOrdenadas.length} columnas
                del flujo.
              </span>
            </div>
          </button>

          {puedeReordenarColumnas && (
            <div className="produccion-vista-orden-ayuda">
              Arrastrá las columnas para cambiar su posición
              o moverlas a otro sector.
            </div>
          )}

          <div className="produccion-vista-flujo-grid">
            {sectoresConColumnas.map(
              (sector, sectorIndex) => {
                const seleccionado =
                  sectorSeleccionadoId ===
                  sector.id;

                return (
                  <SectorMapa
                    key={sector.id}
                    sectorId={sector.id}
                    puedeRecibir={
                      puedeReordenarColumnas &&
                      !reordenandoColumnas
                    }
                  >
                    <div
                      style={{
                        "--cantidad-columnas-sector":
                          Math.min(
                            Math.max(
                              sector.columnas.length,
                              2
                            ),
                            10
                          ),
                      }}
                      className="produccion-vista-sector-wrap-inner"
                    >
                      <div
                        className={`produccion-vista-sector ${
                          seleccionado
                            ? "seleccionado"
                            : ""
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          seleccionarSector(
                            sector.id
                          )
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();

                            seleccionarSector(
                              sector.id
                            );
                          }
                        }}
                        title={
                          disponible
                            ? `Ver sector ${sector.nombre}`
                            : motivoBloqueo
                        }
                      >
                        <div className="produccion-vista-sector-header">
                          <div>
                            <span className="produccion-vista-sector-kicker">
                              Sector{" "}
                              {sectorIndex + 1}
                            </span>

                            <strong>
                              {sector.nombre}
                            </strong>
                          </div>

                          <span className="produccion-vista-sector-cantidad">
                            {sector.columnas.length}{" "}
                            {sector.columnas.length === 1
                              ? "columna"
                              : "columnas"}
                          </span>
                        </div>

                        <div className="produccion-vista-mini-columnas">
                          {sector.columnas.map(
                            (columna) => {
                              const cantidadPedidos =
                                Number(
                                  pedidosPorColumna?.[
                                    columna.id
                                  ]?.length || 0
                                );

                              const altura =
                                110 +
                                Math.min(
                                  cantidadPedidos,
                                  6
                                ) *
                                  4;

                              return (
                                <MiniColumnaMapa
                                  key={columna.id}
                                  columna={columna}
                                  cantidadPedidos={
                                    cantidadPedidos
                                  }
                                  altura={altura}
                                  puedeArrastrar={
                                    puedeReordenarColumnas &&
                                    !reordenandoColumnas
                                  }
                                />
                              );
                            }
                          )}
                        </div>

                        <div className="produccion-vista-sector-footer">
                          <span>
                            {sector.cantidadPedidos}{" "}
                            pedido
                            {sector.cantidadPedidos === 1
                              ? ""
                              : "s"}
                          </span>

                          <span>
                            {seleccionado
                              ? "Vista activa"
                              : "Abrir sector"}
                          </span>
                        </div>

                        {sectorIndex <
                          sectoresConColumnas.length -
                            1 && (
                          <span
                            className="produccion-vista-sector-siguiente"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        )}
                      </div>
                    </div>
                  </SectorMapa>
                );
              }
            )}

            {columnasSinSector.length > 0 && (
              <SectorMapa
                sectorId=""
                puedeRecibir={
                  puedeReordenarColumnas &&
                  !reordenandoColumnas
                }
                className="sin-sector"
              >
                <div
                  className="produccion-vista-sector-wrap-inner"
                  style={{
                    "--cantidad-columnas-sector":
                      Math.min(
                        Math.max(
                          columnasSinSector.length,
                          2
                        ),
                        10
                      ),
                  }}
                >
                  <div className="produccion-vista-sector produccion-vista-sector-sin-sector">
                    <div className="produccion-vista-sector-header">
                      <div>
                        <span className="produccion-vista-sector-kicker">
                          Sin agrupación
                        </span>

                        <strong>
                          Columnas sin sector
                        </strong>
                      </div>

                      <span className="produccion-vista-sector-cantidad neutral">
                        {columnasSinSector.length}{" "}
                        {columnasSinSector.length === 1
                          ? "columna"
                          : "columnas"}
                      </span>
                    </div>

                    <div className="produccion-vista-mini-columnas">
                      {columnasSinSector.map(
                        (columna) => {
                          const cantidadPedidos =
                            Number(
                              pedidosPorColumna?.[
                                columna.id
                              ]?.length || 0
                            );

                          return (
                            <MiniColumnaMapa
                              key={columna.id}
                              columna={columna}
                              cantidadPedidos={
                                cantidadPedidos
                              }
                              altura={72}
                              neutral
                              puedeArrastrar={
                                puedeReordenarColumnas &&
                                !reordenandoColumnas
                              }
                            />
                          );
                        }
                      )}
                    </div>

                    <div className="produccion-vista-sector-footer">
                      <span>
                        Fuera de sectores
                      </span>

                      <span>
                        Visible en vista completa
                      </span>
                    </div>
                  </div>
                </div>
              </SectorMapa>
            )}
          </div>

          {!disponible && (
            <div className="produccion-vista-bloqueo-overlay">
              <FaCrown />

              <strong>
                Vista avanzada por sectores
              </strong>

              <span>
                Actualizá al plan Pro para navegar y organizar
                la producción por sectores.
              </span>
            </div>
          )}

          {reordenandoColumnas && (
            <div className="produccion-vista-guardando">
              Guardando nuevo orden…
            </div>
          )}
        </div>
      </section>

        <DragOverlay>
        {columnaArrastrando ? (
            <div className="produccion-vista-drag-overlay">
            <div className="produccion-vista-drag-columna">
                <span className="produccion-vista-mini-columna-titulo">
                {columnaArrastrando.nombre}
                </span>
            </div>

            <div className="produccion-vista-drag-info">
                <strong>{columnaArrastrando.nombre}</strong>

                <span>
                {pedidosPorColumna?.[
                    columnaArrastrando.id
                ]?.length || 0}{" "}
                pedido
                {(pedidosPorColumna?.[
                    columnaArrastrando.id
                ]?.length || 0) === 1
                    ? ""
                    : "s"}
                </span>
            </div>
            </div>
        ) : null}
        </DragOverlay>
    </DndContext>
  );
}