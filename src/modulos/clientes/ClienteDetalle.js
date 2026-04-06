import React from "react";
import "./ClienteDetalle.css";
import { puedeHacer } from "../../utils/permisos";

export default function ClienteDetalle({ cliente, onVolver, onEditar, perfil }) {
  if (!cliente) return <p>No se encontró información del cliente.</p>;
  const puedeEditarClientes = puedeHacer(perfil, "clientes", "editar");

  return (
    <div className="cliente-detalle">
      <h2>Detalle del Cliente</h2>

      <div className="detalle-info">
        <p><strong>Nombre y Apellido:</strong> {cliente.nombre}</p>
        
        <p><strong>DNI:</strong> {cliente.dni}</p>
        <p><strong>Teléfono:</strong> {cliente.telefono}</p>
        <p><strong>Email:</strong> {cliente.email}</p>
        <p><strong>Dirección:</strong> {cliente.direccion}</p>
        <p><strong>Localidad:</strong> {cliente.localidad}</p>
        <p><strong>Provincia:</strong> {cliente.provincia}</p>
      </div>

      <div className="detalle-botones">
        <button className="btn volver" onClick={onVolver}>
          Volver al listado
        </button>
        {puedeEditarClientes && (
          <button className="btn editar" onClick={() => onEditar(cliente)}>
            Editar cliente
          </button>
        )}
      </div>
    </div>
  );
}
