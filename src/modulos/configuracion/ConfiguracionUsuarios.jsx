import React, { useEffect, useMemo, useState } from "react";
import {
  cancelarInvitacion,
  crearInvitacionUsuario,
  escucharInvitacionesPorCliente,
} from "../../firebase/invitacionesUsuarios";
import {
  obtenerUsuariosPorCliente,
  actualizarPermisosUsuario,
  actualizarDatosUsuario,
} from "../../firebase/usuariosConfig";

function formatearFecha(fecha) {
  if (!fecha) return "-";

  const d =
    typeof fecha?.toDate === "function"
      ? fecha.toDate()
      : new Date(fecha);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("es-AR");
}

const PERMISOS_DEFAULT_USUARIO = {
  inicio: {
    ver: true,

    verPedidos: true,
    verClientes: true,
    verIngresos: true,
    verProduccion: true,
    verAtrasados: true,
    verGrafico: true,
    verCuelloBotella: true,
  },

  clientes: {
    ver: false,
    crear: false,
    editar: false,
    eliminar: false,
  },

  pedidos: {
    ver: true,
    crear: false,
    editar: false,
    eliminar: false,
  },

produccion: {
  ver: true,
  mover: true,
  editarDetalle: true,
  asignarUsuario: false,
  verSoloAsignados: false,

  gestionarColumnas: false,
  ordenManual: false,
  cambiarColorTarjeta: false,
},

  ventas: {
    ver: false,
    crear: false,
    editar: false,
    anular: false,
    listado: false,

    cotizaciones: false,
    crearCotizacion: false,
    editarCotizacion: false,
    anularCotizacion: false,
    otorgarDescuentoCotizacion: false,
    convertirCotizacion: false,
  },

  caja: {
    ver: false,
    abrirCerrar: false,
    crearMovimiento: false,
    anularMovimiento: false,
    corregirApertura: false,
    historial: false,
  },

  informes: {
    ver: false,
  },

  configuracion: {
    ver: false,
  },
};

const MODULOS_PERMISOS = [
{
  key: "inicio",
  label: "Inicio",
  acciones: [
    { key: "ver", label: "Ver módulo" },

    { key: "verPedidos", label: "Ver KPI Pedidos" },
    { key: "verClientes", label: "Ver KPI Clientes" },
    { key: "verIngresos", label: "Ver KPI Ingresos" },
    { key: "verProduccion", label: "Ver KPI Producción" },
    { key: "verAtrasados", label: "Ver KPI Atrasados" },

    { key: "verGrafico", label: "Ver gráfico semanal" },
    { key: "verCuelloBotella", label: "Ver cuello de botella" },
  ],
},
  {
    key: "clientes",
    label: "Clientes",
    acciones: [
      { key: "ver", label: "Ver" },
      { key: "crear", label: "Crear" },
      { key: "editar", label: "Editar" },
      { key: "eliminar", label: "Eliminar" },
    ],
  },
  {
    key: "pedidos",
    label: "Pedidos",
    acciones: [
      { key: "ver", label: "Ver" },
      { key: "crear", label: "Crear" },
      { key: "editar", label: "Editar" },
      { key: "eliminar", label: "Eliminar" },
    ],
  },
{
  key: "produccion",
  label: "Producción",
  acciones: [
    { key: "ver", label: "Ver módulo" },
    { key: "mover", label: "Mover tarjetas" },
    { key: "editarDetalle", label: "Editar detalle" },
    { key: "asignarUsuario", label: "Asignar usuario" },

{
  key: "verSoloAsignados",
  label: "Ver solo pedidos asignados ⚠️",
},

    {
      key: "gestionarColumnas",
      label: "Gestionar columnas",
    },

    {
      key: "ordenManual",
      label: "Configurar orden manual",
    },

    {
      key: "cambiarColorTarjeta",
      label: "Cambiar color de tarjetas",
    },
  ],
},
{
  key: "ventas",
  label: "Ventas",
  acciones: [
    { key: "ver", label: "Ver módulo" },
    { key: "crear", label: "Crear venta" },
    { key: "listado", label: "Ver listado ventas" },
    { key: "editar", label: "Editar venta" },
    { key: "anular", label: "Anular venta" },

    { key: "cotizaciones", label: "Ver cotizaciones" },
    { key: "crearCotizacion", label: "Crear cotización" },
    { key: "editarCotizacion", label: "Editar cotización" },
    { key: "anularCotizacion", label: "Anular cotización" },
    { key: "otorgarDescuentoCotizacion", label: "Otorgar descuento en cotización" },
    { key: "convertirCotizacion", label: "Convertir cotización a venta" },
  ],
},

{
  key: "caja",
  label: "Caja",
  acciones: [
    { key: "ver", label: "Ver módulo" },
    {
      key: "abrirCerrar",
      label: "Abrir / cerrar caja",
    },
    {
      key: "crearMovimiento",
      label: "Crear movimientos",
    },
    {
      key: "anularMovimiento",
      label: "Anular movimientos",
    },
    {
      key: "corregirApertura",
      label: "Corregir apertura",
    },
    {
      key: "historial",
      label: "Ver historial",
    },
  ],
},
{
  key: "informes",
  label: "Informes",
  acciones: [
    { key: "ver", label: "Ver" },
    { key: "exportar", label: "Exportar" },
  ],
},
  {
    key: "configuracion",
    label: "Configuración",
    acciones: [{ key: "ver", label: "Ver" }],
  },
];

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

  const [usuarioEditandoPermisos, setUsuarioEditandoPermisos] = useState(null);
  const [permisosEditando, setPermisosEditando] = useState(PERMISOS_DEFAULT_USUARIO);
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [usuarioEditandoDatos, setUsuarioEditandoDatos] = useState(null);
  const [nombreEditando, setNombreEditando] = useState("");
  const [guardandoDatosUsuario, setGuardandoDatosUsuario] = useState(false);
  const [busquedaUsuario, setBusquedaUsuario] = useState("");

  const puedeInvitar = perfil?.rol === "admin";

  async function cargarTodo() {
    try {
      if (!perfil?.clienteId) return;

      setLoading(true);

      const [usuariosData, invitacionesData] = await Promise.all([
        obtenerUsuariosPorCliente(perfil.clienteId),
        escucharInvitacionesPorCliente(perfil.clienteId),
      ]);

      setUsuarios(usuariosData);
      setInvitaciones(invitacionesData);
    } catch (error) {
      console.error("Error cargando usuarios/configuración:", error);
      setMensaje("No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarTodo();
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

  function abrirEditorPermisos(usuario) {
    setUsuarioEditandoPermisos(usuario);
    setPermisosEditando({
      ...PERMISOS_DEFAULT_USUARIO,
      ...(usuario?.permisos || {}),
    });
  }

  function cerrarEditorPermisos() {
    setUsuarioEditandoPermisos(null);
    setPermisosEditando(PERMISOS_DEFAULT_USUARIO);
  }

  function abrirEditorDatosUsuario(usuario) {
  setUsuarioEditandoDatos(usuario);
  setNombreEditando(usuario.nombre || "");
}

function cerrarEditorDatosUsuario() {
  setUsuarioEditandoDatos(null);
  setNombreEditando("");
}

async function guardarDatosUsuario() {
  try {
    if (!usuarioEditandoDatos?.uid) return;

    setGuardandoDatosUsuario(true);
    setMensaje("");

    await actualizarDatosUsuario(usuarioEditandoDatos.uid, {
      nombre: nombreEditando.trim(),
    });

    setMensaje("Usuario actualizado correctamente.");
    cerrarEditorDatosUsuario();
    await cargarTodo();
  } catch (error) {
    console.error("Error actualizando usuario:", error);
    setMensaje("No se pudo actualizar el usuario.");
  } finally {
    setGuardandoDatosUsuario(false);
  }
}

async function cambiarEstadoUsuario(usuario, activo) {
  try {
    if (!usuario?.uid) return;

    const texto = activo ? "reactivar" : "anular";
    const confirmar = window.confirm(`¿Querés ${texto} este usuario?`);

    if (!confirmar) return;

    setMensaje("");

    await actualizarDatosUsuario(usuario.uid, {
      activo,
    });

    setMensaje(activo ? "Usuario reactivado." : "Usuario anulado.");
    await cargarTodo();
  } catch (error) {
    console.error("Error cambiando estado de usuario:", error);
    setMensaje("No se pudo cambiar el estado del usuario.");
  }
}

function togglePermiso(modulo, accion) {
  const valorActual = !!permisosEditando?.[modulo]?.[accion];
  const nuevoValor = !valorActual;

  if (modulo === "produccion" && accion === "verSoloAsignados" && nuevoValor) {
    const confirmar = window.confirm(
      "Atención: si activás esta opción, el usuario solo verá los pedidos que tenga asignados.\n\nSi no tiene pedidos asignados, verá el tablero de producción vacío.\n\n¿Querés activar este permiso?"
    );

    if (!confirmar) return;
  }

  setPermisosEditando((prev) => ({
    ...prev,
    [modulo]: {
      ...(prev[modulo] || {}),
      [accion]: nuevoValor,
    },
  }));
}

  async function guardarPermisosUsuario() {
    try {
      if (!usuarioEditandoPermisos?.uid) return;

      setGuardandoPermisos(true);
      setMensaje("");

      await actualizarPermisosUsuario(
        usuarioEditandoPermisos.uid,
        permisosEditando
      );

      setMensaje("Permisos actualizados correctamente.");
      cerrarEditorPermisos();
      await cargarTodo();
    } catch (error) {
      console.error("Error guardando permisos:", error);
      setMensaje("No se pudieron actualizar los permisos.");
    } finally {
      setGuardandoPermisos(false);
    }
  }

  if (loading) {
    return <div>Cargando usuarios...</div>;
  }

  return (
    
    <div style={{ display: "grid", gap: "24px" }}>

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Nueva invitación</h3>
            <p style={{ margin: "6px 0 0", color: "#666" }}>
              Invitá nuevos usuarios para que activen su cuenta.
            </p>

          {puedeInvitar && (
            <button
              className="btn btn-primary"
              onClick={() => setMostrarFormulario((prev) => !prev)}
            >
              {mostrarFormulario ? "Cerrar" : "Invitar usuario"}
            </button>
          )}
          </div>


        </div>

                     <div className="container-secundaria">

        <h3 style={{ marginTop: 0 }}>Invitaciones pendientes</h3>



        {mensaje && (

          <p style={{ color: "#64748b", marginTop: 0 }}>{mensaje}</p>

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



                  <div

                    style={{

                      display: "flex",

                      gap: "8px",

                      flexWrap: "wrap",

                      marginTop: "8px",

                    }}

                  >

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

                      {cancelandoId === inv.id

                        ? "Cancelando..."

                        : "Cancelar invitación"}

                    </button>

                  </div>

                </div>

              );

            })

          )}

        </div>

      </div>   

      </div>
      <div className="container-secundaria">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
         
          <div>
            <h3 style={{ margin: 0 }}>Usuarios activos</h3>
            <p style={{ margin: "6px 0 0", color: "#666" }}>
              Usuarios del equipo que ya activaron su cuenta.
            </p>
          </div>


        </div>

        <div style={{ marginBottom: "16px" }}>
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={busquedaUsuario}
            onChange={(e) => setBusquedaUsuario(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
            }}
          />
        </div>

        <div style={{ marginTop: "18px", display: "grid", gap: "10px" }}>
          {usuarios.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>
              Todavía no hay usuarios activos.
            </p>
          ) : (
            [...usuarios]
              .filter((usuario) => {
                const texto = busquedaUsuario.toLowerCase();

                return (
                  (usuario.nombre || "")
                    .toLowerCase()
                    .includes(texto) ||
                  (usuario.email || "")
                    .toLowerCase()
                    .includes(texto)
                );
              })
              .sort((a, b) => {
                if (a.activo === false && b.activo !== false) return 1;
                if (a.activo !== false && b.activo === false) return -1;
                return (a.nombre || a.email || "").localeCompare(b.nombre || b.email || "");
              })
              .map((usuario) => (
              <div
                key={usuario.uid}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "6px",
                  background: usuario.activo === false ? "#f1f5f9" : "#fff",
                  opacity: usuario.activo === false ? 0.65 : 1,
                }}
              >
                <strong>{usuario.nombre || "Sin nombre"}</strong>
                <div>{usuario.email || "-"}</div>
                <div style={{ color: "#666", fontSize: "14px" }}>
                  Rol: {usuario.rol || "usuario"}
                </div>

                {usuario.rol !== "admin" && usuario.rol !== "superadmin" && (
                  <div style={{ marginTop: "6px" }}>
                    <button
                      className="btn"
                      onClick={() => abrirEditorPermisos(usuario)}
                    >
                      Editar permisos
                    </button>
                    <button
                      className="btn"
                      onClick={() => abrirEditorDatosUsuario(usuario)}
                      style={{ marginLeft: "8px" }}
                    >
                      Editar nombre
                    </button>

                    <button
                      className="btn"
                      onClick={() => cambiarEstadoUsuario(usuario, usuario.activo === false)}
                      style={{ marginLeft: "8px" }}
                    >
                      {usuario.activo === false ? "Reactivar" : "Anular"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>







      {usuarioEditandoPermisos && (
        <div className="produccion-modal-overlay" onClick={cerrarEditorPermisos}>
          <div
            className="produccion-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, 92vw)",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "24px",
              borderRadius: "18px",
            }}
          >
            <div style={{ marginBottom: "18px" }}>
              <h3 style={{ margin: 0 }}>
                Permisos de{" "}
                {usuarioEditandoPermisos.nombre || usuarioEditandoPermisos.email}
              </h3>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                Definí qué módulos puede ver y qué acciones puede realizar.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "14px",
              }}
            >
              {MODULOS_PERMISOS.map((modulo) => (
                <div
                  key={modulo.key}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "16px",
                    padding: "16px",
                    background: "#fff",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.04)",
                  }}
                >
                  <h4 style={{ margin: "0 0 12px", fontSize: "15px" }}>
                    {modulo.label}
                  </h4>

                  <div style={{ display: "grid", gap: "10px" }}>
                    {modulo.acciones.map((accion) => (
                      <label
                        key={accion.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px minmax(0, 1fr)",
                          alignItems: "start",
                          columnGap: "10px",
                          cursor: "pointer",
                          fontSize: "14px",
                          lineHeight: "1.25",
                          width: "100%",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!permisosEditando?.[modulo.key]?.[accion.key]}
                          onChange={() => togglePermiso(modulo.key, accion.key)}
                          style={{
                            marginTop: "2px",
                            marginLeft: 0,
                            flexShrink: 0,
                          }}
                        />

                        <span
                          style={{
                            display: "block",
                            minWidth: 0,
                            whiteSpace: "normal",
                            wordBreak: "normal",
                            overflowWrap: "break-word",
                          }}
                        >
                          {accion.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="produccion-modal-actions"
              style={{ marginTop: "22px" }}
            >
              <button
                className="btn-produccion-cancelar"
                onClick={cerrarEditorPermisos}
              >
                Cancelar
              </button>

              <button
                className="btn-produccion-primario"
                onClick={guardarPermisosUsuario}
                disabled={guardandoPermisos}
              >
                {guardandoPermisos ? "Guardando..." : "Guardar permisos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {usuarioEditandoDatos && (
        <div className="produccion-modal-overlay" onClick={cerrarEditorDatosUsuario}>
          <div
            className="produccion-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 92vw)",
              padding: "24px",
              borderRadius: "18px",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Editar usuario</h3>

            <label>Nombre</label>
            <input
              type="text"
              value={nombreEditando}
              onChange={(e) => setNombreEditando(e.target.value)}
              placeholder="Nombre del usuario"
            />

            <div className="produccion-modal-actions" style={{ marginTop: "22px" }}>
              <button
                className="btn-produccion-cancelar"
                onClick={cerrarEditorDatosUsuario}
              >
                Cancelar
              </button>

              <button
                className="btn-produccion-primario"
                onClick={guardarDatosUsuario}
                disabled={guardandoDatosUsuario}
              >
                {guardandoDatosUsuario ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}