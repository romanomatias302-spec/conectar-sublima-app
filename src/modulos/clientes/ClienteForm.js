import React, { useState } from "react";
import {
  actualizarCliente,
  crearCliente,
} from "../../firebase/clientes";
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
      let clienteGuardado;

      if (cliente?.firebaseId) {
        clienteGuardado = await actualizarCliente({
          perfil,
          firebaseId: cliente.firebaseId,
          datos: formData,
        });
      } else {
        clienteGuardado = await crearCliente({
          perfil,
          datos: formData,
        });
      }

      setError("");

      if (onGuardar) {
        onGuardar(clienteGuardado);
      } else {
        volver();
      }
    } catch (e) {
      if (e?.code === "DNI_DUPLICADO") {
        const existente = e.clienteExistente;

        setError(
          `Ya existe un cliente con el DNI ${formData.dni}: ${
            existente?.nombre || "Sin nombre"
          }. Revisá si corresponde usar ese cliente en lugar de crear uno nuevo.`
        );

        return;
      }

      console.error("Error al guardar cliente:", e);
      setError(
        e?.message
          ? `Error al guardar el cliente: ${e.message}`
          : "Error al guardar el cliente."
      );
    }
  };

  return (
    <div className="form-card">
      <h2 className="form-title">{cliente ? "Editar Cliente" : "Nuevo Cliente"}</h2>

      {error && <div className="alert-error">{error}</div>}

      <div className="form-grid">
        <div className="form-field">
          <label>Documento de identidad</label>
          <input
            name="dni"
            placeholder="Ej: 37256489"
            value={formData.dni}
            onChange={handleChange}
            type="text"
            disabled={soloLectura}
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
