import React, { useEffect, useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

export default function ClienteSaasForm({
  clienteEditando,
  onClose,
  onGuardado,
}) {
    const [formData, setFormData] = useState({
        nombre: "",
        estado: "activo",
        plan: "instalacion",
        costoInstalacion: 300000,
        mantenimientoMensual: 20000,
        ultimoPago: "",
        fechaAlta: "",
        proximoVencimiento: "",
        observaciones: "",
    });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clienteEditando) {
            setFormData({
        nombre: clienteEditando.nombre || "",
        estado: clienteEditando.estado || "activo",
        plan: clienteEditando.plan || "instalacion",
        costoInstalacion: clienteEditando.costoInstalacion || 300000,
        mantenimientoMensual: clienteEditando.mantenimientoMensual || 20000,
        ultimoPago: clienteEditando.ultimoPago || "",
        fechaAlta: clienteEditando.fechaAlta || "",
        proximoVencimiento: clienteEditando.proximoVencimiento || "",
        observaciones: clienteEditando.observaciones || "",
      });
    }
  }, [clienteEditando]);

    const sumarUnMes = (fechaStr) => {
        if (!fechaStr) return "";

        const partes = fechaStr.split("-");
        if (partes.length !== 3) return "";

        const anio = Number(partes[0]);
        const mes = Number(partes[1]) - 1;
        const dia = Number(partes[2]);

        const fecha = new Date(anio, mes, dia);
        fecha.setMonth(fecha.getMonth() + 1);

        const yyyy = fecha.getFullYear();
        const mm = String(fecha.getMonth() + 1).padStart(2, "0");
        const dd = String(fecha.getDate()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd}`;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => {
        const nuevoValor =
            name === "costoInstalacion" || name === "mantenimientoMensual"
            ? Number(value)
            : value;

        const nuevoForm = {
            ...prev,
            [name]: nuevoValor,
        };

        // Si cambia el último pago, recalculamos el próximo vencimiento
        if (name === "ultimoPago") {
            nuevoForm.proximoVencimiento = sumarUnMes(value);
        }

        return nuevoForm;
        });
    };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    try {
      setLoading(true);

      if (clienteEditando?.id) {
        await updateDoc(doc(db, "clientes-saas", clienteEditando.id), formData);
      } else {
        await addDoc(collection(db, "clientes-saas"), formData);
      }

      onGuardado();
      onClose();
    } catch (error) {
      console.error("Error al guardar cliente SaaS:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ marginTop: 0 }}>
          {clienteEditando ? "Editar cliente SaaS" : "Nuevo cliente SaaS"}
        </h2>

        <form onSubmit={handleGuardar} style={form}>
          <input
            name="nombre"
            placeholder="Nombre de la empresa"
            value={formData.nombre}
            onChange={handleChange}
            style={input}
          />

          <select
            name="estado"
            value={formData.estado}
            onChange={handleChange}
            style={input}
          >
            <option value="activo">Activo</option>
            <option value="mora">Mora</option>
            <option value="suspendido">Suspendido</option>
          </select>

          <input
            name="plan"
            placeholder="Plan"
            value={formData.plan}
            onChange={handleChange}
            style={input}
          />

          <input
            name="costoInstalacion"
            type="number"
            placeholder="Costo instalación"
            value={formData.costoInstalacion}
            onChange={handleChange}
            style={input}
          />

          <input
            name="mantenimientoMensual"
            type="number"
            placeholder="Mantenimiento mensual"
            value={formData.mantenimientoMensual}
            onChange={handleChange}
            style={input}
          />

          <input
            name="ultimoPago"
            type="date"
            value={formData.ultimoPago}
            onChange={handleChange}
            style={input}
          />

          <input
            name="fechaAlta"
            placeholder="Fecha alta"
            value={formData.fechaAlta}
            onChange={handleChange}
            style={input}
          />

          <input
            name="proximoVencimiento"
            type="date"
            value={formData.proximoVencimiento}
            onChange={handleChange}
            style={input}
          />

          <textarea
            name="observaciones"
            placeholder="Observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            style={{ ...input, minHeight: 90, resize: "vertical" }}
          />

          <div style={actions}>
            <button type="button" onClick={onClose} style={btnSec}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} style={btnPri}>
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modal = {
  width: "100%",
  maxWidth: 520,
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
};

const form = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const input = {
  width: "100%",
  height: 42,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

const actions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 10,
};

const btnSec = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
};

const btnPri = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#6d28d9",
  color: "#fff",
  cursor: "pointer",
};