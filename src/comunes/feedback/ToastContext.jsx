import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";

export const ToastContext = createContext(null);

const DURACIONES_POR_TIPO = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

const crearIdToast = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function ToastIcon({ tipo }) {
  switch (tipo) {
    case "success":
      return <CheckCircle2 size={20} aria-hidden="true" />;

    case "error":
      return <XCircle size={20} aria-hidden="true" />;

    case "warning":
      return <AlertTriangle size={20} aria-hidden="true" />;

    case "info":
    default:
      return <Info size={20} aria-hidden="true" />;
  }
}

function ToastItem({ toast, onCerrar }) {
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (toast.persistente || pausado) return undefined;

    const timer = window.setTimeout(() => {
      onCerrar(toast.id);
    }, toast.duracion);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    toast.id,
    toast.duracion,
    toast.persistente,
    pausado,
    onCerrar,
  ]);

  const esError = toast.tipo === "error";

  return (
    <div
      className={`zf-toast zf-toast--${toast.tipo}`}
      role={esError ? "alert" : "status"}
      aria-live={esError ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <div className="zf-toast__icono">
        <ToastIcon tipo={toast.tipo} />
      </div>

      <div className="zf-toast__contenido">
        {toast.titulo && (
          <strong className="zf-toast__titulo">
            {toast.titulo}
          </strong>
        )}

        <span className="zf-toast__mensaje">
          {toast.mensaje}
        </span>
      </div>

      <button
        type="button"
        className="zf-toast__cerrar"
        onClick={() => onCerrar(toast.id)}
        aria-label="Cerrar notificación"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) =>
      prev.filter((toast) => toast.id !== toastId)
    );
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((opciones) => {
    const opcionesNormalizadas =
      typeof opciones === "string"
        ? {
            mensaje: opciones,
          }
        : opciones || {};

    const tipo = ["success", "error", "warning", "info"].includes(
      opcionesNormalizadas.tipo
    )
      ? opcionesNormalizadas.tipo
      : "info";

    const mensaje =
      typeof opcionesNormalizadas.mensaje === "string"
        ? opcionesNormalizadas.mensaje.trim()
        : "";

    if (!mensaje) {
      console.warn(
        "Se intentó mostrar un toast sin mensaje."
      );

      return null;
    }

    const nuevoToast = {
      id: crearIdToast(),
      tipo,
      mensaje,
      titulo:
        typeof opcionesNormalizadas.titulo === "string"
          ? opcionesNormalizadas.titulo.trim()
          : "",
      duracion:
        Number(opcionesNormalizadas.duracion) > 0
          ? Number(opcionesNormalizadas.duracion)
          : DURACIONES_POR_TIPO[tipo],
      persistente:
        opcionesNormalizadas.persistente === true,
      accionId:
        typeof opcionesNormalizadas.accionId === "string"
          ? opcionesNormalizadas.accionId
          : null,
    };

    setToasts((prev) => {
      const siguientes = [...prev, nuevoToast];

      /*
       * Dejamos como máximo cuatro notificaciones visibles.
       * Si llegan más, se eliminan primero las más antiguas.
       */
      return siguientes.slice(-4);
    });

    return nuevoToast.id;
  }, []);

  const success = useCallback(
    (mensaje, opciones = {}) =>
      showToast({
        ...opciones,
        tipo: "success",
        mensaje,
      }),
    [showToast]
  );

  const error = useCallback(
    (mensaje, opciones = {}) =>
      showToast({
        ...opciones,
        tipo: "error",
        mensaje,
      }),
    [showToast]
  );

  const warning = useCallback(
    (mensaje, opciones = {}) =>
      showToast({
        ...opciones,
        tipo: "warning",
        mensaje,
      }),
    [showToast]
  );

  const info = useCallback(
    (mensaje, opciones = {}) =>
      showToast({
        ...opciones,
        tipo: "info",
        mensaje,
      }),
    [showToast]
  );

  const value = useMemo(
    () => ({
      showToast,
      success,
      error,
      warning,
      info,
      dismissToast,
      clearToasts,
    }),
    [
      showToast,
      success,
      error,
      warning,
      info,
      dismissToast,
      clearToasts,
    ]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="zf-toast-container"
        aria-label="Notificaciones"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onCerrar={dismissToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}