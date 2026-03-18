import React, { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import "./ClientesList.css";
import ActionMenu from "../../comunes/componentes/ActionMenu";

export default function ClientesList({ onNuevo, onEditar, onVer, perfil }) {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  const cargarClientes = async () => {
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

      const lista = snapshot.docs.map((docu) => ({
        firebaseId: docu.id,
        ...docu.data(),
      }));

      setClientes(lista);
    } catch (error) {
      console.error("Error al cargar clientes:", error);
    }
  };

  useEffect(() => {
    cargarClientes();
  }, [perfil]);

  const eliminarCliente = async (id) => {
    if (window.confirm("¿Seguro que querés eliminar este cliente?")) {
      try {
        await deleteDoc(doc(db, "clientes", id));
        // eliminar visualmente el cliente sin recargar todo
        setClientes((prev) => prev.filter((c) => c.firebaseId !== id));
      } catch (e) {
        console.error("Error al eliminar cliente:", e);
      }
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    const texto = busqueda.toLowerCase();
    return (
      c.nombre?.toLowerCase().includes(texto) ||
      c.apellido?.toLowerCase().includes(texto) ||
      c.dni?.toString().includes(texto)
    );
  });

  return (
    <div className="clientes-lista">
      <div className="encabezado-lista">
        <h1>Clientes</h1>
        <div className="acciones-lista">
          <input
            type="text"
            placeholder="Buscar por nombre o DNI..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="buscador"
          />
          <button onClick={onNuevo} className="btn-nuevo">
            + Nuevo Cliente
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>DNI</th>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Dirección</th>
            <th>Localidad</th>
            <th>Provincia</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clientesFiltrados.map((cliente) => (
            <tr
              key={cliente.firebaseId}
              className="fila-clickable"
              onClick={() => onVer(cliente)}
            >
              <td>{cliente.dni}</td>
              <td>{cliente.nombre} {cliente.apellido}</td>
              <td>{cliente.telefono}</td>
              <td>{cliente.direccion}</td>
              <td>{cliente.localidad}</td>
              <td>{cliente.provincia}</td>
              <td
                className="acciones"
                onClick={(e) => e.stopPropagation()}
              >
                <ActionMenu
                  onVer={() => onVer(cliente)}
                  onEditar={() => onEditar(cliente)}
                  onEliminar={() => eliminarCliente(cliente.firebaseId)}
                />
              </td>
            </tr>
          ))}
        </tbody>

      </table>

      {clientesFiltrados.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "20px", color: "#888" }}>
          No se encontraron resultados para “{busqueda}”.
        </p>
      )}
    </div>
  );
}
