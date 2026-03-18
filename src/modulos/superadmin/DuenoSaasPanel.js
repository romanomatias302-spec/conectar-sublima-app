import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../firebase";
import ClienteSaasForm from "./ClienteSaasForm";


export default function DuenoSaasPanel() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);

    const formatearFecha = (valor) => {
        if (!valor) return "-";

        // Firestore Timestamp
        if (valor.seconds) {
        const fecha = new Date(valor.seconds * 1000);
        return fecha.toLocaleDateString("es-AR");
        }

        // string ya guardado
        if (typeof valor === "string") {
        return valor;
        }

        return "-";
    };

    const cargarClientes = async () => {
        try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, "clientes-saas"));
        const lista = snapshot.docs.map((docu) => ({
            id: docu.id,
            ...docu.data(),
        }));
        setClientes(lista);
        } catch (error) {
        console.error("Error al cargar clientes SaaS:", error);
        } finally {
        setLoading(false);
        }
    };

    useEffect(() => {
        cargarClientes();
    }, []);

      const abrirNuevoCliente = () => {
        setClienteEditando(null);
        setMostrarForm(true);
    };

    const abrirEditarCliente = (cliente) => {
        setClienteEditando(cliente);
        setMostrarForm(true);
    };

    const cerrarSesion = async () => {
        try {
        await signOut(auth);
        } catch (error) {
        console.error("Error al cerrar sesión:", error);
        }
    };

  return (
    <div style={{ padding: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
            <h1 style={{ marginBottom: 6 }}>Panel Dueño SaaS</h1>
            <p style={{ marginTop: 0 }}>Desde acá vas a administrar tus clientes.</p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
            <button onClick={abrirNuevoCliente} style={btnNuevo}>
            + Nuevo cliente
            </button>
            <button onClick={cerrarSesion} style={btnSalir}>
            Cerrar sesión
            </button>
        </div>
        </div>

      <div
        style={{
          marginTop: 20,
          background: "#fff",
          borderRadius: 14,
          padding: 20,
          boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Clientes</h2>

        {loading ? (
          <p>Cargando clientes...</p>
        ) : clientes.length === 0 ? (
          <p>No hay clientes cargados todavía.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Empresa</th>
                <th style={th}>Estado</th>
                <th style={th}>Plan</th>
                <th style={th}>Mantenimiento</th>
                <th style={th}>Último pago</th>
                <th style={th}>Próximo vencimiento</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  
                    <td style={td}>{c.nombre || "-"}</td>
                    <td style={td}>{c.estado || "-"}</td>
                    <td style={td}>{c.plan || "-"}</td>
                    <td style={td}>
                    {c.mantenimientoMensual ? `$${c.mantenimientoMensual}` : "-"}
                    </td>
                    <td style={td}>{formatearFecha(c.ultimoPago)}</td>
                    <td style={td}>{formatearFecha(c.proximoVencimiento)}</td>
                    <td style={td}>
                    <button onClick={() => abrirEditarCliente(c)} style={btnEditar}>
                        Editar
                    </button>
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
            {mostrarForm && (
                <ClienteSaasForm
                clienteEditando={clienteEditando}
                onClose={() => {
                    setMostrarForm(false);
                    setClienteEditando(null);
                }}
                onGuardado={cargarClientes}
                />
            )}
    </div>

  );
}

const th = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
};

const td = {
  padding: "12px 10px",
  borderBottom: "1px solid #f0f0f0",
};

const btnNuevo = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#6d28d9",
  color: "#fff",
  cursor: "pointer",
  height: 40,
};

const btnSalir = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  cursor: "pointer",
  height: 40,
};

const btnEditar = {
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
};