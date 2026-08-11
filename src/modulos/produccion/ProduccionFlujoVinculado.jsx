import { createPortal } from "react-dom";

import {
  FaCheck,
  FaLink,
  FaMapMarkerAlt,
  FaTimes,
} from "react-icons/fa";


function obtenerNombreColumna(
  columnaId,
  columnas = []
) {
  if (!columnaId) {
    return "Sin ubicación";
  }

  return (
    columnas.find(
      (columna) =>
        String(columna.id) ===
        String(columnaId)
    )?.nombre || "Sin ubicación"
  );
}


function obtenerRamasFlujo(
  flujo,
  columnas
) {
  const ramas =
    Array.isArray(flujo?.ramas)
      ? flujo.ramas
      : [];

  return ramas.map((rama) => ({
    ...rama,

    origenNombre:
      rama.nombre ||
      "Etapa vinculada",

    ubicacionNombre:
      obtenerNombreColumna(
        rama.columnaProduccionId,
        columnas
      ),

    finalizada:
      rama.estado === "lista",
  }));
}


function ContenidoFlujo({
  flujo,
  columnas = [],
  compacto = false,
}) {
  const ramas =
    obtenerRamasFlujo(
      flujo,
      columnas
    );

  const total =
    Number(
      flujo?.totalEtapas ||
        ramas.length ||
        0
    );

  const finalizadas =
    ramas.filter(
      (rama) => rama.finalizada
    ).length;

  const faltan =
    Math.max(
      0,
      total - finalizadas
    );

  const reunionNombre =
    obtenerNombreColumna(
      flujo?.columnaReunionId,
      columnas
    );

  return (
    <>
      <div className="produccion-flujo-resumen">
        <div className="produccion-flujo-resumen-cantidad">
          <strong>
            {finalizadas} de {total}
          </strong>

          <span>
            finalizadas
          </span>
        </div>

        <span
          className={`produccion-flujo-pendientes ${
            faltan === 0
              ? "completo"
              : ""
          }`}
        >
          {faltan === 0
            ? "Todas listas"
            : `${faltan} pendiente${
                faltan === 1 ? "" : "s"
              }`}
        </span>
      </div>

      <div className="produccion-flujo-ramas">
        {ramas.map((rama) => (
          <div
            key={rama.id}
            className={`produccion-flujo-rama ${
              rama.finalizada
                ? "finalizada"
                : "activa"
            }`}
          >
            <div className="produccion-flujo-rama-estado">
              {rama.finalizada ? (
                <FaCheck />
              ) : (
                <span />
              )}
            </div>

            <div className="produccion-flujo-rama-contenido">
              <div className="produccion-flujo-rama-cabecera">
                <strong>
                  {rama.origenNombre}
                </strong>

                <span>
                  {rama.finalizada
                    ? "Finalizada"
                    : "En curso"}
                </span>
              </div>

              {!rama.finalizada && (
                <div className="produccion-flujo-rama-ubicacion">
                  <FaMapMarkerAlt />

                  <span>
                    Ahora en{" "}
                    <strong>
                      {
                        rama.ubicacionNombre
                      }
                    </strong>
                  </span>
                </div>
              )}

              {rama.finalizada &&
                rama.listaPorNombre && (
                  <div className="produccion-flujo-rama-responsable">
                    Finalizada por{" "}
                    <strong>
                      {
                        rama.listaPorNombre
                      }
                    </strong>
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>

      <div className="produccion-flujo-reunion">
        <div className="produccion-flujo-reunion-icono">
          <FaLink />
        </div>

        <div>
          <span>
            Punto de reunión
          </span>

          <strong>
            {reunionNombre}
          </strong>
        </div>
      </div>

      {!compacto && (
        <p className="produccion-flujo-explicacion">
          Las ramas continúan de forma
          independiente hasta que todas
          sean finalizadas.
        </p>
      )}
    </>
  );
}


/* ==========================================
   MINI MAPA
   ========================================== */

export function ProduccionFlujoPreview({
  flujo,
  columnas = [],
  posicion = null,
}) {
  if (!flujo || !posicion) {
    return null;
  }

  return createPortal(
    <div
        className="produccion-flujo-preview"
        style={{
        top: posicion.top,
        left: posicion.left,
        }}
    >
        <div className="produccion-flujo-preview-cabecera">
        <div className="produccion-flujo-preview-icono">
            <FaLink />
        </div>

        <div>
            <strong>
            Producción vinculada
            </strong>

            <span>
            Estado del flujo
            </span>
        </div>
        </div>

        <ContenidoFlujo
        flujo={flujo}
        columnas={columnas}
        compacto
        />
    </div>,
    document.body
    );
}


/* ==========================================
   MAPA COMPLETO
   ========================================== */

export default function ProduccionFlujoVinculado({
  pedido,
  columnas = [],
  onCerrar = () => {},
}) {
  const flujo =
    pedido?.produccionFlujoVinculado;

  if (!flujo) {
    return null;
  }

  const numeroPedido =
    pedido?.id ||
    pedido?.numeroPedido ||
    pedido?.numero ||
    "S/N";

  return (
    <div
      className="produccion-flujo-modal-overlay"
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
        className="produccion-flujo-modal"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="produccion-flujo-modal-header">
          <div className="produccion-flujo-modal-titulo">
            <div className="produccion-flujo-modal-icono">
              <FaLink />
            </div>

            <div>
              <span>
                Producción vinculada
              </span>

              <h3>
                Flujo del pedido
              </h3>

              <p>
                Pedido #{numeroPedido}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="produccion-flujo-modal-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            <FaTimes />
          </button>
        </div>

        <div className="produccion-flujo-modal-body">
          <ContenidoFlujo
            flujo={flujo}
            columnas={columnas}
          />
        </div>
      </div>
    </div>
  );
}