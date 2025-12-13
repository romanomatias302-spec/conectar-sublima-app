import React, { useState, useEffect } from "react";
import { collection, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import PedidoFormModal from "./PedidoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu"; // 👈 mismo componente usado en Clientes
import "./PedidosList.css";

export default function PedidosList({ onVerDetalle = () => {} }) {
  const [pedidos, setPedidos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [pedidoEditar, setPedidoEditar] = useState(null);

  // 🔹 Cargar pedidos
  const cargarPedidos = async () => {
    try {
      const snapshot = await getDocs(collection(db, "pedidos"));
      const lista = snapshot.docs.map((docu) => ({
        firebaseId: docu.id,
        ...docu.data(),
      }));
      setPedidos(lista);
    } catch (error) {
      console.error("Error al cargar pedidos:", error);
    }
  };

  useEffect(() => {
    cargarPedidos();
  }, []);

  // 🔹 Eliminar pedido
  const eliminarPedido = async (firebaseId) => {
    if (window.confirm("¿Seguro que querés eliminar este pedido?")) {
      try {
        await deleteDoc(doc(db, "pedidos", firebaseId));
        await cargarPedidos();
      } catch (error) {
        console.error("Error al eliminar pedido:", error);
      }
    }
  };

  // 🔹 Actualizar estado directamente
  const actualizarEstado = async (firebaseId, nuevoEstado) => {
    try {
      const ref = doc(db, "pedidos", firebaseId);
      await updateDoc(ref, { estado: nuevoEstado });
      setPedidos((prev) =>
        prev.map((p) =>
          p.firebaseId === firebaseId ? { ...p, estado: nuevoEstado } : p
        )
      );
    } catch (error) {
      console.error("Error al actualizar estado:", error);
    }
  };

  // 🔹 Filtrado
  const pedidosFiltrados = pedidos.filter((p) => {
    const texto = busqueda.toLowerCase();
    const coincideBusqueda =
      p.cliente?.toLowerCase().includes(texto) ||
      p.id?.toString().includes(texto);
    const coincideEstado = estadoFiltro ? p.estado === estadoFiltro : true;
    return coincideBusqueda && coincideEstado;
  });

  return (
    <div className="pedidos-lista">
      <div className="encabezado-lista">
        <h1>Pedidos</h1>
        <div className="acciones-lista">
          <input
            type="text"
            placeholder="Buscar por cliente o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="buscador"
          />

          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="filtro"
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En proceso">En proceso</option>
            <option value="Terminado">Terminado</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          <button
            className="btn-nuevo"
            onClick={() => {
              setPedidoEditar(null);
              setMostrarModal(true);
            }}
          >
            + Nuevo Pedido
          </button>
        </div>
      </div>

      <table className="tabla-pedidos">
        <thead>
          <tr>
            <th>ID Pedido</th>
            <th>Cliente</th>
            <th>Fecha Pedido</th>
            <th>Fecha Entrega</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {pedidosFiltrados.map((p) => (
            <tr
              key={p.firebaseId}
              className="fila-clickable"
              onClick={() => onVerDetalle(p)}
            >
              <td>#{p.id}</td>
              <td>{p.cliente}</td>
              <td>{p.fechaPedido}</td>
              <td>{p.fechaEntrega}</td>

              {/* Estado editable */}
              <td>
                <select
                  className={`estado-select ${p.estado?.toLowerCase().replace(" ", "-")}`}
                  value={p.estado || ""}
                  onChange={(e) => actualizarEstado(p.firebaseId, e.target.value)}
                  onClick={(e) => e.stopPropagation()} // evita que dispare el click de la fila
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="En proceso">En proceso</option>
                  <option value="Terminado">Terminado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </td>

              {/* Acciones */}
              <td
                onClick={(e) => e.stopPropagation()} // no abre el detalle
              >
                <ActionMenu
                  onVer={() => onVerDetalle(p)}
                  onEditar={() => {
                    setPedidoEditar(p);
                    setMostrarModal(true);
                  }}
                  onEliminar={() => eliminarPedido(p.firebaseId)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pedidosFiltrados.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "20px", color: "#888" }}>
          No se encontraron pedidos.
        </p>
      )}

      {mostrarModal && (
        <PedidoFormModal
  pedido={pedidoEditar}
  onClose={() => setMostrarModal(false)}
  onPedidoCreado={(nuevoPedido) => {
    setMostrarModal(false);
    cargarPedidos();
    onVerDetalle(nuevoPedido); // 👈 redirige automáticamente al detalle
  }}
/>
      )}
    </div>
  );
}
