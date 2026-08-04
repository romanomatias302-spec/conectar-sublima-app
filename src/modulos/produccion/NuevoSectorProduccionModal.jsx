import {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  crearSectorProduccion,
} from "../../firebase/produccionSectores";

function NuevoSectorProduccionModal({
  abierto = false,
  clienteId = "",
  ultimoOrdenSector = 0,
  onCerrar = () => {},
  onSectorCreado = () => {},
}) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const inputRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;

    setNombre("");
    setError("");
    setGuardando(false);

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);

    return () => {
      window.clearTimeout(timer);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;

    function cerrarConEscape(event) {
      if (event.key !== "Escape") return;
      if (guardando) return;

      onCerrar();
    }

    document.addEventListener(
      "keydown",
      cerrarConEscape
    );

    return () => {
      document.removeEventListener(
        "keydown",
        cerrarConEscape
      );
    };
  }, [abierto, guardando, onCerrar]);

  if (!abierto) return null;

  function cerrarModal() {
    if (guardando) return;

    setNombre("");
    setError("");
    onCerrar();
  }

  async function manejarCrearSector() {
    try {
      const nombreLimpio = String(nombre || "").trim();

      if (!nombreLimpio) {
        setError("Ingresá un nombre para el sector.");
        return;
      }

      if (!clienteId) {
        setError(
          "No se encontró la empresa asociada."
        );
        return;
      }

      setGuardando(true);
      setError("");

      const sectorId = await crearSectorProduccion({
        clienteId,
        nombre: nombreLimpio,
        orden: Number(ultimoOrdenSector || 0) + 1000,
      });

      /*
       * El padre se actualiza una sola vez:
       * después de completar la creación.
       */
      onSectorCreado({
        id: sectorId,
        nombre: nombreLimpio,
        orden: Number(ultimoOrdenSector || 0) + 1000,
      });

      setNombre("");
      setError("");
      onCerrar();
    } catch (errorCreacion) {
      console.error(
        "Error creando sector de producción:",
        errorCreacion
      );

      setError(
        errorCreacion?.message ||
          "No se pudo crear el sector."
      );
    } finally {
      setGuardando(false);
    }
  }

  function manejarSubmit(event) {
    event.preventDefault();

    if (guardando) return;

    manejarCrearSector();
  }

  return (
    <div
      className="produccion-mini-modal-overlay produccion-sector-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          cerrarModal();
        }
      }}
    >
      <form
        className="produccion-mini-modal produccion-sector-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-nuevo-sector"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onSubmit={manejarSubmit}
      >
        <div className="produccion-mini-modal-header">
          <div>
            <h3 id="titulo-nuevo-sector">
              Nuevo sector
            </h3>

            <p>
              Los sectores agrupan columnas consecutivas
              dentro del flujo de producción.
            </p>
          </div>

          <button
            type="button"
            className="produccion-mini-modal-cerrar"
            onClick={cerrarModal}
            disabled={guardando}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="produccion-mini-modal-body">
          <div className="produccion-mini-modal-campo">
            <label htmlFor="produccion-sector-nombre">
              Nombre del sector
            </label>

            <input
              ref={inputRef}
              id="produccion-sector-nombre"
              type="text"
              value={nombre}
              onChange={(event) => {
                setNombre(event.target.value);

                if (error) {
                  setError("");
                }
              }}
              placeholder="Ej: Diseño, Impresión o Confección"
              autoComplete="off"
              maxLength={80}
              disabled={guardando}
            />
          </div>

          <div className="produccion-sector-info">
            El nuevo sector se agregará al final del flujo.
            La nueva columna quedará dentro de ese sector.
          </div>

          {error && (
            <div className="produccion-mini-modal-error">
              {error}
            </div>
          )}
        </div>

        <div className="produccion-mini-modal-footer">
          <button
            type="button"
            className="produccion-mini-modal-btn-cancelar"
            onClick={cerrarModal}
            disabled={guardando}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="produccion-mini-modal-btn-guardar"
            disabled={
              guardando ||
              !String(nombre || "").trim()
            }
          >
            {guardando
              ? "Creando..."
              : "Crear sector"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default memo(
  NuevoSectorProduccionModal
);