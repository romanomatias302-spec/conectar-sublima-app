import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./PedidoFormModal.css";
import {
  asegurarColumnasBaseProduccion,
  obtenerColumnaInicialProduccion,
} from "../../firebase/produccionColumnas";

export default function PedidoFormModal({ onClose, onPedidoCreado, pedido, perfil }) {
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
      try {
        if (!perfil) return;

        const clientesRef = collection(db, "clientes");

        const q =
          perfil.rol === "superadmin"
            ? query(clientesRef)
            : query(
                clientesRef,
                where("clienteId", "==", perfil.clienteId)
              );

        const snapshot = await getDocs(q);

        setClientes(
          snapshot.docs.map((docu) => ({
            id: docu.id,
            ...docu.data(),
          }))
        );
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };

    fetchClientes();
  }, [perfil]);

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

  const obtenerSiguienteNumeroPedido = async () => {
    if (!perfil?.clienteId) {
      throw new Error("No se encontró clienteId para generar el número de pedido.");
    }

    const clienteSaasRef = doc(db, "clientes-saas", perfil.clienteId);

    const nuevoNumero = await runTransaction(db, async (transaction) => {
      const clienteSnap = await transaction.get(clienteSaasRef);

      if (!clienteSnap.exists()) {
        throw new Error("No existe el cliente SaaS asociado.");
      }

      const data = clienteSnap.data();
      const ultimoNumeroPedido = Number(data.ultimoNumeroPedido || 0);
      const siguienteNumero = ultimoNumeroPedido + 1;

      transaction.update(clienteSaasRef, {
        ultimoNumeroPedido: siguienteNumero,
        updatedAt: serverTimestamp(),
      });

      return siguienteNumero;
    });

    return nuevoNumero.toString();
  };

  // 🔹 Guardar (crear o actualizar)
  const guardarPedido = async () => {
    if (!formData.cliente || !formData.fechaPedido) {
      setError("El cliente y la fecha de pedido son obligatorios.");
      return;
    }

    if (!pedido && perfil?.rol !== "superadmin" && !perfil?.clienteId) {
      setError("No se encontró el clienteId del usuario.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const pedidosRef = collection(db, "pedidos");

      // 🔹 EDITAR pedido existente
      if (pedido && pedido.firebaseId) {
        const ref = doc(db, "pedidos", pedido.firebaseId);

        await updateDoc(ref, {
          ...formData,
          clienteBusqueda: (formData.cliente || "").trim().toLowerCase(),
          clienteId: pedido.clienteId || perfil?.clienteId || "",
          updatedAt: serverTimestamp(),
        });

        const pedidoActualizado = {
          ...pedido,
          ...formData,
          clienteId: pedido.clienteId || perfil?.clienteId || "",
        };

        setExito(true);

        setTimeout(() => {
          onPedidoCreado(pedidoActualizado);
          onClose();
        }, 1500);

        return;
      }

      
      // 🔹 CREAR nuevo pedido
      const nuevoID =
        perfil?.rol === "superadmin"
          ? Date.now().toString()
          : await obtenerSiguienteNumeroPedido();

      await asegurarColumnasBaseProduccion(perfil?.clienteId || "");
      const columnaInicial = await obtenerColumnaInicialProduccion(perfil?.clienteId || "");

      if (!columnaInicial) {
        throw new Error("No se encontró la columna inicial de producción.");
      }

      const nuevoPedidoData = {
        id: nuevoID,
        cliente: formData.cliente,
        clienteBusqueda: (formData.cliente || "").trim().toLowerCase(),
        clienteDNI: formData.clienteDNI,
        fechaPedido: formData.fechaPedido,
        fechaEntrega: formData.fechaEntrega,
        estado: formData.estado,
        clienteId: perfil?.clienteId || "",

        // ✅ campos resumen para escalabilidad futura
        cantidadItems: 0,
        totalUnidades: 0,
        montoTotal: 0,
        estadoPago: "Pendiente",

        // ✅ producción
        columnaProduccionId: columnaInicial.id,
        progresoProduccion: 0,
        estadoProduccion: "pendiente",
        produccionFinalizada: false,
        produccionActualizadoAt: serverTimestamp(),
        ultimaAccionProduccionPor: null,
        ultimaAccionProduccionPorNombre: null,
        ultimaAccionProduccionAt: null,

        // ✅ timestamps para orden y paginación
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
              (c) => c.nombre === e.target.value
            );

            setFormData({
              ...formData,
              cliente: seleccionado ? seleccionado.nombre : "",
              clienteDNI: seleccionado ? seleccionado.dni : "",
            });
          }}
        >
          <option value="">Seleccionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.nombre}
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
