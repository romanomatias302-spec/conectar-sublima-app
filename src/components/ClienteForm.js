import React, { useState } from "react";
import { collection, doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function ClienteForm({ cliente, onVolver, onCancelar, onGuardar }) {
  const [formData, setFormData] = useState(
    cliente || {
      dni: "",
      nombre: "",
      apellido: "",
      telefono: "",
      direccion: "",
      localidad: "",
      provincia: "",
      email: "",
    }
  );
  const [error, setError] = useState("");
  const volver = onVolver || onCancelar || (() => {}); // compatibilidad

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const guardarCliente = async () => {
    if (!formData.dni) {
      setError("El DNI es obligatorio.");
      return;
    }
    try {
      const ref = doc(collection(db, "clientes"), formData.dni.toString());
      const docSnap = await getDoc(ref);

      // si es nuevo y ya existe ese DNI
      if (!cliente && docSnap.exists()) {
        setError("Ya existe un cliente con ese DNI.");
        return;
      }

      if (cliente) {
        await updateDoc(ref, formData);
      } else {
        await setDoc(ref, formData);
      }
      setError("");

      // compatibilidad con ambas APIs de navegación
      if (onGuardar) onGuardar(formData);
      else volver();
    } catch (e) {
      console.error("Error al guardar cliente:", e);
      setError("Error al guardar el cliente.");
    }
  };

  return (
    <div className="form-card">
      <h2 className="form-title">{cliente ? "Editar Cliente" : "Nuevo Cliente"}</h2>

      {error && <div className="alert-error">{error}</div>}

      <div className="form-grid">
        <div className="form-field">
          <label>DNI</label>
          <input
            name="dni"
            placeholder="Ej: 37256489"
            value={formData.dni}
            onChange={handleChange}
            type="number"
            disabled={!!cliente}
          />
        </div>

        <div className="form-field">
          <label>Nombre</label>
          <input name="nombre" value={formData.nombre} onChange={handleChange} />
        </div>

        <div className="form-field">
          <label>Apellido</label>
          <input name="apellido" value={formData.apellido} onChange={handleChange} />
        </div>

        <div className="form-field">
          <label>Teléfono</label>
          <input name="telefono" value={formData.telefono} onChange={handleChange} />
        </div>

        <div className="form-field wide">
          <label>Dirección</label>
          <input name="direccion" value={formData.direccion} onChange={handleChange} />
        </div>

        <div className="form-field">
          <label>Localidad</label>
          <input name="localidad" value={formData.localidad} onChange={handleChange} />
        </div>

        <div className="form-field">
          <label>Provincia</label>
          <input name="provincia" value={formData.provincia} onChange={handleChange} />
        </div>

        <div className="form-field wide">
          <label>Email</label>
          <input name="email" type="email" value={formData.email} onChange={handleChange} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-ghost" onClick={volver}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardarCliente}>
          {cliente ? "Guardar cambios" : "Guardar cliente"}
        </button>
      </div>
    </div>
  );
}
