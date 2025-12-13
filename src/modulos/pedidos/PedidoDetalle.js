import React, { useState, useEffect } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import ProductoFormModal from "./ProductoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./PedidoDetalle.css";

export default function PedidoDetalle({ pedido, onVolver }) {
  const [productos, setProductos] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [soloVer, setSoloVer] = useState(false);

  // 🔹 Cargar productos del pedido
  const cargarProductos = async () => {
    if (!pedido?.id) return;
    const snapshot = await getDocs(collection(db, `pedidos/${pedido.id}/productos`));
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
      await deleteDoc(doc(db, `pedidos/${pedido.id}/productos`, id));
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
      <div className="info-pedido">
        <p><strong>Cliente:</strong> {pedido.cliente}</p>
        <p><strong>Estado:</strong> {pedido.estado}</p>
        <p><strong>Fecha de Pedido:</strong> {pedido.fechaPedido}</p>
        <p><strong>Fecha de Entrega:</strong> {pedido.fechaEntrega}</p>
      </div>

      {/* 🔹 Acciones principales */}
      <div className="acciones-detalle">
        <button className="btn-nuevo" onClick={abrirModal}>
          + Agregar Producto
        </button>
        <button className="btn-volver" onClick={onVolver}>
          ← Volver al listado
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
            <tr key={p.id} className="fila-producto">
              <td>{p.producto}</td>
              <td>{p.color}</td>
              <td>{p.detalle}</td>
              <td>{p.cantidad}</td>
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
          pedidoId={pedido.id}
          productoEditando={productoEditando}
          onClose={() => {
            setMostrarModal(false);
            setProductoEditando(null);
          }}
          onProductoGuardado={cargarProductos}
          soloVer={soloVer}
        />
      )}
    </div>
  );
}
