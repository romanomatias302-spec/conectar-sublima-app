import React, { useEffect, useMemo, useState } from "react";
import { cancelarInvitacion, crearInvitacionUsuario, escucharInvitacionesPorCliente } from "../../firebase/invitacionesUsuarios";
import { escucharUsuariosActivosPorCliente } from "../../firebase/usuariosProduccion";

function formatearFecha(fecha) {
  if (!fecha) return "-";

  const d =
    typeof fecha?.toDate === "function"
      ? fecha.toDate()
      : new Date(fecha);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("es-AR");
}

export default function ConfiguracionUsuarios({ perfil }) {
  const [usuarios, setUsuarios] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("usuario");

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [cancelandoId, setCancelandoId] = useState(null);

  const puedeInvitar = perfil?.rol === "admin";

  async function cargarTodo() {
    try {
      if (!perfil?.clienteId) return;

      setLoading(true);

      const [invitacionesData] = await Promise.all([
        escucharInvitacionesPorCliente(perfil.clienteId),
      ]);

      setInvitaciones(invitacionesData);
    } catch (error) {
      console.error("Error cargando usuarios/configuración:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let unsubscribeUsuarios = null;

    async function iniciar() {
      await cargarTodo();

      if (!perfil?.clienteId) return;

      unsubscribeUsuarios = escucharUsuariosActivosPorCliente(
        perfil.clienteId,
        (data) => {
          setUsuarios(data);
        }
      );
    }

    iniciar();

    return () => {
      if (unsubscribeUsuarios) unsubscribeUsuarios();
    };
  }, [perfil?.clienteId]);

  const invitacionesPendientes = useMemo(
    () => invitaciones.filter((i) => i.estado === "pendiente"),
    [invitaciones]
  );

  async function manejarCrearInvitacion() {
    try {
      if (!puedeInvitar) return;

      setMensaje("");
      setGuardando(true);

      const resultado = await crearInvitacionUsuario({
        clienteId: perfil.clienteId,
        nombre,
        email,
        rol,
        creadoPor: {
          uid: perfil?.uid || perfil?.firebaseUid || null,
          nombre: perfil?.nombre || null,
          email: perfil?.email || null,
        },
      });

      const link = `${window.location.origin}/activar-cuenta?token=${resultado.token}`;

      try {
        await navigator.clipboard.writeText(link);
        setMensaje("Invitación creada. El link quedó copiado al portapapeles.");
      } catch {
        setMensaje(`Invitación creada. Copiá este link manualmente: ${link}`);
      }

      setNombre("");
      setEmail("");
      setRol("usuario");
      setMostrarFormulario(false);

      await cargarTodo();
    } catch (error) {
      console.error("Error creando invitación:", error);
      setMensaje(error.message || "No se pudo crear la invitación.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarCancelarInvitacion(invitacionId) {
    try {
      setCancelandoId(invitacionId);
      await cancelarInvitacion(invitacionId);
      await cargarTodo();
    } catch (error) {
      console.error("Error cancelando invitación:", error);
      setMensaje("No se pudo cancelar la invitación.");
    } finally {
      setCancelandoId(null);
    }
  }

  if (loading) {
    return <div>Cargando usuarios...</div>;
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <div className="container-secundaria">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Usuarios activos</h3>
            <p style={{ margin: "6px 0 0", color: "#666" }}>
              Usuarios del equipo que ya activaron su cuenta.
            </p>
          </div>

          {puedeInvitar && (
            <button
              className="btn btn-primary"
              onClick={() => setMostrarFormulario((prev) => !prev)}
            >
              {mostrarFormulario ? "Cerrar" : "Invitar usuario"}
            </button>
          )}
        </div>

        <div style={{ marginTop: "18px", display: "grid", gap: "10px" }}>
          {usuarios.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>Todavía no hay usuarios activos.</p>
          ) : (
            usuarios.map((usuario) => (
              <div
                key={usuario.uid}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "6px",
                  background: "#fff",
                }}
              >
                <strong>{usuario.nombre || "Sin nombre"}</strong>
                <div>{usuario.email || "-"}</div>
                <div style={{ color: "#666", fontSize: "14px" }}>
                  Rol: {usuario.rol || "usuario"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {puedeInvitar && mostrarFormulario && (
        <div className="container-secundaria">
          <h3 style={{ marginTop: 0 }}>Nueva invitación</h3>

          <div style={{ display: "grid", gap: "14px", maxWidth: "460px" }}>
            <div>
              <label>Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej: juan@mail.com"
              />
            </div>

            <div>
              <label>Rol</label>
              <select value={rol} onChange={(e) => setRol(e.target.value)}>
                <option value="usuario">Usuario</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                onClick={manejarCrearInvitacion}
                disabled={guardando}
              >
                {guardando ? "Creando..." : "Crear invitación"}
              </button>

              <button
                className="btn"
                onClick={() => {
                  setMostrarFormulario(false);
                  setNombre("");
                  setEmail("");
                  setRol("usuario");
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container-secundaria">
        <h3 style={{ marginTop: 0 }}>Invitaciones pendientes</h3>

        {mensaje && (
          <p style={{ color: "#64748b", marginTop: 0 }}>
            {mensaje}
          </p>
        )}

        <div style={{ display: "grid", gap: "10px" }}>
          {invitacionesPendientes.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>
              No hay invitaciones pendientes.
            </p>
          ) : (
            invitacionesPendientes.map((inv) => {
              const link = `${window.location.origin}/activar-cuenta?token=${inv.token}`;

              return (
                <div
                  key={inv.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "grid",
                    gap: "6px",
                    background: "#fff",
                  }}
                >
                  <strong>{inv.nombre}</strong>
                  <div>{inv.email}</div>
                  <div style={{ color: "#666", fontSize: "14px" }}>
                    Rol: {inv.rol || "usuario"}
                  </div>
                  <div style={{ color: "#666", fontSize: "13px" }}>
                    Creada: {formatearFecha(inv.createdAt)}
                  </div>
                  <div style={{ color: "#666", fontSize: "13px" }}>
                    Vence: {formatearFecha(inv.expiraAt)}
                  </div>

                  <div
                    style={{
                        marginTop: "8px",
                        padding: "8px 10px",
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "#334155",
                        wordBreak: "break-all",
                    }}
                    >
                    {link}
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          setMensaje("Link copiado al portapapeles.");
                        } catch {
                          setMensaje(`Copiá manualmente este link: ${link}`);
                        }
                      }}
                    >
                      Copiar link
                    </button>

                    <button
                      className="btn"
                      onClick={() => manejarCancelarInvitacion(inv.id)}
                      disabled={cancelandoId === inv.id}
                    >
                      {cancelandoId === inv.id ? "Cancelando..." : "Cancelar invitación"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}