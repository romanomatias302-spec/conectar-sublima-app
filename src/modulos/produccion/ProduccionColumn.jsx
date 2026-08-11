import { useEffect, useRef, useState, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import ProduccionCard from "./ProduccionCard";



export default function ProduccionColumn({
  columna,
  columnas = [],
  pedidos = [],
  onVerPedido,
  onEditarColumna,
  onEliminarColumna,
  columnaEditandoId,
  nombreEditarColumna,
  setNombreEditarColumna,
  onGuardarEdicionColumna,
  guardandoEdicionColumna,
  eliminandoColumnaId,
  estaContraida = false,
  onToggleContraer,
  onEditarDetalleManual,
  onGestionarEtapaVinculada,
  onMoverPedido,
  onCambiarColorTarjeta,
  puedeGestionarColumnas = false,
  onMoverColumna,
  onToggleOrdenManualColumna,
  puedeMoverIzquierda = false,
  puedeMoverDerecha = false,
  ahoraTick,
  puedeMoverPedidos = true,
  puedeEditarDetalleManual = true,
  resaltada = false,
  pedidoNuevoResaltadoId = null,
  puedeGestionarOrdenManual = false,
  sectorNombre = "",
  sectorSeleccionadoNombre = "",
  perteneceSectorSeleccionado = false,
  esContextoEntrada = false,
  esContextoSalida = false,

}) {
  const { setNodeRef } = useDroppable({
    id: columna.id,
    data: {
      columnaId: columna.id,
    },
    disabled: !puedeMoverPedidos,
  });

  const esEditando = columnaEditandoId === columna.id;
  const sePuedeEliminar = !columna.esInicial && !columna.esFinal;
  const [menuColumnaAbierto, setMenuColumnaAbierto] = useState(false);
  const [menuColumnaPos, setMenuColumnaPos] = useState({ top: 0, left: 0 });
  const menuColumnaRef = useRef(null);

  const ordenManualActivo =
    columna.ordenManualActivo === true || columna.tipoOrden === "manual";

    const LIMITE_FINALIZADOS_VISIBLES = 40;

const esColumnaFinal = columna.esFinal === true;

const pedidosVisibles =
  esColumnaFinal && !estaContraida
    ? pedidos.slice(0, LIMITE_FINALIZADOS_VISIBLES)
    : pedidos;

const bloquesPedidosVisibles = useMemo(() => {
  const lista = Array.isArray(pedidosVisibles)
    ? pedidosVisibles
    : [];

  const usados = new Set();
  const bloquesBase = [];

  function obtenerRepresentacionId(pedido) {
    const pedidoId =
      pedido?.pedidoFirebaseId ||
      pedido?.firebaseId ||
      pedido?.id ||
      "";

    return String(
      pedido?.produccionRepresentacionId ||
        `principal:${pedidoId}`
    );
  }

  lista.forEach((pedido) => {
    const representacionId =
      obtenerRepresentacionId(pedido);

    if (
      !representacionId ||
      usados.has(representacionId)
    ) {
      return;
    }

    const esVinculada =
      pedido?.produccionRepresentacionTipo ===
      "vinculada";

    const grupoId = String(
      pedido?.produccionGrupoVinculadoId || ""
    );

    /*
     * Si es una rama vinculada,
     * buscamos otras ramas DEL MISMO GRUPO
     * que actualmente estén en esta misma columna.
     *
     * Como ProduccionColumn ya recibe solamente
     * las cards de esta columna, no necesitamos
     * volver a comprobar columnaProduccionId.
     */
    if (esVinculada && grupoId) {
      const hermanas = lista.filter((item) => {
        const itemRepresentacionId =
          obtenerRepresentacionId(item);

        if (
          !itemRepresentacionId ||
          usados.has(itemRepresentacionId)
        ) {
          return false;
        }

        return (
          item?.produccionRepresentacionTipo ===
            "vinculada" &&
          String(
            item?.produccionGrupoVinculadoId || ""
          ) === grupoId
        );
      });

      /*
       * Sólo creamos grupo visual cuando
       * realmente coinciden 2 o más ramas.
       */
      if (hermanas.length > 1) {
        hermanas.forEach((item) => {
          usados.add(
            obtenerRepresentacionId(item)
          );
        });

        bloquesBase.push({
          tipo: "grupo-vinculado",
          grupoId,
          items: hermanas,
        });

        return;
      }
    }

    usados.add(representacionId);

    bloquesBase.push({
      tipo: "simple",
      grupoId: grupoId || "",
      items: [pedido],
    });
  });

  /*
   * Recalculamos el índice visual después
   * de agrupar.
   *
   * Esto es importante para que el número
   * de orden manual siga coincidiendo con
   * la posición que el usuario ve.
   */
  let indiceVisual = 0;

  return bloquesBase.map((bloque) => ({
    ...bloque,

    items: bloque.items.map((pedido) => {
      indiceVisual += 1;

      return {
        pedido,
        indiceVisual,
      };
    }),
  }));
}, [pedidosVisibles]);    

const cantidadOculta =
  esColumnaFinal && pedidos.length > LIMITE_FINALIZADOS_VISIBLES
    ? pedidos.length - LIMITE_FINALIZADOS_VISIBLES
    : 0;

useEffect(() => {
  function cerrarMenuColumna(e) {
    if (!menuColumnaRef.current) return;
    if (!menuColumnaRef.current.contains(e.target)) {
      setMenuColumnaAbierto(false);
    }
  }

  function cerrarPorScroll() {
    setMenuColumnaAbierto(false);
  }

  document.addEventListener("mousedown", cerrarMenuColumna);
  document.addEventListener("touchstart", cerrarMenuColumna);
  window.addEventListener("scroll", cerrarPorScroll, true);

  return () => {
    document.removeEventListener("mousedown", cerrarMenuColumna);
    document.removeEventListener("touchstart", cerrarMenuColumna);
    window.removeEventListener("scroll", cerrarPorScroll, true);
  };
}, []);

  return (
    <div
      ref={setNodeRef}
      className={[
        "produccion-column",
        estaContraida ? "contraida" : "",
        resaltada ? "drop-confirmado" : "",
        ordenManualActivo ? "orden-manual-activo" : "",
        perteneceSectorSeleccionado
          ? "sector-seleccionado"
          : "",
        esContextoEntrada
          ? "sector-contexto sector-contexto-entrada"
          : "",
        esContextoSalida
          ? "sector-contexto sector-contexto-salida"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: "#f6f7f9",
        borderColor: "#d9dee8",
      }}
    >
      <div className="produccion-column-header">
        <div className="produccion-column-header-main">
          {!estaContraida && (
            <div className="produccion-column-sector-meta">
              {esContextoEntrada ? (
                <span className="produccion-column-sector-badge contexto">
                  Entrada
                </span>
              ) : esContextoSalida ? (
                <span className="produccion-column-sector-badge contexto">
                  Salida
                </span>
              ) : sectorNombre ? (
                <span
                  className={`produccion-column-sector-badge ${
                    perteneceSectorSeleccionado
                      ? "activo"
                      : ""
                  }`}
                  title={`Sector: ${sectorNombre}`}
                >
                  {sectorNombre}
                </span>
              ) : null}

              {(esContextoEntrada || esContextoSalida) &&
                sectorSeleccionadoNombre && (
                  <span className="produccion-column-contexto-texto">
                    {sectorSeleccionadoNombre}
                  </span>
                )}
            </div>
          )}
          {esEditando && !estaContraida ? (
            <div className="produccion-columna-editar-box">
              <input
                type="text"
                value={nombreEditarColumna}
                onChange={(e) => setNombreEditarColumna(e.target.value)}
                className="produccion-columna-editar-input"
              />
              <button
                className="produccion-columna-btn-guardar"
                onClick={onGuardarEdicionColumna}
                disabled={guardandoEdicionColumna}
              >
                {guardandoEdicionColumna ? "..." : "OK"}
              </button>
            </div>
          ) : (
          <div className="produccion-column-title" title={columna.nombre}>
            <span>{columna.nombre}</span>

            {ordenManualActivo && (
              <span className="produccion-column-orden-badge">
                Orden manual
              </span>
            )}
          </div>
          )}
        </div>

        <div className="produccion-column-toolbar">
          <div className="produccion-column-count">{pedidos.length}</div>

          {!esEditando && (
            <div className="produccion-column-actions">
            <button
              className="produccion-columna-btn produccion-columna-btn-icon"
              onClick={onToggleContraer}
              title={estaContraida ? "Expandir columna" : "Contraer columna"}
            >
              {estaContraida ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 6L15 12L9 18"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M15 6L9 12L15 18"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>

              {!estaContraida && puedeGestionarColumnas && (
                <div className="produccion-columna-menu-wrap" ref={menuColumnaRef}>
                  <button
                    type="button"
                    className="produccion-columna-btn produccion-columna-menu-trigger"
                    onClick={(e) => {
                      e.stopPropagation();

                  const rect = e.currentTarget.getBoundingClientRect();
                  const anchoMenu = 230;
                  const margen = 12;

                    let left = rect.left;

                    const estaMuyPegadoALaIzquierda = rect.left < 170;

                    if (estaMuyPegadoALaIzquierda) {
                      left = 58;
                    }

                    if (left + anchoMenu > window.innerWidth - margen) {
                      left = window.innerWidth - anchoMenu - margen;
                    }

                    if (left < margen) {
                      left = margen;
                    }

                  setMenuColumnaPos({
                    top: rect.bottom + 8,
                    left,
                  });

                      setMenuColumnaAbierto((prev) => !prev);
                    }}
                    title="Opciones de columna"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="5" r="2" fill="currentColor" />
                      <circle cx="12" cy="12" r="2" fill="currentColor" />
                      <circle cx="12" cy="19" r="2" fill="currentColor" />
                    </svg>
                  </button>

                  {menuColumnaAbierto && (
                    <div
                      className="produccion-columna-menu"
                      style={{
                        top: menuColumnaPos.top,
                        left: menuColumnaPos.left,
                      }}
                    >
                  {puedeGestionarOrdenManual && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleOrdenManualColumna?.(columna);
                        setMenuColumnaAbierto(false);
                      }}
                    >
                      {ordenManualActivo ? "Desactivar orden manual" : "Activar orden manual"}
                    </button>
                  )}

                      <button
                        type="button"
                        onClick={() => {
                          onEditarColumna?.(columna);
                          setMenuColumnaAbierto(false);
                        }}
                      >
                        Renombrar columna
                      </button>

                      {!columna.esInicial && !columna.esFinal && (
                        <>
                          <button
                            type="button"
                            disabled={!puedeMoverIzquierda}
                            onClick={() => {
                              onMoverColumna?.(columna, "izquierda");
                              setMenuColumnaAbierto(false);
                            }}
                          >
                            Mover a la izquierda
                          </button>

                          <button
                            type="button"
                            disabled={!puedeMoverDerecha}
                            onClick={() => {
                              onMoverColumna?.(columna, "derecha");
                              setMenuColumnaAbierto(false);
                            }}
                          >
                            Mover a la derecha
                          </button>
                        </>
                      )}

                      {sePuedeEliminar && (
                        <button
                          type="button"
                          className="danger"
                          disabled={eliminandoColumnaId === columna.id}
                          onClick={() => {
                            onEliminarColumna?.(columna);
                            setMenuColumnaAbierto(false);
                          }}
                        >
                          {eliminandoColumnaId === columna.id ? "Eliminando..." : "Eliminar columna"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="produccion-column-body">
        {!estaContraida &&
          bloquesPedidosVisibles.map((bloque) => {
            /*
            * =====================================
            * 2 O MÁS RAMAS DEL MISMO GRUPO
            * EN ESTA COLUMNA
            * =====================================
            */
            if (
              bloque.tipo === "grupo-vinculado"
            ) {
              return (
                <div
                  key={`grupo-${columna.id}-${bloque.grupoId}`}
                  className="produccion-vinculo-stack"
                >
                  <div className="produccion-vinculo-stack-header">
                    <span className="produccion-vinculo-stack-badge">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        <path
                          d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>

                      {bloque.items.length} etapas vinculadas
                    </span>
                  </div>

                  <div className="produccion-vinculo-stack-cards">
                    {bloque.items.map(
                      ({
                        pedido,
                        indiceVisual,
                      }) => {
                        const pedidoId =
                          pedido.pedidoFirebaseId ||
                          pedido.firebaseId ||
                          pedido.id;

                        const representacionId =
                          pedido
                            .produccionRepresentacionId ||
                          `principal:${pedidoId}`;

                        return (
                          <div
                            key={
                              representacionId
                            }
                            className="produccion-vinculo-stack-item"
                          >
                            <ProduccionCard
                              pedido={pedido}
                              columnas={columnas}
                              onVerPedido={
                                onVerPedido
                              }
                              onEditarDetalleManual={
                                onEditarDetalleManual
                              }
                              onGestionarEtapaVinculada={
                                onGestionarEtapaVinculada
                              }
                              onMoverPedido={
                                onMoverPedido
                              }
                              ordenManualActivo={
                                columna.ordenManualActivo ===
                                  true ||
                                columna.tipoOrden ===
                                  "manual"
                              }
                              indiceOrdenManual={
                                indiceVisual
                              }
                              onCambiarColorTarjeta={
                                onCambiarColorTarjeta
                              }
                              ahoraTick={
                                ahoraTick
                              }
                              puedeMoverPedidos={
                                puedeMoverPedidos
                              }
                              puedeEditarDetalleManual={
                                puedeEditarDetalleManual
                              }
                              resaltadaNuevoPedido={
                                pedidoNuevoResaltadoId &&
                                (pedido.firebaseId ||
                                  pedido.id) ===
                                  pedidoNuevoResaltadoId
                              }
                            />
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              );
            }

            /*
            * =====================================
            * CARD NORMAL O RAMA SIN HERMANA
            * EN ESTA COLUMNA
            * =====================================
            */
            const {
              pedido,
              indiceVisual,
            } = bloque.items[0];

            const pedidoId =
              pedido.pedidoFirebaseId ||
              pedido.firebaseId ||
              pedido.id;

            const representacionId =
              pedido.produccionRepresentacionId ||
              `principal:${pedidoId}`;

            return (
              <ProduccionCard
                key={representacionId}
                pedido={pedido}
                columnas={columnas}
                onVerPedido={onVerPedido}
                onEditarDetalleManual={
                  onEditarDetalleManual
                }
                onGestionarEtapaVinculada={
                  onGestionarEtapaVinculada
                }
                onMoverPedido={onMoverPedido}
                ordenManualActivo={
                  columna.ordenManualActivo ===
                    true ||
                  columna.tipoOrden === "manual"
                }
                indiceOrdenManual={
                  indiceVisual
                }
                onCambiarColorTarjeta={
                  onCambiarColorTarjeta
                }
                ahoraTick={ahoraTick}
                puedeMoverPedidos={
                  puedeMoverPedidos
                }
                puedeEditarDetalleManual={
                  puedeEditarDetalleManual
                }
                resaltadaNuevoPedido={
                  pedidoNuevoResaltadoId &&
                  (pedido.firebaseId ||
                    pedido.id) ===
                    pedidoNuevoResaltadoId
                }
              />
            );
          })}
          {!estaContraida && cantidadOculta > 0 && (
            <div className="produccion-column-limite-info">
              Mostrando últimos {LIMITE_FINALIZADOS_VISIBLES}. Hay {cantidadOculta} finalizados más.
            </div>
          )}
      </div>
    </div>
  );
}