import React, { useState } from "react";
import { collection, doc, addDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { puedeHacer } from "../../utils/permisos";

export default function ClienteForm({ cliente, onVolver, onCancelar, onGuardar, perfil }) {
  const [formData, setFormData] = useState(
    cliente || {
      dni: "",
      nombre: "",
      telefono: "",
      direccion: "",
      localidad: "",
      provincia: "",
      email: "",
    }
  );
  const [error, setError] = useState("");
  const volver = onVolver || onCancelar || (() => {}); // compatibilidad

  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");
  const puedeEditarClientes = puedeHacer(perfil, "clientes", "editar");

  const soloLectura =
    (cliente && !puedeEditarClientes) || (!cliente && !puedeCrearClientes);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const guardarCliente = async () => {
     if (!cliente && !puedeCrearClientes) {
      setError("No tenés permisos para crear clientes.");
      return;
    }

    if (cliente && !puedeEditarClientes) {
      setError("No tenés permisos para editar clientes.");
      return;
    }
    if (!formData.dni) {
      setError("El DNI es obligatorio.");
      return;
    }

    if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
      setError("No se encontró el clienteId del usuario.");
      return;
    }

    try {
      console.log("PERFIL EN ClienteForm:", perfil);
      const datosAGuardar = {
        ...formData,
        dni: formData.dni.toString(),
        clienteId: perfil?.clienteId || "",
      };
        console.log("DATOS A GUARDAR CLIENTE:", datosAGuardar);


      let clienteGuardado;

      if (cliente?.firebaseId) {
        const ref = doc(db, "clientes", cliente.firebaseId);
        await updateDoc(ref, datosAGuardar);

        clienteGuardado = {
          firebaseId: cliente.firebaseId,
          ...datosAGuardar,
        };
      } else {
        const docRef = await addDoc(collection(db, "clientes"), datosAGuardar);

        clienteGuardado = {
          firebaseId: docRef.id,
          ...datosAGuardar,
        };
      }

      setError("");

      if (onGuardar) onGuardar(clienteGuardado);
      else volver();
    } catch (e) {
      console.error("Error al guardar cliente:", e);
      setError(`Error al guardar el cliente: ${e.message}`);
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
            type="text"
            disabled={!!cliente || soloLectura}
          />
        </div>

        <div className="form-field">
          <label>Nombre y Apellido</label>
          <input
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            disabled={soloLectura}
          />
        </div>

      

        <div className="form-field">
          <label>Teléfono</label>
          <input
            name="telefono"
            value={formData.telefono}
            onChange={handleChange}
            disabled={soloLectura}
          />
        </div>

        <div className="form-field wide">
          <label>Dirección</label>
          <input
            name="direccion"
            value={formData.direccion}
            onChange={handleChange}
            disabled={soloLectura}
          />
        </div>

        <div className="form-field">
          <label>Localidad</label>
          <input
            name="localidad"
            value={formData.localidad}
            onChange={handleChange}
            disabled={soloLectura}
          />
        </div>

        <div className="form-field">
          <label>Provincia</label>
          <input
            name="provincia"
            value={formData.provincia}
            onChange={handleChange}
            disabled={soloLectura}
          />
        </div>

        <div className="form-field wide">
          <label>Email</label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              disabled={soloLectura}
            />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-ghost" onClick={volver}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardarCliente} disabled={soloLectura}>
          {cliente ? "Guardar cambios" : "Guardar cliente"}
        </button>
      </div>
    </div>
  );
}
