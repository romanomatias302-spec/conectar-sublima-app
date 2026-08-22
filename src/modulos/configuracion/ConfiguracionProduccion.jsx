import { useEffect, useMemo, useState } from "react";
import {
  FaEdit,
  FaExchangeAlt,
  FaIndustry,
  FaInfoCircle,
  FaPlus,
  FaTrash,
} from "react-icons/fa";

import SearchableSelect from "../../comunes/componentes/SearchableSelect";


import {
  actualizarSectorProduccion,
  crearSectorProduccion,
  desactivarSectorProduccion,
  escucharSectoresProduccion,
} from "../../firebase/produccionSectores";

import {
  escucharColumnasProduccion,
  moverColumnaASectorProduccion,
  validarContinuidadSectoresProduccion,
} from "../../firebase/produccionColumnas";

import "./ConfiguracionProduccion.css";

function InfoTooltip({ texto }) {
  return (
    <span className="config-produccion-info-tooltip-wrap">
      <button
        type="button"
        className="config-produccion-info-tooltip-trigger"
        aria-label="Ver información"
      >
        <FaInfoCircle />
      </button>

      <span className="config-produccion-info-tooltip-box">
        {texto}
      </span>
    </span>
  );
}

export default function ConfiguracionProduccion({
  perfil,
}) {
  const [sectores, setSectores] = useState([]);
  const [columnas, setColumnas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [mostrarNuevoSector, setMostrarNuevoSector] =
    useState(false);

  const [nombreNuevoSector, setNombreNuevoSector] =
    useState("");

  const [sectorEditando, setSectorEditando] =
    useState(null);

  const [nombreSectorEditando, setNombreSectorEditando] =
    useState("");

  const [guardandoSector, setGuardandoSector] =
    useState(false);

  const [columnaMoviendo, setColumnaMoviendo] =
    useState(null);

  const [sectorDestinoId, setSectorDestinoId] =
    useState("");



  const [guardandoMovimiento, setGuardandoMovimiento] =
    useState(false);

  const puedeGestionar =
    perfil?.rol === "admin" ||
    perfil?.rol === "superadmin" ||
    perfil?.permisos?.produccion
      ?.gestionarColumnas === true;

  useEffect(() => {
    if (!perfil?.clienteId) return undefined;

    let unsubscribeSectores = null;
    let unsubscribeColumnas = null;

    setLoading(true);

    unsubscribeSectores =
      escucharSectoresProduccion(
        perfil.clienteId,
        (lista) => {
          setSectores(lista || []);
          setLoading(false);
        }
      );

unsubscribeColumnas =
  escucharColumnasProduccion(
    perfil.clienteId,
    (lista) => {
      setColumnas(lista || []);
    }
  );

    return () => {
      unsubscribeSectores?.();
      unsubscribeColumnas?.();
    };
  }, [perfil?.clienteId]);

  const columnasIntermedias = useMemo(() => {
    return [...columnas]
      .filter(
        (columna) =>
          columna.activo !== false &&
          !columna.esInicial &&
          !columna.esFinal
      )
      .sort(
        (a, b) =>
          Number(a.orden || 0) -
          Number(b.orden || 0)
      );
  }, [columnas]);

  const validacionContinuidad = useMemo(() => {
    return validarContinuidadSectoresProduccion(
      columnasIntermedias
    );
  }, [columnasIntermedias]);

  const opcionesSectores = useMemo(() => {
    return sectores.map((sector) => ({
      value: sector.id,
      label: sector.nombre,
    }));
  }, [sectores]);

  const columnasSinSector = useMemo(() => {
    return columnasIntermedias.filter(
      (columna) => !columna.sectorId
    );
  }, [columnasIntermedias]);

const sectoresOrdenadosPorFlujo = useMemo(() => {
  const sectoresConColumnas = [];
  const sectoresSinColumnas = [];

  sectores.forEach((sector) => {
    const columnasOrdenadas = columnasIntermedias
      .filter(
        (columna) =>
          String(columna.sectorId || "") ===
          String(sector.id)
      )
      .sort(
        (a, b) =>
          Number(a.orden ?? 0) -
          Number(b.orden ?? 0)
      );

    const sectorNormalizado = {
      ...sector,
      columnasOrdenadas,
      primeraPosicionFlujo:
        columnasOrdenadas.length > 0
          ? Number(columnasOrdenadas[0].orden ?? 0)
          : null,
    };

    if (columnasOrdenadas.length > 0) {
      sectoresConColumnas.push(sectorNormalizado);
    } else {
      sectoresSinColumnas.push(sectorNormalizado);
    }
  });

  sectoresConColumnas.sort(
    (a, b) =>
      Number(a.primeraPosicionFlujo ?? 0) -
      Number(b.primeraPosicionFlujo ?? 0)
  );

  sectoresSinColumnas.sort(
    (a, b) =>
      Number(a.orden ?? 0) -
      Number(b.orden ?? 0)
  );

  return [
    ...sectoresConColumnas,
    ...sectoresSinColumnas,
  ];
}, [sectores, columnasIntermedias]);

  function obtenerColumnasSector(sectorId) {
    return columnasIntermedias.filter(
      (columna) =>
        String(columna.sectorId || "") ===
        String(sectorId)
    );
  }

  function cerrarMensajes() {
    setMensaje("");
    setError("");
  }

  async function manejarCrearSector() {
    try {
      const nombre = String(
        nombreNuevoSector || ""
      ).trim();

      if (!nombre) {
        setError(
          "Ingresá un nombre para el sector."
        );
        return;
      }

      if (!perfil?.clienteId) return;

      setGuardandoSector(true);
      cerrarMensajes();

      const ultimoOrden = Math.max(
        0,
        ...sectores.map((sector) =>
          Number(sector.orden || 0)
        )
      );

      await crearSectorProduccion({
        clienteId: perfil.clienteId,
        nombre,
        orden: ultimoOrden + 1000,
      });

      setNombreNuevoSector("");
      setMostrarNuevoSector(false);
      setMensaje("Sector creado correctamente.");
    } catch (errorCreacion) {
      console.error(errorCreacion);

      setError(
        errorCreacion?.message ||
          "No se pudo crear el sector."
      );
    } finally {
      setGuardandoSector(false);
    }
  }

  async function manejarGuardarSectorEditado() {
    try {
      const nombre = String(
        nombreSectorEditando || ""
      ).trim();

      if (!sectorEditando?.id || !nombre) return;

      setGuardandoSector(true);
      cerrarMensajes();

      await actualizarSectorProduccion({
        sectorId: sectorEditando.id,
        nombre,
      });

      setSectorEditando(null);
      setNombreSectorEditando("");
      setMensaje(
        "Sector actualizado correctamente."
      );
    } catch (errorEdicion) {
      console.error(errorEdicion);

      setError(
        errorEdicion?.message ||
          "No se pudo actualizar el sector."
      );
    } finally {
      setGuardandoSector(false);
    }
  }

  async function manejarEliminarSector(sector) {
    try {
      if (!perfil?.clienteId || !sector?.id) return;

      const columnasSector =
        obtenerColumnasSector(sector.id);

      if (columnasSector.length > 0) {
        setError(
          `El sector "${sector.nombre}" todavía tiene columnas asignadas. Primero movelas a otro sector o dejalas sin sector.`
        );
        return;
      }

      const confirmar = window.confirm(
        `¿Querés eliminar el sector "${sector.nombre}"?`
      );

      if (!confirmar) return;

      cerrarMensajes();

      await desactivarSectorProduccion({
        clienteId: perfil.clienteId,
        sectorId: sector.id,
      });

      setMensaje("Sector eliminado correctamente.");
    } catch (errorEliminacion) {
      console.error(errorEliminacion);

      setError(
        errorEliminacion?.message ||
          "No se pudo eliminar el sector."
      );
    }
  }

function abrirMovimientoColumna(columna) {
  cerrarMensajes();

  setColumnaMoviendo(columna);
  setSectorDestinoId(columna?.sectorId || "");
}

function cerrarMovimientoColumna() {
  setColumnaMoviendo(null);
  setSectorDestinoId("");
}

  async function manejarMoverColumnaASector() {
    try {
      if (
        !perfil?.clienteId ||
        !columnaMoviendo?.id
      ) {
        return;
      }

      setGuardandoMovimiento(true);
      cerrarMensajes();

    await moverColumnaASectorProduccion({
    clienteId: perfil.clienteId,
    columnaId: columnaMoviendo.id,
    sectorId: sectorDestinoId || "",
    });

      cerrarMovimientoColumna();

      setMensaje(
        sectorDestinoId
          ? "La columna se movió al sector seleccionado."
          : "La columna quedó sin sector."
      );
    } catch (errorMovimiento) {
      console.error(errorMovimiento);

      setError(
        errorMovimiento?.message ||
          "No se pudo mover la columna."
      );
    } finally {
      setGuardandoMovimiento(false);
    }
  }

  if (loading) {
    return (
      <div>
        Cargando configuración de producción...
      </div>
    );
  }

  return (
    <div className="config-produccion">
      <div className="config-produccion-header">
        <div>
          <div className="config-produccion-titulo-con-info">
            <h2>
              <FaIndustry />
              Configuración de producción
            </h2>

            <InfoTooltip texto="Organizá las columnas del flujo en sectores de trabajo." />
          </div>
        </div>

        {puedeGestionar && (
          <button
            type="button"
            className="config-produccion-btn-primary"
            onClick={() => {
              cerrarMensajes();
              setNombreNuevoSector("");
              setMostrarNuevoSector(true);
            }}
          >
            <FaPlus />
            Nuevo sector
          </button>
        )}
      </div>

      {!validacionContinuidad.valido && (
        <div className="config-produccion-error">
          Hay sectores cuyas columnas no están agrupadas
          de forma consecutiva. Mové sus columnas para
          corregir el flujo antes de activar la vista por
          sectores.
        </div>
      )}

      {mensaje && (
        <div className="config-produccion-mensaje">
          {mensaje}
        </div>
      )}

      {error && (
        <div className="config-produccion-error">
          {error}
        </div>
      )}

      <div className="config-produccion-resumen">
        <div>
          <strong>{sectores.length}</strong>
          <span>Sectores</span>
        </div>

        <div>
          <strong>{columnasIntermedias.length}</strong>
          <span>Columnas productivas</span>
        </div>

        <div>
          <strong>{columnasSinSector.length}</strong>
          <span>Sin sector</span>
        </div>
      </div>

<section className="config-produccion-zona-sectores">
  <div className="config-produccion-zona-header">
  <div>
    <span className="config-produccion-zona-kicker">
      Flujo productivo
    </span>

    <div className="config-produccion-titulo-con-info config-produccion-titulo-con-info-secundario">
      <h3>Sectores de producción</h3>

      <InfoTooltip texto="Los sectores se muestran según el orden real de sus columnas dentro del tablero." />
    </div>
  </div>

    <span className="config-produccion-zona-contador">
      {sectoresOrdenadosPorFlujo.length}
    </span>
  </div>

  <div className="config-produccion-flujo">
    {sectoresOrdenadosPorFlujo.length === 0 ? (
      <div className="config-produccion-flujo-vacio">
        Todavía no hay sectores configurados.
      </div>
    ) : (
      sectoresOrdenadosPorFlujo.map(
        (sector, sectorIndex) => {
          const columnasSector =
            sector.columnasOrdenadas || [];

          const tieneColumnas =
            columnasSector.length > 0;

          return (
            <div
              key={sector.id}
              className={`config-produccion-flujo-item ${
                tieneColumnas
                  ? ""
                  : "sector-vacio"
              }`}
            >
              <div className="config-produccion-flujo-eje">
                <span className="config-produccion-flujo-numero">
                  {sectorIndex + 1}
                </span>

                {sectorIndex <
                  sectoresOrdenadosPorFlujo.length -
                    1 && (
                  <span className="config-produccion-flujo-linea" />
                )}
              </div>

              <article className="config-produccion-sector-card">
                <div className="config-produccion-sector-header">
                  <div className="config-produccion-sector-identidad">
                    <span className="config-produccion-sector-etiqueta">
                      Sector {sectorIndex + 1}
                    </span>

                    <h3>{sector.nombre}</h3>

                    <div className="config-produccion-sector-meta">
                      <span>
                        {columnasSector.length} etapa
                        {columnasSector.length === 1
                          ? ""
                          : "s"}
                      </span>

                      {tieneColumnas && (
                        <>
                          <span className="config-produccion-meta-separador">
                            •
                          </span>

                          <span>
                            Desde{" "}
                            {columnasSector[0]?.nombre ||
                              "Sin definir"}
                          </span>

                          <span className="config-produccion-meta-separador">
                            →
                          </span>

                          <span>
                            {columnasSector[
                              columnasSector.length - 1
                            ]?.nombre || "Sin definir"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {puedeGestionar && (
                    <div className="config-produccion-sector-actions">
                      <button
                        type="button"
                        title="Renombrar sector"
                        onClick={() => {
                          cerrarMensajes();
                          setSectorEditando(sector);
                          setNombreSectorEditando(
                            sector.nombre || ""
                          );
                        }}
                      >
                        <FaEdit />
                      </button>

                      <button
                        type="button"
                        className="eliminar"
                        title="Eliminar sector"
                        onClick={() =>
                          manejarEliminarSector(sector)
                        }
                      >
                        <FaTrash />
                      </button>
                    </div>
                  )}
                </div>

                <div className="config-produccion-columnas-list">
                  {!tieneColumnas ? (
                    <div className="config-produccion-empty config-produccion-empty-sector">
                      <span>Sector sin etapas</span>

                      <small>
                        Asignale una columna existente o creá
                        una nueva columna desde Producción.
                      </small>
                    </div>
                  ) : (
                    columnasSector.map(
                      (columna, index) => (
                        <div
                          key={columna.id}
                          className="config-produccion-columna-row"
                        >
                          <div className="config-produccion-columna-info">
                            <span className="config-produccion-columna-orden">
                              {index + 1}
                            </span>

                            <div className="config-produccion-columna-textos">
                              <span>{columna.nombre}</span>

                              <small>
                                Etapa {index + 1} de{" "}
                                {columnasSector.length}
                              </small>
                            </div>
                          </div>

                          {puedeGestionar && (
                            <button
                              type="button"
                              className="config-produccion-mover-btn"
                              onClick={() =>
                                abrirMovimientoColumna(
                                  columna
                                )
                              }
                            >
                              <FaExchangeAlt />
                              Mover
                            </button>
                          )}
                        </div>
                      )
                    )
                  )}
                </div>
              </article>
            </div>
          );
        }
      )
    )}
  </div>
</section>

<section className="config-produccion-zona-sin-sector">
  <div className="config-produccion-zona-sin-sector-header">
    <div>
      <span className="config-produccion-zona-kicker">
        Fuera del organigrama
      </span>

      <h3>Columnas sin sector</h3>

      <p>
        Estas etapas continúan funcionando en Producción,
        pero todavía no pertenecen a ningún sector.
      </p>
    </div>

    <span className="config-produccion-zona-sin-sector-contador">
      {columnasSinSector.length}
    </span>
  </div>

  <div className="config-produccion-sin-sector-contenido">
    {columnasSinSector.length === 0 ? (
      <div className="config-produccion-empty config-produccion-empty-completo">
        Todas las columnas productivas se encuentran
        organizadas dentro de sectores.
      </div>
    ) : (
      <div className="config-produccion-columnas-sin-sector-grid">
        {columnasSinSector.map((columna, index) => (
          <div
            key={columna.id}
            className="config-produccion-columna-row config-produccion-columna-row-sin-sector"
          >
            <div className="config-produccion-columna-info">
              <span className="config-produccion-columna-orden config-produccion-columna-orden-neutro">
                {index + 1}
              </span>

              <div className="config-produccion-columna-textos">
                <span>{columna.nombre}</span>

                <small>
                  Sin agrupación sectorial
                </small>
              </div>
            </div>

            {puedeGestionar && (
              <button
                type="button"
                className="config-produccion-mover-btn"
                onClick={() =>
                  abrirMovimientoColumna(columna)
                }
              >
                <FaExchangeAlt />
                Asignar
              </button>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
</section>

        {columnaMoviendo && (
        <div
            className="config-produccion-modal-overlay"
            onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                cerrarMovimientoColumna();
            }
            }}
        >
          <div
            className="config-produccion-modal"
            onMouseDown={(event) => event.stopPropagation()}

          >
            <div className="config-produccion-modal-header">
              <div>
                <h3>Cambiar sector</h3>

                <p>
                  Columna: {columnaMoviendo.nombre}
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarMovimientoColumna}
              >
                ×
              </button>
            </div>

            <div className="config-produccion-modal-body">
              <label>Sector destino</label>

              <SearchableSelect
                value={sectorDestinoId}
                onChange={(nuevoSectorId) => {
                 setSectorDestinoId(nuevoSectorId);
                }}
                placeholder="Seleccionar sector"
                searchPlaceholder="Buscar sector..."
                allowClear
                clearLabel="Sin sector"
                options={opcionesSectores}
              />

                <div className="config-produccion-movimiento-info">
                La columna conservará su posición actual dentro del flujo
                de Producción. Sólo cambiará el sector al que pertenece.
                </div>
            </div>

            <div className="config-produccion-modal-footer">
              <button
                type="button"
                className="cancelar"
                onClick={cerrarMovimientoColumna}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="guardar"
                onClick={manejarMoverColumnaASector}
                disabled={guardandoMovimiento}
              >
                {guardandoMovimiento
                  ? "Moviendo..."
                  : "Guardar cambio"}
              </button>
            </div>
          </div>
        </div>
      )}

        {mostrarNuevoSector && (
        <div
            className="config-produccion-modal-overlay"
            onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                setMostrarNuevoSector(false);
                setNombreNuevoSector("");
            }
            }}
        >
          <div 
            className="config-produccion-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="config-produccion-modal-header">
              <div>
                <h3>Nuevo sector</h3>
                <p>Se agregará al final del flujo.</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMostrarNuevoSector(false)
                }
              >
                ×
              </button>
            </div>

            <div className="config-produccion-modal-body">
              <label>Nombre</label>

              <input
                type="text"
                value={nombreNuevoSector}
                onChange={(event) =>
                  setNombreNuevoSector(
                    event.target.value
                  )
                }
                placeholder="Ej: Diseño o Confección"
                autoFocus
              />
            </div>

            <div className="config-produccion-modal-footer">
              <button
                type="button"
                className="cancelar"
                onClick={() =>
                  setMostrarNuevoSector(false)
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="guardar"
                onClick={manejarCrearSector}
                disabled={
                  guardandoSector ||
                  !nombreNuevoSector.trim()
                }
              >
                {guardandoSector
                  ? "Creando..."
                  : "Crear sector"}
              </button>
            </div>
          </div>
        </div>
      )}

        {sectorEditando && (
        <div
            className="config-produccion-modal-overlay"
            onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                setSectorEditando(null);
                setNombreSectorEditando("");
            }
            }}
        >
          <div 
           className="config-produccion-modal"
           onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="config-produccion-modal-header">
              <div>
                <h3>Renombrar sector</h3>
                <p>Las columnas no se modificarán.</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSectorEditando(null)
                }
              >
                ×
              </button>
            </div>

            <div className="config-produccion-modal-body">
              <label>Nombre</label>

              <input
                type="text"
                value={nombreSectorEditando}
                onChange={(event) =>
                  setNombreSectorEditando(
                    event.target.value
                  )
                }
                autoFocus
              />
            </div>

            <div className="config-produccion-modal-footer">
              <button
                type="button"
                className="cancelar"
                onClick={() =>
                  setSectorEditando(null)
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="guardar"
                onClick={
                  manejarGuardarSectorEditado
                }
                disabled={
                  guardandoSector ||
                  !nombreSectorEditando.trim()
                }
              >
                {guardandoSector
                  ? "Guardando..."
                  : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}