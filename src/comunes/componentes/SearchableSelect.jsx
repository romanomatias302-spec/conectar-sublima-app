import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCheck,
  FaChevronDown,
  FaSearch,
} from "react-icons/fa";
import "./SearchableSelect.css";

export default function SearchableSelect({
  value = "",
  options = [],
  onChange = () => {},
  placeholder = "Seleccionar",
  searchPlaceholder = "Buscar...",
  emptyText = "No se encontraron resultados.",
  disabled = false,
  allowClear = false,
  clearLabel = "Todos",
  footer = null,
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const opcionesNormalizadas = useMemo(() => {
    if (!Array.isArray(options)) return [];

    return options.filter(
      (option) =>
        option &&
        option.value !== undefined &&
        option.value !== null
    );
  }, [options]);

  const opcionSeleccionada = useMemo(() => {
    return (
      opcionesNormalizadas.find(
        (option) => String(option.value) === String(value)
      ) || null
    );
  }, [opcionesNormalizadas, value]);

  const opcionesFiltradas = useMemo(() => {
    const texto = String(busqueda || "")
      .trim()
      .toLowerCase();

    if (!texto) return opcionesNormalizadas;

    return opcionesNormalizadas.filter((option) =>
      String(option.label || "")
        .toLowerCase()
        .includes(texto)
    );
  }, [opcionesNormalizadas, busqueda]);

  useEffect(() => {
    function cerrarAlHacerClickFuera(event) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target)
      ) {
        setAbierto(false);
        setBusqueda("");
      }
    }

    function cerrarConEscape(event) {
      if (event.key === "Escape") {
        setAbierto(false);
        setBusqueda("");
      }
    }

    document.addEventListener(
      "mousedown",
      cerrarAlHacerClickFuera
    );

    document.addEventListener(
      "touchstart",
      cerrarAlHacerClickFuera
    );

    document.addEventListener(
      "keydown",
      cerrarConEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        cerrarAlHacerClickFuera
      );

      document.removeEventListener(
        "touchstart",
        cerrarAlHacerClickFuera
      );

      document.removeEventListener(
        "keydown",
        cerrarConEscape
      );
    };
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [abierto]);

  function seleccionar(nuevoValor) {
    onChange(nuevoValor);
    setAbierto(false);
    setBusqueda("");
  }

  return (
    <div
      ref={rootRef}
      className={`searchable-select ${
        abierto ? "abierto" : ""
      }`}
    >
      <button
        type="button"
        className="searchable-select-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setAbierto((prev) => !prev);
        }}
        aria-expanded={abierto}
        aria-haspopup="listbox"
      >
        <span
          className={
            opcionSeleccionada
              ? "searchable-select-value"
              : "searchable-select-placeholder"
          }
        >
          {opcionSeleccionada?.label || placeholder}
        </span>

        <FaChevronDown aria-hidden="true" />
      </button>

      {abierto && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search">
            <FaSearch aria-hidden="true" />

            <input
              ref={inputRef}
              type="text"
              value={busqueda}
              onChange={(event) =>
                setBusqueda(event.target.value)
              }
              placeholder={searchPlaceholder}
              autoComplete="off"
            />
          </div>

          <div
            className="searchable-select-options"
            role="listbox"
          >
            {allowClear && (
              <button
                type="button"
                className={
                  value === "" ||
                  value === null ||
                  value === undefined
                    ? "seleccionada"
                    : ""
                }
                onClick={() => seleccionar("")}
              >
                <span>{clearLabel}</span>

                {(value === "" ||
                  value === null ||
                  value === undefined) && (
                  <FaCheck aria-hidden="true" />
                )}
              </button>
            )}

            {opcionesFiltradas.map((option) => {
              const seleccionada =
                String(option.value) === String(value);

              return (
                <button
                  type="button"
                  key={String(option.value)}
                  className={
                    seleccionada ? "seleccionada" : ""
                  }
                  onClick={() =>
                    seleccionar(option.value)
                  }
                >
                  <span>{option.label}</span>

                  {seleccionada && (
                    <FaCheck aria-hidden="true" />
                  )}
                </button>
              );
            })}

            {opcionesFiltradas.length === 0 && (
              <div className="searchable-select-empty">
                {emptyText}
              </div>
            )}
          </div>

          {footer && (
            <div className="searchable-select-footer">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}