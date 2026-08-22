import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FaCheck,
  FaLink,
  FaTimes,
  FaArrowRight,
} from "react-icons/fa";

export default function EtapasVinculadasModal({
  pedido,
  modo = "crear",
  columnas = [],
  sectores = [],
  onCerrar = () => {},
  onGuardar = async () => {},
  onEliminarVinculo = async () => {},
  puedeEliminarVinculo = false,
  onConfigurarSectores = () => {},
  }) {
  const [
    columnasSeleccionadasIds,
    setColumnasSeleccionadasIds,
  ] = useState([]);

  const [
    columnaReunionId,
    setColumnaReunionId,
  ] = useState("");

const [guardando, setGuardando] =
  useState(false);

const [confirmandoEliminar, setConfirmandoEliminar] =
  useState(false);

const [eliminandoVinculo, setEliminandoVinculo] =
  useState(false);

const [error, setError] =
  useState("");

const flujoActual =
  pedido?.produccionFlujoVinculado || null;

const etapasActuales =
  Array.isArray(flujoActual?.ramas)
    ? flujoActual.ramas
    : [];

  useEffect(() => {
  if (modo !== "editar") {
    return;
  }

  const columnasActualesIds =
    etapasActuales
      .filter(
        (etapa) =>
          etapa?.estado !== "cancelada"
      )
      .map(
        (etapa) =>
          String(
            etapa?.columnaProduccionId || ""
          )
      )
      .filter(Boolean);

  setColumnasSeleccionadasIds(
    columnasActualesIds
  );

  setColumnaReunionId(
    String(
      flujoActual?.columnaReunionId || ""
    )
  );

  setError("");
}, [
  modo,
  pedido?.produccionRepresentacionId,
]);  

  /*
   * No permitimos usar como ramas
   * Pendiente ni Producción finalizada.
   */
  const columnasDisponibles =
    useMemo(() => {
      return columnas.filter(
        (columna) =>
          !columna.esInicial &&
          !columna.esFinal
      );
    }, [columnas]);

  const columnasDisponiblesSinSector =
  useMemo(() => {
    return columnasDisponibles.filter(
      (columna) =>
        !columna?.sectorId
    );
  }, [columnasDisponibles]);  

  const sectoresPorId =
  useMemo(() => {
    const mapa = new Map();

    sectores.forEach((sector) => {
      if (!sector?.id) return;

      mapa.set(
        String(sector.id),
        sector
      );
    });

    return mapa;
  }, [sectores]);


function agruparColumnasPorSector(
  listaColumnas
) {
  const grupos = [];
  const mapaGrupos = new Map();

  listaColumnas.forEach((columna) => {
    const sectorId =
      String(
        columna?.sectorId || ""
      );

    const sector =
      sectoresPorId.get(
        sectorId
      ) || null;

    const grupoId =
      sectorId ||
      "__sin_sector__";

    if (!mapaGrupos.has(grupoId)) {
      const nuevoGrupo = {
        id: grupoId,

        nombre:
          sector?.nombre ||
          "Sin sector",

        columnas: [],
      };

      mapaGrupos.set(
        grupoId,
        nuevoGrupo
      );

      grupos.push(
        nuevoGrupo
      );
    }

    mapaGrupos
      .get(grupoId)
      .columnas.push(
        columna
      );
  });

  return grupos;
}  

const columnasDisponiblesPorSector =
  useMemo(() => {
    return agruparColumnasPorSector(
      columnasDisponibles
    );
  }, [
    columnasDisponibles,
    sectoresPorId,
  ]);

  /*
   * Índice más avanzado de las ramas
   * seleccionadas.
   */
  const indiceMaximoSeleccionado =
    useMemo(() => {
      if (
        columnasSeleccionadasIds.length ===
        0
      ) {
        return -1;
      }

      const indices =
        columnasSeleccionadasIds
          .map((id) =>
            columnas.findIndex(
              (columna) =>
                columna.id === id
            )
          )
          .filter(
            (indice) => indice !== -1
          );

      if (!indices.length) {
        return -1;
      }

      return Math.max(...indices);
    }, [
      columnasSeleccionadasIds,
      columnas,
    ]);

  /*
   * El punto de reunión debe estar
   * después de todas las ramas.
   *
   * También permitimos la columna final.
   */
  const columnasReunionDisponibles =
    useMemo(() => {
      if (indiceMaximoSeleccionado < 0) {
        return [];
      }

      return columnas.filter(
        (columna, index) =>
          index >
            indiceMaximoSeleccionado &&
          !columna.esInicial
      );
    }, [
      columnas,
      indiceMaximoSeleccionado,
    ]);

    const columnasReunionPorSector =
      useMemo(() => {
        return agruparColumnasPorSector(
          columnasReunionDisponibles
        );
      }, [
        columnasReunionDisponibles,
        sectoresPorId,
      ]);

  /*
   * Elegimos automáticamente la primera
   * columna válida posterior a las ramas.
   *
   * Si el usuario ya eligió manualmente
   * una válida, la respetamos.
   */
  useEffect(() => {
    if (
      columnasSeleccionadasIds.length <
      2
    ) {
      setColumnaReunionId("");
      return;
    }

    const sigueSiendoValida =
      columnasReunionDisponibles.some(
        (columna) =>
          columna.id ===
          columnaReunionId
      );

    if (sigueSiendoValida) {
      return;
    }

    setColumnaReunionId(
      columnasReunionDisponibles[0]
        ?.id || ""
    );
  }, [
    columnasSeleccionadasIds,
    columnasReunionDisponibles,
    columnaReunionId,
  ]);

  function toggleColumna(columnaId) {
    setError("");

    setColumnasSeleccionadasIds(
      (prev) =>
        prev.includes(columnaId)
          ? prev.filter(
              (id) =>
                id !== columnaId
            )
          : [...prev, columnaId]
    );
  }

  const nombresSeleccionados =
    useMemo(() => {
      return columnasSeleccionadasIds
        .map(
          (id) =>
            columnas.find(
              (columna) =>
                columna.id === id
            )?.nombre
        )
        .filter(Boolean);
    }, [
      columnasSeleccionadasIds,
      columnas,
    ]);

  const columnaReunion =
    columnas.find(
      (columna) =>
        columna.id ===
        columnaReunionId
    ) || null;

async function eliminarVinculoCompleto() {
  if (!puedeEliminarVinculo) {
    setError(
      "No tenés permiso para eliminar vínculos de producción."
    );

    return;
  }

  try {
    setEliminandoVinculo(true);
    setError("");

    await onEliminarVinculo();
    } catch (errorEliminar) {
      console.error(
        "Error eliminando vínculo:",
        errorEliminar
      );

      setError(
        errorEliminar?.message ||
          "No se pudo eliminar el vínculo."
      );

      setConfirmandoEliminar(false);
    } finally {
      setEliminandoVinculo(false);
    }
  }  

  async function guardar() {
    if (
      columnasSeleccionadasIds.length < 2
    ) {
      setError(
        "Seleccioná al menos dos etapas."
      );
      return;
    }

    if (!columnaReunionId) {
      setError(
        "No hay un punto de reunión válido después de las etapas seleccionadas."
      );
      return;
    }

    try {
      setGuardando(true);
      setError("");

      const etapas =
        columnasSeleccionadasIds.map(
          (columnaId, index) => {
            const columna =
              columnas.find(
                (item) =>
                  item.id ===
                  columnaId
              );

            return {
              columnaProduccionId:
                columnaId,

              nombre:
                columna?.nombre ||
                `Etapa ${index + 1}`,
            };
          }
        );

    await onGuardar({
      modo,
      etapas,
      columnaReunionId,
    });
    } catch (errorGuardar) {
      console.error(
        "Error creando etapas vinculadas:",
        errorGuardar
      );

      setError(
        errorGuardar?.message ||
          "No se pudieron crear las etapas vinculadas."
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="produccion-vinculadas-overlay"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onCerrar();
        }
      }}
    >
      <div
        className="produccion-vinculadas-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="produccion-vinculadas-header">
          <div className="produccion-vinculadas-header-main">
            <div className="produccion-vinculadas-header-icon">
              <FaLink />
            </div>

            <div>
              <span className="produccion-vinculadas-kicker">
                Producción vinculada
              </span>

            <h3>
              {modo === "editar"
                ? "Editar etapas vinculadas"
                : "Crear etapas vinculadas"}
            </h3>

              <p>
                Pedido{" "}
                <strong>
                  #
                  {pedido?.id ||
                    pedido?.numeroPedido ||
                    pedido?.numero ||
                    ""}
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            className="produccion-vinculadas-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            <FaTimes />
          </button>
        </div>

        <div className="produccion-vinculadas-body">

          {columnasDisponiblesSinSector.length >
            0 && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px 12px",
                borderRadius: "9px",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                fontSize: "12px",
                lineHeight: 1.45,
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "12px",
              }}
            >
              <div>
                <strong>
                  Hay etapas sin sector asignado.
                </strong>

                <div
                  style={{
                    marginTop: "2px",
                  }}
                >
                  Podés crear el vínculo igualmente,
                  pero organizar los sectores mejora
                  la visualización del flujo.
                </div>
              </div>

              <button
                type="button"
                className="produccion-vinculadas-btn secundario"
                onClick={onConfigurarSectores}
              >
                Configurar sectores
              </button>
            </div>
          )}

          <div className="produccion-vinculadas-contenido">

            {/* ==============================
                IZQUIERDA - ETAPAS
                ============================== */}
            <div className="produccion-vinculadas-etapas-panel">

              <div className="produccion-vinculadas-seccion-header">
                <div>
                  <strong>
                    ¿Qué etapas trabajarán en paralelo?
                  </strong>

               
                </div>

                <div
                  className={
                    columnasSeleccionadasIds.length >= 2
                      ? "produccion-vinculadas-contador completo"
                      : "produccion-vinculadas-contador"
                  }
                >
                  {columnasSeleccionadasIds.length}{" "}
                  seleccionadas
                </div>
              </div>

              <div className="produccion-vinculadas-etapas-scroll">
                <div className="produccion-vinculadas-sectores">
                  {columnasDisponiblesPorSector.map(
                    (grupoSector) => (
                      <div
                        key={grupoSector.id}
                        className="produccion-vinculadas-sector"
                      >
                        <div className="produccion-vinculadas-sector-titulo">
                          {grupoSector.nombre}
                        </div>

                        <div className="produccion-vinculadas-columnas">
                          {grupoSector.columnas.map(
                            (columna) => {
                              const seleccionada =
                                columnasSeleccionadasIds.includes(
                                  columna.id
                                );

                              return (
                                <button
                                  key={columna.id}
                                  type="button"
                                  className={
                                    seleccionada
                                      ? "produccion-vinculadas-etapa seleccionada"
                                      : "produccion-vinculadas-etapa"
                                  }
                                  onClick={() =>
                                    toggleColumna(
                                      columna.id
                                    )
                                  }
                                >
                                  <span className="produccion-vinculadas-etapa-check">
                                    {seleccionada && (
                                      <FaCheck />
                                    )}
                                  </span>

                                  <span>
                                    {columna.nombre}
                                  </span>
                                </button>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>


            {/* ==============================
                DERECHA - REUNIÓN Y RESUMEN
                ============================== */}
            <aside className="produccion-vinculadas-lateral">

              <div className="produccion-vinculadas-reunion">
                <div className="produccion-vinculadas-reunion-titulo">
                  <strong>
                    Punto de reunión
                  </strong>

                  <span>
                    Cuando todas terminen, el pedido continúa acá.
                  </span>
                </div>

                <select
                  value={columnaReunionId}
                  disabled={
                    columnasSeleccionadasIds.length < 2
                  }
                  onChange={(event) =>
                    setColumnaReunionId(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    {columnasSeleccionadasIds.length < 2
                      ? "Primero seleccioná las etapas"
                      : "Seleccionar columna"}
                  </option>

                  {columnasReunionPorSector.map(
                    (grupoSector) => (
                      <optgroup
                        key={grupoSector.id}
                        label={grupoSector.nombre}
                      >
                        {grupoSector.columnas.map(
                          (columna) => (
                            <option
                              key={columna.id}
                              value={columna.id}
                            >
                              {columna.nombre}
                            </option>
                          )
                        )}
                      </optgroup>
                    )
                  )}
                </select>

                {columnasSeleccionadasIds.length >= 2 &&
                  columnaReunionId && (
                    <span className="produccion-vinculadas-auto">
                      Punto sugerido automáticamente. Podés cambiarlo.
                    </span>
                  )}
              </div>


              {columnasSeleccionadasIds.length >= 2 && (
                <div className="produccion-vinculadas-flujo">
                  <div className="produccion-vinculadas-flujo-ramas">
                    {nombresSeleccionados.map(
                      (nombre) => (
                        <span key={nombre}>
                          {nombre}
                        </span>
                      )
                    )}
                  </div>

                  <FaArrowRight className="produccion-vinculadas-flujo-flecha" />

                  <div className="produccion-vinculadas-flujo-reunion">
                    <span>
                      Continúa en
                    </span>

                    <strong>
                      {columnaReunion?.nombre ||
                        "Seleccionar"}
                    </strong>
                  </div>
                </div>
              )}

            </aside>

          </div>

          {error && (
            <div className="produccion-vinculadas-error">
              {error}
            </div>
          )}
        </div>

        <div className="produccion-vinculadas-footer">

          {modo === "editar" &&
            puedeEliminarVinculo && (
            !confirmandoEliminar ? (
              <button
                type="button"
                className="produccion-vinculadas-btn secundario"
                onClick={() =>
                  setConfirmandoEliminar(true)
                }
                disabled={
                  guardando ||
                  eliminandoVinculo
                }
                style={{
                  marginRight: "auto",
                  color: "#b91c1c",
                }}
              >
                Eliminar vínculo
              </button>
            ) : (
              <div
                style={{
                  marginRight: "auto",
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "#b91c1c",
                  }}
                >
                  ¿Eliminar vínculo?
                </span>

                <button
                  type="button"
                  className="produccion-vinculadas-btn secundario"
                  onClick={() =>
                    setConfirmandoEliminar(false)
                  }
                  disabled={eliminandoVinculo}
                >
                  No
                </button>

                <button
                  type="button"
                  className="produccion-vinculadas-btn secundario"
                  onClick={
                    eliminarVinculoCompleto
                  }
                  disabled={eliminandoVinculo}
                  style={{
                    color: "#b91c1c",
                  }}
                >
                  {eliminandoVinculo
                    ? "Eliminando..."
                    : "Sí, eliminar"}
                </button>
              </div>
            )
          )}

          <button
            type="button"
            className="produccion-vinculadas-btn secundario"
            onClick={onCerrar}
            disabled={
              guardando ||
              eliminandoVinculo
            }
          >
            Cancelar
          </button>

          <button
            type="button"
            className="produccion-vinculadas-btn principal"
            onClick={guardar}
            disabled={
              guardando ||
              columnasSeleccionadasIds
                .length < 2 ||
              !columnaReunionId
            }
          >
        {guardando
          ? modo === "editar"
            ? "Guardando..."
            : "Creando..."
          : modo === "editar"
          ? `Guardar cambios${
              columnasSeleccionadasIds.length >= 2
                ? ` (${columnasSeleccionadasIds.length})`
                : ""
            }`
          : `Crear vínculo${
              columnasSeleccionadasIds.length >= 2
                ? ` (${columnasSeleccionadasIds.length})`
                : ""
            }`}
          </button>
        </div>
      </div>
    </div>
  );
}