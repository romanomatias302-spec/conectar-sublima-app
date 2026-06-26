import { useEffect, useRef, useState } from "react";
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
      className={`produccion-column ${estaContraida ? "contraida" : ""} ${resaltada ? "drop-confirmado" : ""} ${ordenManualActivo ? "orden-manual-activo" : ""}`}
      style={{
        background: "#f6f7f9",
        borderColor: "#d9dee8",
      }}
    >
      <div className="produccion-column-header">
        <div className="produccion-column-header-main">
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
          pedidosVisibles.map((pedido, index) => (
        <ProduccionCard
          key={pedido.firebaseId || pedido.id}
          pedido={pedido}
          columnas={columnas}
          onVerPedido={onVerPedido}
          onEditarDetalleManual={onEditarDetalleManual}
          onMoverPedido={onMoverPedido}
          ordenManualActivo={
            columna.ordenManualActivo === true || columna.tipoOrden === "manual"
          }
          indiceOrdenManual={index + 1}
          onCambiarColorTarjeta={onCambiarColorTarjeta}
          ahoraTick={ahoraTick}
          puedeMoverPedidos={puedeMoverPedidos}
          puedeEditarDetalleManual={puedeEditarDetalleManual}
          resaltadaNuevoPedido={
            pedidoNuevoResaltadoId &&
            (pedido.firebaseId || pedido.id) === pedidoNuevoResaltadoId
          }
        />
          ))}
          {!estaContraida && cantidadOculta > 0 && (
            <div className="produccion-column-limite-info">
              Mostrando últimos {LIMITE_FINALIZADOS_VISIBLES}. Hay {cantidadOculta} finalizados más.
            </div>
          )}
      </div>
    </div>
  );
}