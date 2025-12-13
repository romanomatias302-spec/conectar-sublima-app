import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import "./PedidoFormModal.css";

export default function PedidoFormModal({ onClose, onPedidoCreado, pedido }) {
  const [clientes, setClientes] = useState([]);
  const [formData, setFormData] = useState({
    id: "",
    cliente: "",
    clienteDNI: "",
    fechaPedido: "",
    fechaEntrega: "",
    estado: "Pendiente",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false); // ✅ nuevo estado para el mensaje de éxito

  // 🔹 Cargar lista de clientes
  useEffect(() => {
    const fetchClientes = async () => {
      const snapshot = await getDocs(collection(db, "clientes"));
      setClientes(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    fetchClientes();
  }, []);

  // 🔹 Si estamos editando, precargar datos
  useEffect(() => {
    if (pedido) {
      setFormData({
        id: pedido.id || "",
        cliente: pedido.cliente || "",
        clienteDNI: pedido.clienteDNI || "",
        fechaPedido: pedido.fechaPedido || "",
        fechaEntrega: pedido.fechaEntrega || "",
        estado: pedido.estado || "Pendiente",
      });
    }
  }, [pedido]);

  // 🔹 Manejar cambios
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 🔹 Guardar (crear o actualizar)
  const guardarPedido = async () => {
    if (!formData.cliente || !formData.fechaPedido) {
      setError("El cliente y la fecha de pedido son obligatorios.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const pedidosRef = collection(db, "pedidos");

      // 🔹 EDITAR pedido existente
      if (pedido && pedido.firebaseId) {
        const ref = doc(db, "pedidos", pedido.firebaseId);
        await updateDoc(ref, formData);
        setExito(true); // ✅ muestra mensaje
        setTimeout(() => {
          onPedidoCreado(pedido);
          onClose();
        }, 1500);
        return;
      }

      // 🔹 CREAR nuevo pedido
      const snapshot = await getDocs(pedidosRef);
      const ultimoID =
        snapshot.docs.length > 0
          ? Math.max(...snapshot.docs.map((doc) => parseInt(doc.data().id) || 0))
          : 0;
      const nuevoID = (ultimoID + 1).toString();

      const nuevoPedidoData = {
        id: nuevoID,
        cliente: formData.cliente,
        clienteDNI: formData.clienteDNI,
        fechaPedido: formData.fechaPedido,
        fechaEntrega: formData.fechaEntrega,
        estado: formData.estado,
        productos: [],
      };

      const docRef = await addDoc(pedidosRef, nuevoPedidoData);

      // ✅ Mostrar mensaje de éxito antes de redirigir
      setExito(true);
      setTimeout(() => {
        if (onPedidoCreado) {
          onPedidoCreado({
            firebaseId: docRef.id,
            ...nuevoPedidoData,
          });
        }
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error al guardar pedido:", err);
      setError("Hubo un problema al guardar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{pedido ? "Editar Pedido" : "Nuevo Pedido"}</h2>

        {error && <div className="error">{error}</div>}
        {exito && <div className="success">✅ Pedido guardado con éxito</div>}

        <label>Cliente</label>
        <select
          name="cliente"
          value={formData.cliente}
          onChange={(e) => {
            const seleccionado = clientes.find(
              (c) => `${c.nombre} ${c.apellido}` === e.target.value
            );
            setFormData({
              ...formData,
              cliente: seleccionado
                ? `${seleccionado.nombre} ${seleccionado.apellido}`
                : "",
              clienteDNI: seleccionado ? seleccionado.dni : "",
            });
          }}
        >
          <option value="">Seleccionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={`${c.nombre} ${c.apellido}`}>
              {c.nombre} {c.apellido}
            </option>
          ))}
        </select>

        <label>Fecha de pedido</label>
        <input
          type="date"
          name="fechaPedido"
          value={formData.fechaPedido}
          onChange={handleChange}
        />

        <label>Fecha de entrega</label>
        <input
          type="date"
          name="fechaEntrega"
          value={formData.fechaEntrega}
          onChange={handleChange}
        />

        <label>Estado</label>
        <select name="estado" value={formData.estado} onChange={handleChange}>
          <option value="Pendiente">Pendiente</option>
          <option value="En proceso">En proceso</option>
          <option value="Terminado">Terminado</option>
          <option value="Cancelado">Cancelado</option>
        </select>

        <div className="modal-buttons">
          <button className="cancelar" onClick={onClose}>
            Cancelar
          </button>
          <button onClick={guardarPedido} disabled={loading}>
            {loading
              ? "Guardando..."
              : pedido
              ? "Guardar Cambios"
              : "Guardar Pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
