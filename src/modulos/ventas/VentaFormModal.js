import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { crearVenta } from "../../firebase/ventas";
import { puedeHacer } from "../../utils/permisos";

export default function VentaFormModal({ perfil, onClose, onVentaCreada }) {
  const [clientes, setClientes] = useState([]);
  const [formData, setFormData] = useState({
    fechaVenta: new Date().toISOString().split("T")[0],
    clienteRefId: "",
    descripcion: "",
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    pagoInicial: 0,
    medioPago: "efectivo",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const puedeCrearVentas = puedeHacer(perfil, "ventas", "crear");
  const soloLectura = !puedeCrearVentas;

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const clientesRef = collection(db, "clientes");
        const q =
          perfil.rol === "superadmin"
            ? query(clientesRef)
            : query(clientesRef, where("clienteId", "==", perfil.clienteId));

        const snapshot = await getDocs(q);
        setClientes(snapshot.docs.map((d) => ({ firebaseId: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
    };

    fetchClientes();
  }, [perfil]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const guardar = async () => {
    try {
      if (!puedeCrearVentas) {
        setError("No tenés permisos para crear ventas.");
        return;
      }
      setLoading(true);
      setError("");

      const cliente = clientes.find((c) => c.firebaseId === formData.clienteRefId);
      if (!cliente) {
        setError("Seleccioná un cliente.");
        return;
      }

      const venta = await crearVenta({
        perfil,
        cliente,
        fechaVenta: formData.fechaVenta,
        descripcion: formData.descripcion,
        cantidad: Number(formData.cantidad),
        precioUnitario: Number(formData.precioUnitario),
        descuento: Number(formData.descuento),
        pagoInicial: {
          monto: Number(formData.pagoInicial || 0),
          medioPago: formData.medioPago,
          fechaPago: formData.fechaVenta,
          observacion: "Pago inicial",
        },
      });

      if (onVentaCreada) onVentaCreada(venta);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al crear venta.");
    } finally {
      setLoading(false);
    }
  };

  const subtotal = Number(formData.cantidad || 0) * Number(formData.precioUnitario || 0);
  const total = subtotal - Number(formData.descuento || 0);
  const saldo = total - Number(formData.pagoInicial || 0);

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Nueva Venta</h2>

        {error && <div className="error">{error}</div>}

        <label>Fecha</label>
        <input
          type="date"
          name="fechaVenta"
          value={formData.fechaVenta}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Cliente</label>
        <select
          name="clienteRefId"
          value={formData.clienteRefId}
          onChange={handleChange}
          disabled={soloLectura}
        >
          <option value="">Seleccionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.firebaseId} value={c.firebaseId}>
              {c.nombre}
            </option>
          ))}
        </select>

        <label>Descripción</label>
        <input
          name="descripcion"
          value={formData.descripcion}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Cantidad</label>
        <input
          name="cantidad"
          type="number"
          value={formData.cantidad}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Precio unitario</label>
        <input
          name="precioUnitario"
          type="number"
          value={formData.precioUnitario}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Descuento</label>
        <input
          name="descuento"
          type="number"
          value={formData.descuento}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Pago recibido</label>
        <input
          name="pagoInicial"
          type="number"
          value={formData.pagoInicial}
          onChange={handleChange}
          disabled={soloLectura}
        />

        <label>Medio de pago</label>
        <select
          name="medioPago"
          value={formData.medioPago}
          onChange={handleChange}
          disabled={soloLectura}
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="debito">Débito</option>
          <option value="credito">Crédito</option>
          <option value="mp">Mercado Pago</option>
          <option value="otro">Otro</option>
        </select>

        <div style={{ marginTop: 16 }}>
          <p>Subtotal: ${subtotal}</p>
          <p>Total: ${total}</p>
          <p>Saldo: ${saldo}</p>
        </div>

        <div className="modal-buttons">
          <button className="cancelar" onClick={onClose}>Cancelar</button>
          <button onClick={guardar} disabled={loading || soloLectura}>
            {loading ? "Guardando..." : "Guardar Venta"}
          </button>
        </div>
      </div>
    </div>
  );
}