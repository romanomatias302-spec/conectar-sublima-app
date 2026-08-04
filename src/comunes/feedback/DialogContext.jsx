import React, {
  createContext,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";

export const DialogContext = createContext(null);

const CONFIG_VARIANTES = {
  default: {
    icono: Info,
    clase: "default",
  },
  info: {
    icono: Info,
    clase: "info",
  },
  warning: {
    icono: AlertTriangle,
    clase: "warning",
  },
  danger: {
    icono: ShieldAlert,
    clase: "danger",
  },
  success: {
    icono: CheckCircle2,
    clase: "success",
  },
};

function ConfirmDialog({
  abierto,
  opciones,
  procesando,
  onConfirmar,
  onCancelar,
}) {
  const botonConfirmarRef = useRef(null);
  const dialogRef = useRef(null);
  const elementoPrevioRef = useRef(null);

  const variante =
    CONFIG_VARIANTES[opciones.variante] ||
    CONFIG_VARIANTES.default;

  const Icono = variante.icono;

  useEffect(() => {
    if (!abierto) return undefined;

    elementoPrevioRef.current = document.activeElement;

    const frame = window.requestAnimationFrame(() => {
      botonConfirmarRef.current?.focus();
    });

    const bodyOverflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = bodyOverflowAnterior;

      if (
        elementoPrevioRef.current &&
        typeof elementoPrevioRef.current.focus === "function"
      ) {
        elementoPrevioRef.current.focus();
      }
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;

    const manejarTeclado = (event) => {
      if (event.key === "Escape") {
        if (!procesando && opciones.cerrarConEscape !== false) {
          event.preventDefault();
          onCancelar();
        }

        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const elementos = Array.from(
        dialog.querySelectorAll(
          [
            "button:not([disabled])",
            "input:not([disabled])",
            "textarea:not([disabled])",
            "select:not([disabled])",
            '[tabindex]:not([tabindex="-1"])',
          ].join(",")
        )
      );

      if (elementos.length === 0) return;

      const primero = elementos[0];
      const ultimo = elementos[elementos.length - 1];

      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === ultimo
      ) {
        event.preventDefault();
        primero.focus();
      }
    };

    window.addEventListener("keydown", manejarTeclado);

    return () => {
      window.removeEventListener("keydown", manejarTeclado);
    };
  }, [
    abierto,
    procesando,
    opciones.cerrarConEscape,
    onCancelar,
  ]);

  if (!abierto) return null;

  const manejarBackdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    if (procesando) return;
    if (opciones.cerrarAlHacerClickFuera !== true) return;

    onCancelar();
  };

  return (
    <div
      className="zf-dialog-backdrop"
      onMouseDown={manejarBackdrop}
    >
      <div
        ref={dialogRef}
        className={`zf-dialog zf-dialog--${variante.clase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zf-dialog-title"
        aria-describedby="zf-dialog-description"
      >
        <div className="zf-dialog__header">
          <div className="zf-dialog__icono">
            <Icono size={24} aria-hidden="true" />
          </div>

          <div className="zf-dialog__titulos">
            <h2 id="zf-dialog-title">
              {opciones.titulo || "Confirmar acción"}
            </h2>

            {opciones.mensaje && (
              <p id="zf-dialog-description">
                {opciones.mensaje}
              </p>
            )}
          </div>

          {opciones.mostrarCerrar !== false && !procesando && (
            <button
              type="button"
              className="zf-dialog__cerrar"
              onClick={onCancelar}
              aria-label="Cerrar diálogo"
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="zf-dialog__acciones">
          <button
            type="button"
            className="zf-button zf-button--secondary"
            onClick={onCancelar}
            disabled={procesando}
          >
            {opciones.textoCancelar || "Cancelar"}
          </button>

          <button
            ref={botonConfirmarRef}
            type="button"
            className={`zf-button zf-button--${variante.clase}`}
            onClick={onConfirmar}
            disabled={procesando}
          >
            {procesando
              ? opciones.textoCargando || "Procesando..."
              : opciones.textoConfirmar || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormDialog({
  abierto,
  opciones,
  procesando,
  onConfirmar,
  onCancelar,
}) {
  const dialogRef = useRef(null);
  const primerCampoRef = useRef(null);
  const elementoPrevioRef = useRef(null);

  const tituloId = useId();
  const descripcionId = useId();

  const [valores, setValores] = useState({});
  const [errores, setErrores] = useState({});

  useEffect(() => {
    if (!abierto) return;

    setValores(opciones.valoresIniciales || {});
    setErrores({});
  }, [abierto, opciones.valoresIniciales]);

  useEffect(() => {
    if (!abierto) return undefined;

    elementoPrevioRef.current = document.activeElement;

    const frame = window.requestAnimationFrame(() => {
      primerCampoRef.current?.focus();
    });

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflowAnterior;

      if (
        elementoPrevioRef.current &&
        typeof elementoPrevioRef.current.focus === "function"
      ) {
        elementoPrevioRef.current.focus();
      }
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;

    const manejarTeclado = (event) => {
      if (event.key === "Escape") {
        if (!procesando && opciones.cerrarConEscape !== false) {
          event.preventDefault();
          onCancelar();
        }

        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const elementos = Array.from(
        dialog.querySelectorAll(
          [
            "button:not([disabled])",
            "input:not([disabled])",
            "textarea:not([disabled])",
            "select:not([disabled])",
            '[tabindex]:not([tabindex="-1"])',
          ].join(",")
        )
      );

      if (elementos.length === 0) return;

      const primero = elementos[0];
      const ultimo = elementos[elementos.length - 1];

      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === ultimo
      ) {
        event.preventDefault();
        primero.focus();
      }
    };

    window.addEventListener("keydown", manejarTeclado);

    return () => {
      window.removeEventListener("keydown", manejarTeclado);
    };
  }, [
    abierto,
    procesando,
    opciones.cerrarConEscape,
    onCancelar,
  ]);

  if (!abierto) return null;

  const actualizarValor = (nombre, valor) => {
    setValores((prev) => ({
      ...prev,
      [nombre]: valor,
    }));

    setErrores((prev) => {
      if (!prev[nombre]) return prev;

      const siguiente = { ...prev };
      delete siguiente[nombre];
      return siguiente;
    });
  };

  const validarFormulario = () => {
    const nuevosErrores = {};

    (opciones.campos || []).forEach((campo) => {
      const valor = valores[campo.nombre];

      if (
        campo.requerido &&
        (valor === undefined ||
          valor === null ||
          String(valor).trim() === "")
      ) {
        nuevosErrores[campo.nombre] =
          campo.mensajeRequerido ||
          `Completá el campo ${campo.etiqueta || campo.nombre}.`;
      }

      if (
        campo.tipo === "text" &&
        campo.maxLength &&
        String(valor || "").length > campo.maxLength
      ) {
        nuevosErrores[campo.nombre] =
          `El campo no puede superar los ${campo.maxLength} caracteres.`;
      }
    });

    if (typeof opciones.validar === "function") {
      const erroresPersonalizados =
        opciones.validar(valores) || {};

      Object.assign(nuevosErrores, erroresPersonalizados);
    }

    setErrores(nuevosErrores);

    return Object.keys(nuevosErrores).length === 0;
  };

  const manejarConfirmacion = () => {
    if (!validarFormulario()) return;

    onConfirmar(valores);
  };

  const manejarSubmit = (event) => {
    event.preventDefault();
    manejarConfirmacion();
  };

  const manejarBackdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    if (procesando) return;
    if (opciones.cerrarAlHacerClickFuera !== true) return;

    onCancelar();
  };

  return (
    <div
      className="zf-dialog-backdrop"
      onMouseDown={manejarBackdrop}
    >
      <form
        ref={dialogRef}
        className="zf-dialog zf-dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={
          opciones.mensaje ? descripcionId : undefined
        }
        onSubmit={manejarSubmit}
      >
        <div className="zf-dialog__header">
          <div className="zf-dialog__icono">
            <Info size={24} aria-hidden="true" />
          </div>

          <div className="zf-dialog__titulos">
            <h2 id={tituloId}>
              {opciones.titulo || "Completar información"}
            </h2>

            {opciones.mensaje && (
              <p id={descripcionId}>
                {opciones.mensaje}
              </p>
            )}
          </div>

          {!procesando && (
            <button
              type="button"
              className="zf-dialog__cerrar"
              onClick={onCancelar}
              aria-label="Cerrar diálogo"
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="zf-form-dialog__contenido">
          {(opciones.campos || []).map((campo, index) => {
            const campoId = `zf-campo-${campo.nombre}`;
            const error = errores[campo.nombre];
            const valor = valores[campo.nombre];

            if (campo.ocultoCuando?.(valores)) {
              return null;
            }

            if (campo.tipo === "checkbox") {
              return (
                <label
                  key={campo.nombre}
                  className="zf-form-dialog__checkbox"
                >
                  <input
                    ref={index === 0 ? primerCampoRef : undefined}
                    type="checkbox"
                    checked={valor === true}
                    disabled={procesando || campo.disabled}
                    onChange={(event) =>
                      actualizarValor(
                        campo.nombre,
                        event.target.checked
                      )
                    }
                  />

                  <span>
                    {campo.etiqueta || campo.nombre}
                  </span>
                </label>
              );
            }

            return (
              <div
                key={campo.nombre}
                className="zf-form-dialog__campo"
              >
                <label htmlFor={campoId}>
                  {campo.etiqueta || campo.nombre}

                  {campo.requerido && (
                    <span aria-hidden="true"> *</span>
                  )}
                </label>

                {campo.tipo === "textarea" ? (
                  <textarea
                    id={campoId}
                    ref={
                      campo.autoFocus || index === 0
                        ? primerCampoRef
                        : undefined
                    }
                    value={valor || ""}
                    placeholder={campo.placeholder || ""}
                    maxLength={campo.maxLength}
                    disabled={procesando || campo.disabled}
                    aria-invalid={Boolean(error)}
                    onChange={(event) =>
                      actualizarValor(
                        campo.nombre,
                        event.target.value
                      )
                    }
                  />
                ) : campo.tipo === "select" ? (
                  <select
                    id={campoId}
                    ref={
                      campo.autoFocus || index === 0
                        ? primerCampoRef
                        : undefined
                    }
                    value={valor || ""}
                    disabled={procesando || campo.disabled}
                    aria-invalid={Boolean(error)}
                    onChange={(event) =>
                      actualizarValor(
                        campo.nombre,
                        event.target.value
                      )
                    }
                  >
                    {campo.placeholder && (
                      <option value="">
                        {campo.placeholder}
                      </option>
                    )}

                    {(campo.opciones || []).map((opcion) => (
                      <option
                        key={String(opcion.valor)}
                        value={opcion.valor}
                      >
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={campoId}
                    ref={
                      campo.autoFocus || index === 0
                        ? primerCampoRef
                        : undefined
                    }
                    type={campo.tipo || "text"}
                    value={valor || ""}
                    placeholder={campo.placeholder || ""}
                    maxLength={campo.maxLength}
                    disabled={procesando || campo.disabled}
                    aria-invalid={Boolean(error)}
                    onChange={(event) =>
                      actualizarValor(
                        campo.nombre,
                        event.target.value
                      )
                    }
                  />
                )}

                {campo.ayuda && (
                  <small className="zf-form-dialog__ayuda">
                    {campo.ayuda}
                  </small>
                )}

                {error && (
                  <small
                    className="zf-form-dialog__error"
                    role="alert"
                  >
                    {error}
                  </small>
                )}
              </div>
            );
          })}
        </div>

        <div className="zf-dialog__acciones">
          <button
            type="button"
            className="zf-button zf-button--secondary"
            onClick={onCancelar}
            disabled={procesando}
          >
            {opciones.textoCancelar || "Cancelar"}
          </button>

          <button
            type="submit"
            className="zf-button zf-button--info"
            disabled={procesando}
          >
            {procesando
              ? opciones.textoCargando || "Procesando..."
              : opciones.textoConfirmar || "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [dialogo, setDialogo] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const resolverRef = useRef(null);
  const resolviendoRef = useRef(false);

  const limpiarDialogo = useCallback(() => {
    setDialogo(null);
    setProcesando(false);
    resolverRef.current = null;
    resolviendoRef.current = false;
  }, []);

  const resolverDialogo = useCallback(
    (resultado) => {
      if (resolviendoRef.current) return;

      resolviendoRef.current = true;

      const resolver = resolverRef.current;

      if (typeof resolver === "function") {
        resolver(resultado);
      }

      limpiarDialogo();
    },
    [limpiarDialogo]
  );

  const confirm = useCallback((opciones = {}) => {
    if (resolverRef.current) {
      console.warn(
        "Ya existe un diálogo activo. La nueva confirmación fue cancelada."
      );

      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      resolverRef.current = resolve;

      setDialogo({
        tipo: "confirm",
        opciones: {
          titulo: opciones.titulo || "Confirmar acción",
          mensaje: opciones.mensaje || "",
          textoConfirmar:
            opciones.textoConfirmar || "Confirmar",
          textoCancelar:
            opciones.textoCancelar || "Cancelar",
          textoCargando:
            opciones.textoCargando || "Procesando...",
          variante: opciones.variante || "default",
          cerrarConEscape:
            opciones.cerrarConEscape !== false,
          cerrarAlHacerClickFuera:
            opciones.cerrarAlHacerClickFuera === true,
          mostrarCerrar:
            opciones.mostrarCerrar !== false,
          accionId:
            typeof opciones.accionId === "string"
              ? opciones.accionId
              : null,
        },
      });
    });
  }, []);

    const cancelarDialogo = useCallback(() => {
    if (procesando) return;

    if (dialogo?.tipo === "form") {
        resolverDialogo({
        confirmado: false,
        valores: null,
        });

        return;
    }

    resolverDialogo(false);
    }, [procesando, dialogo?.tipo, resolverDialogo]);

  const confirmarDialogo = useCallback(() => {
    if (procesando || resolviendoRef.current) return;

    setProcesando(true);

    /*
     * El modal solo confirma intención.
     * La operación de Firestore se ejecuta después,
     * dentro del módulo correspondiente.
     */
    resolverDialogo(true);
  }, [procesando, resolverDialogo]);

const confirmarFormulario = useCallback(
  (valores) => {
    if (procesando || resolviendoRef.current) return;

    resolverDialogo({
      confirmado: true,
      valores,
    });
  },
  [procesando, resolverDialogo]
);

  const closeDialog = useCallback(() => {
    cancelarDialogo();
  }, [cancelarDialogo]);

const openFormDialog = useCallback((opciones = {}) => {
  if (resolverRef.current) {
    console.warn(
      "Ya existe un diálogo activo. El nuevo formulario fue cancelado."
    );

    return Promise.resolve({
      confirmado: false,
      valores: null,
    });
  }

  return new Promise((resolve) => {
    resolverRef.current = resolve;

    setDialogo({
      tipo: "form",
      opciones: {
        titulo:
          opciones.titulo || "Completar información",
        mensaje: opciones.mensaje || "",
        textoConfirmar:
          opciones.textoConfirmar || "Guardar",
        textoCancelar:
          opciones.textoCancelar || "Cancelar",
        textoCargando:
          opciones.textoCargando || "Procesando...",
        campos: Array.isArray(opciones.campos)
          ? opciones.campos
          : [],
        valoresIniciales:
          opciones.valoresIniciales || {},
        validar:
          typeof opciones.validar === "function"
            ? opciones.validar
            : null,
        cerrarConEscape:
          opciones.cerrarConEscape !== false,
        cerrarAlHacerClickFuera:
          opciones.cerrarAlHacerClickFuera === true,
        accionId:
          typeof opciones.accionId === "string"
            ? opciones.accionId
            : null,
      },
    });
  });
}, []);

  useEffect(() => {
    return () => {
      if (typeof resolverRef.current === "function") {
        resolverRef.current(false);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      confirm,
      openFormDialog,
      closeDialog,
    }),
    [confirm, openFormDialog, closeDialog]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}

      <ConfirmDialog
        abierto={dialogo?.tipo === "confirm"}
        opciones={dialogo?.opciones || {}}
        procesando={procesando}
        onConfirmar={confirmarDialogo}
        onCancelar={cancelarDialogo}
      />
      <FormDialog
        abierto={dialogo?.tipo === "form"}
        opciones={dialogo?.opciones || {}}
        procesando={procesando}
        onConfirmar={confirmarFormulario}
        onCancelar={cancelarDialogo}
        />
    </DialogContext.Provider>
  );
}