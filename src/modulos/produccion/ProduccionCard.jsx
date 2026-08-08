import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

function obtenerEstadoFechaEntrega(pedido) {
  if (!pedido?.fechaEntrega) return "";

  if (
    pedido.produccionFinalizada === true ||
    pedido.estado === "Terminado" ||
    pedido.estadoProduccion === "finalizado"
  ) {
    return "";
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const entrega = new Date(`${pedido.fechaEntrega}T00:00:00`);

  if (Number.isNaN(entrega.getTime())) return "";

  const diferenciaDias = Math.ceil(
    (entrega.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diferenciaDias < 0) return "vencida";
  if (diferenciaDias <= 2) return "proxima";

  return "";
}

function obtenerProgresoEntrega(pedido) {
  if (!pedido?.fechaEntrega) {
    return {
      porcentaje: 0,
      estado: "sin-fecha",
      texto: "Sin fecha",
    };
  }

  const entrega = new Date(`${pedido.fechaEntrega}T00:00:00`);
  if (Number.isNaN(entrega.getTime())) {
    return {
      porcentaje: 0,
      estado: "sin-fecha",
      texto: pedido.fechaEntrega,
    };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const creado = pedido.createdAt?.seconds
    ? new Date(pedido.createdAt.seconds * 1000)
    : pedido.fechaCreacion
    ? new Date(`${pedido.fechaCreacion}T00:00:00`)
    : null;

  const inicio = creado && !Number.isNaN(creado.getTime()) ? creado : hoy;
  inicio.setHours(0, 0, 0, 0);

  const totalMs = entrega.getTime() - inicio.getTime();
  const transcurridoMs = hoy.getTime() - inicio.getTime();

  let porcentaje = 0;

  if (hoy.getTime() > entrega.getTime()) {
    porcentaje = 100;
  } else if (totalMs <= 0) {
    porcentaje = 100;
  } else {
    porcentaje = Math.round((transcurridoMs / totalMs) * 100);
  }

  porcentaje = Math.min(100, Math.max(0, porcentaje));

    if (porcentaje === 0 && pedido.fechaEntrega) {
      porcentaje = 7;
    }

  let estado = "verde";

  if (hoy.getTime() > entrega.getTime()) {
    estado = "rojo";
  } else if (porcentaje >= 70) {
    estado = "amarillo";
  }

  return {
    porcentaje,
    estado,
    texto: pedido.fechaEntrega,
  };
}

function colorMarcaStyles(color) {
  switch (color) {
    case "amarillo":
      return { background: "#FFF4CC", color: "#8A6D00" };
    case "verde":
      return { background: "#E7F6EC", color: "#2E7D32" };
    case "azul":
      return { background: "#EAF2FF", color: "#2B5FB8" };
    case "rojo":
      return { background: "#FDEEEE", color: "#C62828" };
    case "violeta":
      return { background: "#F3ECFF", color: "#6F42C1" };
    default:
      return null;
  }
}

function obtenerEtiquetasPedido(pedido) {
  if (Array.isArray(pedido?.produccionEtiquetas)) {
    return pedido.produccionEtiquetas.slice(0, 4);
  }

  if (pedido?.produccionEtiquetaId) {
    return [
      {
        id: pedido.produccionEtiquetaId,
        nombre: pedido.produccionEtiquetaNombre || "",
        color: pedido.produccionEtiquetaColor || "",
      },
    ];
  }

  return [];
}

function formatearTiempoEnEtapa(timestamp, ahoraTick) {
  if (!timestamp?.seconds) return "Sin tiempo";

  const inicio = timestamp.seconds * 1000;
  const diffMs = Math.max(0, ahoraTick - inicio);

  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;

  const dias = Math.floor(horas / 24);
  return `${dias} d`;
}

export default function ProduccionCard({
  pedido,
  onVerPedido = () => {},
  onEditarDetalleManual = () => {},
  ahoraTick = Date.now(),
  puedeMoverPedidos = true,
  puedeEditarDetalleManual = true,
  columnas = [],
  onMoverPedido = () => {},
  onCambiarColorTarjeta = () => {},
  resaltadaNuevoPedido = false,
  ordenManualActivo = false,
  indiceOrdenManual = null,
}) {
  const pedidoId =
    pedido.pedidoFirebaseId ||
    pedido.firebaseId ||
    pedido.id;

  const representacionId =
    pedido.produccionRepresentacionId ||
    `principal:${pedidoId}`;


  const esMobile = window.innerWidth <= 768;


const coloresTarjeta = [
  { id: "", nombre: "Blanco" },
  { id: "amarillo", nombre: "Amarillo" },
  { id: "verde", nombre: "Verde" },
  { id: "azul", nombre: "Azul" },
  { id: "rojo", nombre: "Rojo" },
  { id: "violeta", nombre: "Violeta" },
];

const {
  attributes,
  listeners,
  setNodeRef,
  setActivatorNodeRef,
  transform,
  isDragging,
} = useDraggable({
  id: representacionId,

  disabled:
    pedido.produccionFinalizada === true ||
    !puedeMoverPedidos,
});



  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

const etiquetasPedido = obtenerEtiquetasPedido(pedido);
const estadoFechaEntrega = obtenerEstadoFechaEntrega(pedido);
const entregaProgreso = obtenerProgresoEntrega(pedido);

  const tiempoEtapa = formatearTiempoEnEtapa(
    pedido.produccionActualizadoAt || pedido.ultimaAccionProduccionAt,
    ahoraTick
  );

  const ultimoUsuario = pedido.ultimaAccionProduccionPorNombre || "";
const usuarioVisible =
  pedido.produccionAsignadoNombre ||
  pedido.produccionAsignadoEmail ||
  "";
  const usuarioAsignado =
    pedido.produccionAsignadoNombre ||
    pedido.produccionAsignadoEmail ||
    "";

  const tieneDetalleManual =
    etiquetasPedido.length > 0 ||
    !!usuarioAsignado ||
    (pedido.produccionMetros !== "" &&
      pedido.produccionMetros !== null &&
      pedido.produccionMetros !== undefined) ||
    !!pedido.produccionNotaCorta ||
    !!tiempoEtapa ||
    !!ultimoUsuario;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`produccion-card color-${pedido.produccionColorTarjeta || "blanco"} ${isDragging ? "dragging" : ""} ${pedido.__animandoSalida ? "finalizando" : ""} ${resaltadaNuevoPedido ? "nuevo-pedido-resaltado" : ""}`}
      {...(
        !esMobile && pedido.produccionFinalizada !== true && puedeMoverPedidos
          ? listeners
          : {}
      )}
      {...(
        !esMobile && pedido.produccionFinalizada !== true && puedeMoverPedidos
          ? attributes
          : {}
      )}
    >
      <button
        ref={esMobile ? setActivatorNodeRef : undefined}
        type="button"
        className="produccion-card-drag-handle"
        {...(
          esMobile && pedido.produccionFinalizada !== true && puedeMoverPedidos
            ? listeners
            : {}
        )}
        {...(
          esMobile && pedido.produccionFinalizada !== true && puedeMoverPedidos
            ? attributes
            : {}
        )}
        title={
          pedido.produccionFinalizada === true
            ? "Pedido finalizado"
            : !puedeMoverPedidos
            ? "Sin permiso para mover"
            : "Mover tarjeta"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
          <circle cx="5" cy="4" r="1" fill="currentColor" />
          <circle cx="11" cy="4" r="1" fill="currentColor" />
          <circle cx="5" cy="10" r="1" fill="currentColor" />
          <circle cx="11" cy="10" r="1" fill="currentColor" />
          <circle cx="5" cy="16" r="1" fill="currentColor" />
          <circle cx="11" cy="16" r="1" fill="currentColor" />
        </svg>
      </button>

      <div
        className="produccion-card-clickable"
        onClick={() => onEditarDetalleManual(pedido)}
      >

      {pedido.produccionImagenPortada && (
        <div className="produccion-card-cover">
          <img
            src={pedido.produccionImagenPortadaThumb || pedido.produccionImagenPortada}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
          
        <div className="produccion-card-top-row">
          {ordenManualActivo && indiceOrdenManual && (
            <div className="produccion-card-orden-manual">
              #{indiceOrdenManual}
            </div>
          )}
          <div className="produccion-card-numero">
            {pedido.id || pedido.numeroPedido || pedido.numero || "Sin número"}
          </div>




          
        </div>

       

        <div className="produccion-card-layout">
          <div className="produccion-card-main">
            <div className="produccion-card-desktop-info">
              <div className="produccion-card-cliente">
                {pedido.cliente || pedido.clienteNombre || pedido.nombreCliente || "Cliente sin nombre"}
              </div>

              <div className={`produccion-card-entrega-progress entrega-${entregaProgreso.estado}`}>
                <div
                  className="produccion-card-entrega-progress-fill"
                  style={{ width: `${entregaProgreso.porcentaje}%` }}
                />
                <span>{entregaProgreso.texto}</span>
              </div>
            </div>

            <div className="produccion-card-mobile-mainline">
              <span className="produccion-card-pedido-numero">
                #{pedido.id || pedido.numeroPedido || pedido.numero || "S/N"}
              </span>

              <span className="produccion-card-cliente produccion-card-cliente-mobile">
                {pedido.cliente || pedido.clienteNombre || pedido.nombreCliente || "Cliente sin nombre"}
              </span>
            </div>

              <div className={`produccion-card-entrega-progress produccion-card-entrega-mobile entrega-${entregaProgreso.estado}`}>
                <div
                  className="produccion-card-entrega-progress-fill"
                  style={{ width: `${entregaProgreso.porcentaje}%` }}
                />
                <span>{entregaProgreso.texto}</span>
              </div>



            <button
              type="button"
              className="produccion-card-link"
              onClick={(e) => {
                e.stopPropagation();
                onVerPedido(pedido);
              }}
            >
              Ver pedido
            </button>
            {usuarioVisible && (
              <div className="produccion-card-usuario-abajo">
                Usuario: {usuarioVisible}
              </div>
            )}
          </div>

          {tieneDetalleManual && (
            <div className="produccion-card-side">
              <div className="produccion-card-meta-row">
                <div className="produccion-card-tiempo">
                  <span className="produccion-card-tiempo-icono">⏱</span>
                  <span>{tiempoEtapa}</span>
                </div>


              </div>

        {etiquetasPedido.length > 0 && (
          <div className="produccion-card-etiquetas">
            {etiquetasPedido.map((etiqueta) => (
              <div
                key={etiqueta.id}
                className="produccion-card-marca"
                style={colorMarcaStyles(etiqueta.color)}
                title={etiqueta.nombre}
              >
                {etiqueta.nombre}
              </div>
            ))}
          </div>
        )}




            </div>
          )}
        </div>
      </div>
    </div>
  );
}