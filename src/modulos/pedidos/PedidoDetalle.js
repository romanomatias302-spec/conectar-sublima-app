import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import ProductoFormModal from "./ProductoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./PedidoDetalle.css";
import { puedeHacer } from "../../utils/permisos";
import {
  getColumnasDetallePedidoDefault,
  normalizarColumnasDetallePedido,
} from "../../utils/detallePedidoColumnas";
import ColumnasDetallePedidoModal from "./ColumnasDetallePedidoModal";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";


export default function PedidoDetalle({ pedido, onVolver, perfil, onVerVenta }) {
  const [productos, setProductos] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [soloVer, setSoloVer] = useState(false);
  const [columnasDetalle, setColumnasDetalle] = useState(getColumnasDetallePedidoDefault());
  const [mostrarConfigColumnas, setMostrarConfigColumnas] = useState(false);

  const esAdmin = perfil?.rol === "admin" || perfil?.rol === "superadmin";
  const puedeEditarPedidos = puedeHacer(perfil, "pedidos", "editar");

  // 🔹 Cargar productos del pedido
  const cargarProductos = async () => {
    if (!pedido?.firebaseId) return;

    const snapshot = await getDocs(
      collection(db, `pedidos/${pedido.firebaseId}/productos`)
    );

    const lista = snapshot.docs.map((docu) => ({
      id: docu.id,
      ...docu.data(),
    }));

    setProductos(lista);
  };

useEffect(() => {
  cargarProductos();
}, [pedido]);

useEffect(() => {
  cargarConfiguracionColumnas();
}, [perfil?.clienteId]);

  // 👁️ Ver producto
  const manejarVerProducto = (producto) => {
    setProductoEditando(producto);
    setSoloVer(true);
    setMostrarModal(true);
  };

  // ✏️ Editar producto
  const manejarEditarProducto = (producto) => {
    if (!puedeEditarPedidos) return;

    setProductoEditando(producto);
    setSoloVer(false);
    setMostrarModal(true);
  };

  // 🗑️ Eliminar producto
  const manejarEliminarProducto = async (id) => {
    if (!puedeEditarPedidos) return;

    if (window.confirm("¿Seguro que querés eliminar este producto?")) {
      await deleteDoc(doc(db, `pedidos/${pedido.firebaseId}/productos`, id));
      cargarProductos();
    }
  };

  // ➕ Nuevo producto
  const abrirModal = () => {
    if (!puedeEditarPedidos) return;

    setProductoEditando(null);
    setSoloVer(false);
    setMostrarModal(true);
  };

    const resumirZonas = (producto) => {
    const zonas = producto?.zonas || {};
    const usadas = Object.entries(zonas)
      .filter(([, valor]) => String(valor || "").trim() !== "")
      .map(([codigo, valor]) => `${codigo}: ${valor}`);

    return usadas.length ? usadas.join(" | ") : "-";
  };

  const resumirTalles = (producto) => {
    const talles = producto?.talles || {};
    const detallePorTalle = producto?.detallePorTalle || {};

const usados = Object.entries(talles)
  .filter(([talle, cantidad]) => {
    const qty = Number(cantidad) || 0;
    const detalle = String(detallePorTalle[talle] || "").trim();
    return qty > 0 || detalle !== "";
  })
  .map(([talle, cantidad]) => {
    const qty = Number(cantidad) || 0;
    const detalle = String(detallePorTalle[talle] || "").trim();

    return {
      talle,
      qty,
      detalle,
    };
  });

return usados.length ? usados : [];

  };

  const obtenerImagenPortada = (producto) => {
    const imagenes = producto?.imagenes || [];

    const portada = imagenes.find((img) => {
      if (typeof img === "string") return false;
      return img?.tipo === "storage" && img?.portada === true && String(img?.url || "").trim() !== "";
    });

    return portada?.url || "";
  };

  const obtenerObservaciones = (producto) => {
    const atributos = producto?.atributosExtra || {};
    return (
      atributos.Observaciones ||
      atributos.observaciones ||
      producto?.observaciones ||
      "-"
    );
  };

   const resumirDetallesCostura = (producto) => {
    const detalles = producto?.detallesCostura || {};

    const usados = Object.entries(detalles)
      .filter(([, valor]) => String(valor || "").trim() !== "")
      .map(([nombre, valor]) => ({
        nombre,
        valor,
      }));

    return usados.length ? usados : [];
  };

  const renderCeldaProducto = (producto, columnaKey) => {
    switch (columnaKey) {
      case "producto":
        return producto.productoNombre || producto.producto || "-";

      case "color":
        return producto.color || "-";

      case "detalle":
        return <div className="celda-texto-resumen">{producto.detalle || "-"}</div>;

      case "observaciones":
        return <div className="celda-texto-resumen">{obtenerObservaciones(producto)}</div>;

      case "zonasResumen":
        return <div className="celda-texto-resumen">{resumirZonas(producto)}</div>;

case "tallesResumen": {
  const talles = resumirTalles(producto);

  if (!talles.length) return "-";

  return (
    <div className="detalle-talles-resumen">
      {talles.map((item, index) => (
        <React.Fragment key={`${item.talle}-${index}`}>
          <span className="detalle-talle-chip">
            <span className="detalle-talle-nombre">{item.talle}</span>
            <span className="detalle-talle-sep">·</span>
            <span className="detalle-talle-cantidad">
              {item.qty} <span className="detalle-talle-unit">uni.</span>
            </span>
            {item.detalle ? (
              <>
                <span className="detalle-talle-sep">·</span>
                <span className="detalle-talle-detalle">{item.detalle}</span>
              </>
            ) : null}
          </span>

          {index < talles.length - 1 ? (
            <span className="detalle-talle-divider">|</span>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

      case "detallesCosturaResumen": {
        const detalles = resumirDetallesCostura(producto);

        if (!detalles.length) return "-";

        return (
          <div className="detalle-costura-resumen">
            {detalles.map((item, index) => (
              <div key={`${item.nombre}-${index}`} className="detalle-costura-item">
                <span className="detalle-costura-nombre">{item.nombre}:</span>
                <span className="detalle-costura-valor">{item.valor}</span>
              </div>
            ))}
          </div>
        );
      }

      case "imagenesResumen": {
        const portadaUrl = obtenerImagenPortada(producto);

        if (!portadaUrl) return "-";

        return (
          <div className="detalle-imagen-portada-wrap">
            <img
              src={portadaUrl}
              alt="Portada"
              className="detalle-imagen-portada-thumb"
            />

            <div className="detalle-imagen-portada-preview detalle-imagen-portada-preview-left">
              <img
                src={portadaUrl}
                alt="Vista previa"
                className="detalle-imagen-portada-preview-img"
              />
            </div>
          </div>
        );
      }

      case "cantidad":
        return producto.totalTalles || producto.cantidad || "-";

      case "acciones":
        return (
          <ActionMenu
            onVer={() => manejarVerProducto(producto)}
            onEditar={puedeEditarPedidos ? () => manejarEditarProducto(producto) : undefined}
            onEliminar={puedeEditarPedidos ? () => manejarEliminarProducto(producto.id) : undefined}
          />
        );

      default:
        return "-";
    }
  };

  const columnasVisibles = columnasDetalle.filter((col) => col.visible);

  const cargarConfiguracionColumnas = async () => {
  try {
    if (!perfil?.clienteId) return;

    const ref = doc(
      db,
      `clientes-saas/${perfil.clienteId}/configuracion`,
      "pedidos_detalle"
    );

    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      if (data?.columnas) {
        setColumnasDetalle(normalizarColumnasDetallePedido(data.columnas));
      } else {
        setColumnasDetalle(getColumnasDetallePedidoDefault());
      }
    } else {
      setColumnasDetalle(getColumnasDetallePedidoDefault());
    }
  } catch (error) {
    console.error("Error cargando configuración de columnas:", error);
  }
};
  
  

  return (
    <div className="pedido-detalle">
      <h1>Detalles del Pedido #{pedido.id}</h1>

      {/* 🔹 Contenedor gris claro para datos del pedido */}
      {/* 🔹 Header del pedido (theme-aware) */}
<div className="pedido-header-bar">
  <div className="pedido-header-item">
    <span className="pedido-header-label">Cliente:</span>
    <span className="pedido-header-value">{pedido?.cliente || "-"}</span>
  </div>

  <div className="pedido-header-item">
    <span className="pedido-header-label">Estado:</span>
    <span
      className={`pedido-status-badge estado-${(pedido?.estado || "en-proceso")
        .toLowerCase()
        .replace(/\s+/g, "-")}`}
    >
      {pedido?.estado || "En proceso"}
    </span>
  </div>

  <div className="pedido-header-item">
    <span className="pedido-header-label">Fecha de Pedido:</span>
    <span className="pedido-header-value">{pedido?.fechaPedido || "-"}</span>
  </div>

  <div className="pedido-header-item">
    <span className="pedido-header-label">Fecha de Entrega:</span>
    <span className="pedido-header-value">{pedido?.fechaEntrega || "-"}</span>
  </div>
</div>


      {/* 🔹 Estado de factura asociada */}
      <div
        style={{
          marginTop: "16px",
          marginBottom: "16px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {!pedido?.ventaRefId && (
          <div
            style={{
              background: "rgba(220, 53, 69, 0.10)",
              color: "#b02a37",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 600,
            }}
          >
            Este pedido no tiene factura asociada
          </div>
        )}

        {pedido?.ventaRefId && (pedido?.ventaEstado || "activa") === "activa" && (
          <button
            type="button"
            onClick={() => onVerVenta && onVerVenta(pedido.ventaRefId)}
            style={{
              background: "rgba(25, 135, 84, 0.10)",
              color: "#146c43",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Ver factura #{pedido?.ventaVisibleId || "-"}
          </button>
        )}

        {pedido?.ventaRefId && pedido?.ventaEstado === "anulada" && (
          <button
            type="button"
            onClick={() => onVerVenta && onVerVenta(pedido.ventaRefId)}
            style={{
              background: "rgba(108, 117, 125, 0.14)",
              color: "#495057",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Ver factura anulada #{pedido?.ventaVisibleId || "-"}
          </button>
        )}
      </div>

      {/* 🔹 Acciones principales */}
      <div className="acciones-detalle">
        {puedeEditarPedidos && (
          <button className="btn-nuevo" onClick={abrirModal}>
            + Agregar Producto
          </button>
        )}

        {esAdmin && (
          <button
            className="btn-config-columnas"
            onClick={() => setMostrarConfigColumnas(true)}
            type="button"
          >
            Configurar columnas
          </button>
        )}

        <button className="btn-volver" onClick={onVolver}>
          Volver
        </button>
      </div>

      
      {/* 🔹 Tabla de productos */}
      <table className="tabla-productos">
        <thead>
          <tr>
            {columnasVisibles.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr
              key={p.id}
              className="fila-producto"
              onClick={() => manejarVerProducto(p)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  manejarVerProducto(p);
                }
              }}
            >
              {columnasVisibles.map((col) => (
                <td
                  key={col.key}
                  className={[
                    col.key === "imagenesResumen" ? "td-imagenes-resumen" : "",
                    col.key === "tallesResumen" ? "td-talles-resumen" : "",
                    col.key === "detallesCosturaResumen" ? "td-costura-resumen" : "",
                    col.key === "cantidad" ? "td-cantidad" : "",
                    col.key === "acciones" ? "td-acciones" : "",
                  ].join(" ").trim()}
                  onClick={col.key === "acciones" ? (e) => e.stopPropagation() : undefined}
                >
                  {renderCeldaProducto(p, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {productos.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "20px", color: "#888" }}>
          No hay productos cargados en este pedido.
        </p>
      )}

      {/* 🔹 Modal de productos */}
      {mostrarModal && (
        <ProductoFormModal
          pedidoId={pedido.firebaseId}
          productoEditando={productoEditando}
          onClose={() => {
            setMostrarModal(false);
            setProductoEditando(null);
          }}
          onProductoGuardado={cargarProductos}
          soloVer={soloVer}
          perfil={perfil}
        />
      )}

      <ColumnasDetallePedidoModal
        open={mostrarConfigColumnas}
        columnas={columnasDetalle}
        onClose={() => setMostrarConfigColumnas(false)}
        onGuardar={async (nuevasColumnas) => {
          const columnasNormalizadas = normalizarColumnasDetallePedido(nuevasColumnas);
          setColumnasDetalle(columnasNormalizadas);

          try {
            if (!perfil?.clienteId) return;

            const ref = doc(
              db,
              `clientes-saas/${perfil.clienteId}/configuracion`,
              "pedidos_detalle"
            );

            await setDoc(
              ref,
              { columnas: columnasNormalizadas },
              { merge: true }
            );
          } catch (error) {
            console.error("Error guardando columnas:", error);
          }
        }}
      />
    </div>
  );
}
