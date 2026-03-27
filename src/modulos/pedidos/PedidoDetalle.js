import React, { useState, useEffect } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import ProductoFormModal from "./ProductoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./PedidoDetalle.css";

export default function PedidoDetalle({ pedido, onVolver, perfil }) {
  const [productos, setProductos] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [soloVer, setSoloVer] = useState(false);

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

  // 👁️ Ver producto
  const manejarVerProducto = (producto) => {
    setProductoEditando(producto);
    setSoloVer(true);
    setMostrarModal(true);
  };

  // ✏️ Editar producto
  const manejarEditarProducto = (producto) => {
    setProductoEditando(producto);
    setSoloVer(false);
    setMostrarModal(true);
  };

  // 🗑️ Eliminar producto
  const manejarEliminarProducto = async (id) => {
    if (window.confirm("¿Seguro que querés eliminar este producto?")) {
      await deleteDoc(doc(db, `pedidos/${pedido.firebaseId}/productos`, id));
      cargarProductos();
    }
  };

  // ➕ Nuevo producto
  const abrirModal = () => {
    setProductoEditando(null);
    setSoloVer(false);
    setMostrarModal(true);
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
          <div
            style={{
              background: "rgba(25, 135, 84, 0.10)",
              color: "#146c43",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 600,
            }}
          >
            Factura asociada: #{pedido?.ventaVisibleId || "-"}
          </div>
        )}

        {pedido?.ventaRefId && pedido?.ventaEstado === "anulada" && (
          <div
            style={{
              background: "rgba(108, 117, 125, 0.14)",
              color: "#495057",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 600,
            }}
          >
            Factura anulada asociada: #{pedido?.ventaVisibleId || "-"}
          </div>
        )}
      </div>

      {/* 🔹 Acciones principales */}
      <div className="acciones-detalle">
        <button className="btn-nuevo" onClick={abrirModal}>
          + Agregar Producto
        </button>
        <button className="btn-volver" onClick={onVolver}>
          Volver al listado
        </button>
      </div>

      {/* 🔹 Tabla de productos */}
      <table className="tabla-productos">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Color</th>
            <th>Detalle</th>
            <th>Cantidad</th>
            <th>Acciones</th>
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
    <td>{p.productoNombre || p.producto}</td>
    <td>{p.color}</td>
    <td>{p.detalle}</td>
    <td>{p.totalTalles || p.cantidad || "-"}</td>

    {/* IMPORTANTE: seguimos frenando el click dentro del menú */}
    <td onClick={(e) => e.stopPropagation()}>
      <ActionMenu
        onVer={() => manejarVerProducto(p)}
        onEditar={() => manejarEditarProducto(p)}
        onEliminar={() => manejarEliminarProducto(p.id)}
      />
    </td>
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
    </div>
  );
}
