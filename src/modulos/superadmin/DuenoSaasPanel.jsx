import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../../firebase";
import ClienteSaasForm from "./ClienteSaasForm";
import {
  crearInvitacionUsuario,
  escucharInvitacionesPorCliente,
  cancelarInvitacion,
} from "../../firebase/invitacionesUsuarios";
import {
  registrarMovimientoSaas,
  obtenerPagosSaas,
  anularMovimientoSaas,
} from "../../firebase/saasPagos";

export default function DuenoSaasPanel() {
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [clienteUsuarios, setClienteUsuarios] = useState(null);
  const [clienteCuentaCorriente, setClienteCuentaCorriente] = useState(null);

  const [mostrarInvitacion, setMostrarInvitacion] = useState(false);
  const [linkGenerado, setLinkGenerado] = useState("");

  const [formInvitacion, setFormInvitacion] = useState({
    clienteId: "",
    nombre: "",
    email: "",
    rol: "admin",
  });

const [filtroEstado, setFiltroEstado] = useState("todos");
const [busquedaCliente, setBusquedaCliente] = useState("");
const [pagosCliente, setPagosCliente] = useState([]);
const [mostrarPago, setMostrarPago] = useState(false);
const [mostrarCargoMasivo, setMostrarCargoMasivo] = useState(false);

const [formCargoMasivo, setFormCargoMasivo] = useState({
  planNombre: "",
  monto: "",
  fechaPago: new Date().toISOString().slice(0, 10),
  concepto: "mensualidad",
  observacion: "Cargo mensual masivo",
});

const [formPago, setFormPago] = useState({
  tipoMovimiento: "pago",
  monto: "",
  fechaPago: new Date().toISOString().slice(0, 10),
  medioPago: "transferencia",
  concepto: "mensualidad",
  periodoFacturado: "",
  observacion: "",
});

 





  const formatearFecha = (valor) => {
    if (!valor) return "-";
    if (valor.seconds) return new Date(valor.seconds * 1000).toLocaleDateString("es-AR");
    if (typeof valor === "string") return valor;
    return "-";
  };

  const formatearMoneda = (valor) => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(valor || 0));
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

  const cargarUsuarios = async () => {
    try {
      const snapshot = await getDocs(collection(db, "usuarios"));
      const lista = snapshot.docs.map((docu) => ({
        firebaseId: docu.id,
        ...docu.data(),
      }));
      setUsuarios(lista);
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    }
  };

  const cargarInvitaciones = async (clientesActuales = clientes) => {
    try {
      const todas = [];
      for (const cliente of clientesActuales) {
        const lista = await escucharInvitacionesPorCliente(cliente.id);
        todas.push(
          ...lista.map((inv) => ({
            ...inv,
            clienteNombre: cliente.nombre || cliente.id,
          }))
        );
      }
      setInvitaciones(todas);
    } catch (error) {
      console.error("Error cargando invitaciones:", error);
    }
  };

  const cargarTodo = async () => {
    await cargarClientes();
    await cargarUsuarios();
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    if (clientes.length > 0) {
      cargarInvitaciones(clientes);
    }
  }, [clientes]);

  const abrirNuevoCliente = () => {
    setClienteEditando(null);
    setMostrarForm(true);
  };

  const abrirEditarCliente = (cliente) => {
    setClienteEditando(cliente);
    setMostrarForm(true);
  };

  const abrirInvitacionParaCliente = (cliente) => {
    setLinkGenerado("");
    setFormInvitacion({
      clienteId: cliente?.id || "",
      nombre: "",
      email: "",
      rol: "admin",
    });
    setMostrarInvitacion(true);
  };

  const crearInvitacion = async () => {
    try {
      const res = await crearInvitacionUsuario({
        clienteId: formInvitacion.clienteId,
        nombre: formInvitacion.nombre,
        email: formInvitacion.email,
        rol: formInvitacion.rol,
        creadoPor: {
          uid: auth.currentUser?.uid,
          email: auth.currentUser?.email,
        },
      });

      const link = `${window.location.origin}/activar-cuenta?token=${res.token}`;
      setLinkGenerado(link);
      await cargarInvitaciones();
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo crear la invitación.");
    }
  };

  const copiarLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      alert("Link copiado.");
    } catch (error) {
      console.error(error);
      alert("No se pudo copiar el link.");
    }
  };

  const cancelarInvitacionPanel = async (id) => {
    const ok = window.confirm("¿Cancelar esta invitación?");
    if (!ok) return;

    try {
      await cancelarInvitacion(id);
      await cargarInvitaciones();
    } catch (error) {
      console.error(error);
      alert("No se pudo cancelar la invitación.");
    }
  };

  const suspenderUsuario = async (usuario) => {
    const ok = window.confirm(`¿Suspender usuario ${usuario.email}?`);
    if (!ok) return;

    try {
      await updateDoc(doc(db, "usuarios", usuario.firebaseId), {
        activo: false,
      });
      await cargarUsuarios();
    } catch (error) {
      console.error(error);
      alert("No se pudo suspender el usuario.");
    }
  };

  const activarUsuario = async (usuario) => {
    try {
      await updateDoc(doc(db, "usuarios", usuario.firebaseId), {
        activo: true,
      });
      await cargarUsuarios();
    } catch (error) {
      console.error(error);
      alert("No se pudo activar el usuario.");
    }
  };

  const cerrarSesion = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

const clientesFiltrados = clientes
  .filter((c) => {
    const texto = busquedaCliente.trim().toLowerCase();

    const coincideBusqueda =
      !texto || (c.nombre || "").toLowerCase().includes(texto);

    const saldo = Number(c.saldoCuentaCorriente || 0);

    let coincideEstado = true;

    if (filtroEstado === "activo") {
      coincideEstado = (c.estado || "activo") === "activo";
    }

    if (filtroEstado === "suspendido") {
      coincideEstado = (c.estado || "") === "suspendido";
    }

    if (filtroEstado === "inactivo") {
      coincideEstado = (c.estado || "") === "inactivo";
    }

    if (filtroEstado === "mora") {
      coincideEstado = saldo > 0;
    }

    if (filtroEstado === "saldo_favor") {
      coincideEstado = saldo < 0;
    }

    return coincideBusqueda && coincideEstado;
  })
  .sort((a, b) => {
    const aActivo = (a.estado || "activo") !== "suspendido";
    const bActivo = (b.estado || "activo") !== "suspendido";

    if (aActivo === bActivo) return 0;

    return aActivo ? -1 : 1;
  });

const periodoActual = new Date().toISOString().slice(0, 7);

const periodosDisponibles = [
  ...new Set([
    periodoActual,
    ...pagosCliente
      .filter((p) => p.anulado !== true)
      .map((p) => p.periodoFacturado)
      .filter(Boolean),
  ]),
].sort().reverse();


const resumenPorPeriodo = Object.values(
  pagosCliente
    .filter((mov) => mov.anulado !== true && mov.periodoFacturado)
    .reduce((acc, mov) => {
      const periodo = mov.periodoFacturado;
      const monto = Number(mov.monto || 0);
      const tipo = mov.tipoMovimiento || "pago";

      if (!acc[periodo]) {
        acc[periodo] = {
          periodo,
          cargos: 0,
          pagos: 0,
          saldo: 0,
        };
      }

      if (tipo === "cargo" || tipo === "ajuste") {
        acc[periodo].cargos += monto;
      }

      if (tipo === "pago" || tipo === "credito") {
        acc[periodo].pagos += monto;
      }

      acc[periodo].saldo = acc[periodo].cargos - acc[periodo].pagos;

      return acc;
    }, {})
).sort((a, b) => (a.periodo < b.periodo ? 1 : -1));

const resumenCuenta = pagosCliente.reduce(
  (acc, mov) => {
    if (mov.anulado === true) return acc;

    const monto = Number(mov.monto || 0);
    const tipo = mov.tipoMovimiento || "pago";

    if (tipo === "cargo" || tipo === "ajuste") {
      acc.cargos += monto;
    }

    if (tipo === "pago" || tipo === "credito") {
      acc.pagos += monto;
    }

    acc.saldo = acc.cargos - acc.pagos;
    return acc;
  },
  { cargos: 0, pagos: 0, saldo: 0 }
);

const planesDisponibles = [
  ...new Set(
    clientes
      .map((c) => c.planNombre || c.plan)
      .filter(Boolean)
  ),
];

const clientesParaCargoMasivo = clientes.filter((c) => {
  const planCliente = c.planNombre || c.plan;

  if (planCliente !== formCargoMasivo.planNombre) return false;

  if (c.suspendidoManual === true) return false;
  if ((c.estado || "") === "inactivo") return false;
  if ((c.estadoSuscripcion || "") === "cancelado") return false;

  return true;
});

const emitirCargoMasivo = async () => {
  if (!formCargoMasivo.planNombre) {
    alert("Seleccioná un plan.");
    return;
  }

  if (!formCargoMasivo.monto || Number(formCargoMasivo.monto) <= 0) {
    alert("Ingresá un monto válido.");
    return;
  }

  const ok = window.confirm(
    `Se emitirá un cargo de ${formatearMoneda(
      formCargoMasivo.monto
    )} a ${clientesParaCargoMasivo.length} clientes del plan ${
      formCargoMasivo.planNombre
    }. ¿Continuar?`
  );

  if (!ok) return;

  try {
    for (const cliente of clientesParaCargoMasivo) {
      await registrarMovimientoSaas({
        clienteSaas: cliente,
        tipoMovimiento: "cargo",
        monto: Number(formCargoMasivo.monto),
        fechaPago: formCargoMasivo.fechaPago,
        medioPago: "",
        concepto: formCargoMasivo.concepto,
        observacion: formCargoMasivo.observacion,
      });
    }

    await cargarClientes();
    setMostrarCargoMasivo(false);

    setFormCargoMasivo({
      planNombre: "",
      monto: "",
      fechaPago: new Date().toISOString().slice(0, 10),
      concepto: "mensualidad",
      observacion: "Cargo mensual masivo",
    });
  } catch (error) {
    console.error(error);
    alert("No se pudo emitir el cargo masivo.");
  }
};



  return (
    <div style={{ padding: 30 }}>
      <div style={topbar}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Panel Dueño SaaS</h1>
          <p style={{ marginTop: 0 }}>
            Administrá clientes, usuarios y vencimientos.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={abrirNuevoCliente} style={btnNuevo}>
            + Nuevo cliente
          </button>

          <button
            onClick={() => setMostrarCargoMasivo(true)}
            style={btnGestionar}
          >
            + Cargo mensual masivo
          </button>

          <button onClick={cerrarSesion} style={btnSalir}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Clientes SaaS</h2>
          <div style={filtrosBar}>
            <input
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar cliente..."
              style={inputFiltro}
            />

            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={selectFiltro}
            >
              <option value="todos">Todos</option>
              <option value="activo">Activos</option>
              <option value="mora">Con saldo a abonar</option>
              <option value="saldo_favor">Con saldo a favor</option>
              <option value="suspendido">Suspendidos</option>
              <option value="inactivo">Inactivos</option>
            </select>
</div>

        {loading ? (
          <p>Cargando clientes...</p>
        ) : (


          
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Empresa</th>
                <th style={th}>Estado</th>
                <th style={th}>Plan</th>
                <th style={th}>País</th>
                <th style={th}>Cobro</th>
                <th style={th}>Mantenimiento</th>
                <th style={th}>Saldo</th>
                <th style={th}>Último pago</th>
                <th style={th}>Vencimiento</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {clientesFiltrados.map((c) => (
                <tr
                  key={c.id}
                  style={
                    (c.estado || "activo") === "suspendido"
                      ? filaSuspendida
                      : undefined
                  }
                >
                  <td style={td}>{c.nombre || "-"}</td>
                  <td style={td}>
                    {c.suspendidoManual
                      ? "Suspendido manual"
                      : c.suspendidoPorSistema
                      ? "Suspendido por deuda"
                      : c.estado === "suspendido"
                      ? "Suspendido"
                      : "Activo"}
                  </td>
                    <td style={td}>{c.planNombre || c.plan || "-"}</td>

                    <td style={td}>{c.pais || "-"}</td>

                    <td style={td}>
                      {c.metodoCobro === "mercadopago"
                        ? "Mercado Pago"
                        : c.metodoCobro === "stripe"
                        ? "Stripe"
                        : c.metodoCobro === "paypal"
                        ? "PayPal"
                        : "Manual"}
                    </td>

                    <td style={td}>
                      {formatearMoneda(c.planPrecio || c.mantenimientoMensual || 0)}
                    </td>

                  <td style={td}>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          Number(c.saldoCuentaCorriente || 0) > 0
                            ? "#dc2626"
                            : Number(c.saldoCuentaCorriente || 0) < 0
                            ? "#16a34a"
                            : "#111827",
                      }}
                    >
                      {Number(c.saldoCuentaCorriente || 0) > 0
                        ? `Debe ${formatearMoneda(c.saldoCuentaCorriente)}`
                        : Number(c.saldoCuentaCorriente || 0) < 0
                        ? `A favor ${formatearMoneda(Math.abs(Number(c.saldoCuentaCorriente || 0)))}`
                        : formatearMoneda(0)}
                    </span>
                  </td>

                  <td style={td}>{formatearFecha(c.ultimoPago)}</td>
                  <td style={td}>
                    {formatearFecha(c.fechaVencimiento || c.fechaProximoCargo)}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => abrirEditarCliente(c)}
                          style={btnEditar}
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => {
                            setClienteUsuarios(c);
                          }}
                          style={btnGestionar}
                        >
                          Usuarios
                        </button>

                        <button
                          onClick={async () => {
                            setClienteCuentaCorriente(c);

                            const pagos = await obtenerPagosSaas(c.id);
                            setPagosCliente(pagos);
                          }}
                          style={btnGestionar}
                        >
                          Cta. Cte.
                        </button>

                        <button
                          onClick={async () => {
                          const nuevoEstado =
                            (c.estado || "activo") === "activo"
                              ? "suspendido"
                              : "activo";

                          await updateDoc(doc(db, "clientes-saas", c.id), {
                            estado: nuevoEstado,
                            suspendidoManual: nuevoEstado === "suspendido",
                            suspendidoPorSistema: false,
                            motivoSuspension: nuevoEstado === "suspendido" ? "manual" : "",
                            updatedAt: serverTimestamp(),
                          });

                            await updateDoc(doc(db, "clientes-saas", c.id), {
                              estado: nuevoEstado,
                              updatedAt: serverTimestamp(),
                            });

                            await cargarClientes();
                          }}
                          style={{
                            ...btnEditar,
                            background:
                              (c.estado || "activo") === "activo"
                                ? "#dc2626"
                                : "#16a34a",
                          }}
                        >
                          {(c.estado || "activo") === "activo"
                            ? "Suspender"
                            : "Activar"}
                        </button>
                      </div>
                     
                    </div>
                  </td>
                </tr>
              ))}

              {clientesFiltrados.length === 0 && (
                <tr>
                  <td style={td} colSpan="7">
                    No hay clientes cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {clienteUsuarios && (
  <div style={overlay}>
    <div style={{ ...modal, maxWidth: 1000 }}>
      <div style={detalleHeader}>
        <div>
          <h2 style={{ margin: 0 }}>
            Usuarios - {clienteUsuarios.nombre}
          </h2>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => abrirInvitacionParaCliente(clienteUsuarios)}
            style={btnNuevo}
          >
            + Invitar usuario
          </button>

          <button
            onClick={() => setClienteUsuarios(null)}
            style={btnSec}
          >
            Cerrar
          </button>
        </div>
      </div>

      <div style={gridDosColumnas}>
        <div>
          <h3>Usuarios</h3>

          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Email</th>
                <th style={th}>Rol</th>
                <th style={th}>Estado</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {usuarios
                .filter((u) => u.clienteId === clienteUsuarios.id)
                .sort((a, b) => {
                  const aActivo = a.activo !== false;
                  const bActivo = b.activo !== false;

                  if (aActivo === bActivo) return 0;

                  return aActivo ? -1 : 1;
                })
                .map((u) => {
                  const usuarioActivo = u.activo !== false;

                  const planesDisponibles = [
                    ...new Set(
                      clientes
                        .map((c) => c.planNombre || c.plan)
                        .filter(Boolean)
                    ),
                  ];

                  const clientesParaCargoMasivo = clientes.filter((c) => {
                    const planCliente = c.planNombre || c.plan;

                    if (planCliente !== formCargoMasivo.planNombre) return false;

                    // No cobrar clientes suspendidos manualmente por nosotros
                    if (c.suspendidoManual === true) return false;

                    // No cobrar clientes inactivos/cancelados
                    if ((c.estado || "") === "inactivo") return false;
                    if ((c.estadoSuscripcion || "") === "cancelado") return false;

                    return true;
                  });

                  const emitirCargoMasivo = async () => {
                    if (!formCargoMasivo.planNombre) {
                      alert("Seleccioná un plan.");
                      return;
                    }

                    if (!formCargoMasivo.monto || Number(formCargoMasivo.monto) <= 0) {
                      alert("Ingresá un monto válido.");
                      return;
                    }

                    const ok = window.confirm(
                      `Se emitirá un cargo de ${formatearMoneda(formCargoMasivo.monto)} a ${clientesParaCargoMasivo.length} clientes del plan ${formCargoMasivo.planNombre}. ¿Continuar?`
                    );

                    if (!ok) return;

                    try {
                      for (const cliente of clientesParaCargoMasivo) {
                        await registrarMovimientoSaas({
                          clienteSaas: cliente,
                          tipoMovimiento: "cargo",
                          monto: Number(formCargoMasivo.monto),
                          fechaPago: formCargoMasivo.fechaPago,
                          medioPago: "",
                          concepto: formCargoMasivo.concepto,
                          observacion: formCargoMasivo.observacion,
                        });
                      }

                      await cargarClientes();
                      setMostrarCargoMasivo(false);

                      setFormCargoMasivo({
                        planNombre: "",
                        monto: "",
                        fechaPago: new Date().toISOString().slice(0, 10),
                        concepto: "mensualidad",
                        observacion: "Cargo mensual masivo",
                      });
                    } catch (error) {
                      console.error(error);
                      alert("No se pudo emitir el cargo masivo.");
                    }
                  };

                  return (
                    <tr
                      key={u.firebaseId}
                      style={{
                        background: usuarioActivo ? "#fff" : "#f3f4f6",
                        color: usuarioActivo ? "#111827" : "#9ca3af",
                        opacity: usuarioActivo ? 1 : 0.7,
                      }}
                    >
                    <td style={td}>{u.nombre || "-"}</td>
                    <td style={td}>{u.email || "-"}</td>
                    <td style={td}>{u.rol || "-"}</td>
                    <td style={td}>
                      {u.activo ? "Activo" : "Suspendido"}
                    </td>

                    <td style={td}>
                      {u.activo ? (
                        <button
                          style={btnEditar}
                          onClick={() => suspenderUsuario(u)}
                        >
                          Suspender
                        </button>
                      ) : (
                        <button
                          style={btnEditar}
                          onClick={() => activarUsuario(u)}
                        >
                          Activar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

               
            </tbody>
          </table>
        </div>

        <div>
          <h3>Invitaciones</h3>

          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Email</th>
                <th style={th}>Estado</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {invitaciones
                .filter((i) => i.clienteId === clienteUsuarios.id)
                .map((inv) => {
                  const link = `${window.location.origin}/activar-cuenta?token=${inv.token || inv.id}`;

                  return (
                    <tr key={inv.id}>
                      <td style={td}>{inv.nombre}</td>
                      <td style={td}>{inv.email}</td>
                      <td style={td}>{inv.estado}</td>

                      <td style={td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={btnGestionar}
                            onClick={() => copiarLink(link)}
                          >
                            Copiar
                          </button>

                          <button
                            style={btnEditar}
                            onClick={() =>
                              cancelarInvitacionPanel(inv.id)
                            }
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
)}    

      {clienteCuentaCorriente && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 1000 }}>
            <div style={detalleHeader}>
              <div>
                <h2 style={{ margin: 0 }}>
                  Cuenta corriente - {clienteCuentaCorriente.nombre}
                </h2>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  setFormPago((prev) => ({
                    ...prev,
                    tipoMovimiento: "cargo",
                    concepto: "mensualidad",
                    medioPago: "",
                  }));
                  setMostrarPago(true);
                }}
                style={btnNuevo}
              >
                + Emitir cargo
              </button>

              <button
                onClick={() => {
                  setFormPago((prev) => ({
                    ...prev,
                    tipoMovimiento: "pago",
                    concepto: "pago",
                    medioPago: "transferencia",
                  }));
                  setMostrarPago(true);
                }}
                style={btnGestionar}
              >
                + Registrar pago
              </button>

                <button
                  onClick={() => setClienteCuentaCorriente(null)}
                  style={btnSec}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={miniCard}>
                <strong>Total cargos</strong>
                <span>${resumenCuenta.cargos}</span>
              </div>

              <div style={miniCard}>
                <strong>Total pagos</strong>
                <span>${resumenCuenta.pagos}</span>
              </div>

              <div style={miniCard}>
                <strong>Saldo</strong>
                <span
                  style={{
                    color:
                      resumenCuenta.saldo > 0
                        ? "#dc2626"
                        : resumenCuenta.saldo < 0
                        ? "#16a34a"
                        : "#111827",
                    fontWeight: 800,
                  }}
                >
                  {resumenCuenta.saldo > 0
                    ? `Debe $${resumenCuenta.saldo}`
                    : resumenCuenta.saldo < 0
                    ? `A favor $${Math.abs(resumenCuenta.saldo)}`
                    : "$0"}
                </span>
              </div>
            </div>

            {resumenPorPeriodo.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <h3>Estado por período</h3>

                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Período</th>
                      <th style={th}>Cargos</th>
                      <th style={th}>Pagos</th>
                      <th style={th}>Saldo</th>
                      <th style={th}>Estado</th>
                    </tr>
                  </thead>

                  <tbody>
                    {resumenPorPeriodo.map((p) => (
                      <tr key={p.periodo}>
                        <td style={td}>{p.periodo}</td>
                        <td style={td}>{formatearMoneda(p.cargos)}</td>
                        <td style={td}>{formatearMoneda(p.pagos)}</td>
                        <td style={td}>{formatearMoneda(p.saldo)}</td>
                        <td style={td}>
                          <strong
                            style={{
                              color: p.saldo > 0 ? "#dc2626" : "#16a34a",
                            }}
                          >
                            {p.saldo > 0 ? "Pendiente" : "Pagado"}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Período</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Concepto</th>
                  <th style={th}>Medio</th>
                  <th style={th}>Monto</th>
                  <th style={th}>Observación</th>
                </tr>
              </thead>

              <tbody>
                {pagosCliente.map((p) => (
                  <tr
                    key={p.id}
                    style={{
                      opacity: p.anulado ? 0.45 : 1,
                      background: p.anulado ? "#f3f4f6" : "#fff",
                      textDecoration: p.anulado ? "line-through" : "none",
                    }}
                  >
                    <td style={td}>{p.fechaPago || "-"}</td>
                    <td style={td}>{p.periodoFacturado || "-"}</td>
                    <td style={td}>{p.fechaPago || "-"}</td>
                    <td style={td}>{p.tipoMovimiento || "pago"}</td>
                    <td style={td}>{p.concepto || "-"}</td>
                    <td style={td}>{p.medioPago || "-"}</td>
                    <td style={td}>{formatearMoneda(p.monto)}</td>
                    <td style={td}>
                      {p.anulado
                        ? `ANULADO: ${p.motivoAnulacion || "-"}`
                        : p.observacion || "-"}
                    </td>
                    <td style={td}>
                      {!p.anulado && (
                        <button
                          style={{
                            ...btnEditar,
                            background: "#dc2626",
                          }}
                          onClick={async () => {
                            const motivo = window.prompt(
                              "Motivo de anulación:",
                              "Error de carga"
                            );

                            if (!motivo) return;

                            const ok = window.confirm(
                              "¿Seguro que querés anular este movimiento? El saldo se recalculará automáticamente."
                            );

                            if (!ok) return;

                            try {
                              await anularMovimientoSaas({
                                movimientoId: p.id,
                                clienteSaasId: clienteCuentaCorriente.id,
                                motivoAnulacion: motivo,
                              });

                              const pagos = await obtenerPagosSaas(clienteCuentaCorriente.id);
                              setPagosCliente(pagos);

                              await cargarClientes();
                              const clientesSnap = await getDocs(collection(db, "clientes-saas"));
                              const clientesActualizados = clientesSnap.docs.map((docu) => ({
                                id: docu.id,
                                ...docu.data(),
                              }));

                              const clienteActualizado = clientesActualizados.find(
                                (c) => c.id === clienteCuentaCorriente.id
                              );

                              if (clienteActualizado) {
                                setClienteCuentaCorriente(clienteActualizado);
                              }
                            } catch (error) {
                              console.error(error);
                              alert(error.message || "No se pudo anular el movimiento.");
                            }
                          }}
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {pagosCliente.length === 0 && (
                  <tr>
                    <td style={td} colSpan="8">
                      No hay movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mostrarForm && (
        <ClienteSaasForm
          clienteEditando={clienteEditando}
          onClose={() => {
            setMostrarForm(false);
            setClienteEditando(null);
          }}
          onGuardado={async () => {
            await cargarClientes();
            setMostrarForm(false);
            setClienteEditando(null);
          }}
        />
      )}

      {mostrarCargoMasivo && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>Cargo mensual masivo</h2>

            <div style={form}>
              <label>Plan</label>
              <select
                value={formCargoMasivo.planNombre}
                onChange={(e) => {
                  const planSeleccionado = e.target.value;
                  const clienteReferencia = clientes.find(
                    (c) => (c.planNombre || c.plan) === planSeleccionado
                  );

                  setFormCargoMasivo((prev) => ({
                    ...prev,
                    planNombre: planSeleccionado,
                    monto:
                      clienteReferencia?.planPrecio ||
                      clienteReferencia?.mantenimientoMensual ||
                      "",
                  }));
                }}
                style={input}
              >
                <option value="">Seleccionar plan</option>
                {planesDisponibles.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>

              <label>Monto del cargo</label>
              <input
                type="number"
                value={formCargoMasivo.monto}
                onChange={(e) =>
                  setFormCargoMasivo((prev) => ({
                    ...prev,
                    monto: e.target.value,
                  }))
                }
                style={input}
              />

              <strong>
                {formatearMoneda(formCargoMasivo.monto)}
              </strong>

              <label>Fecha del cargo</label>
              <input
                type="date"
                value={formCargoMasivo.fechaPago}
                onChange={(e) =>
                  setFormCargoMasivo((prev) => ({
                    ...prev,
                    fechaPago: e.target.value,
                  }))
                }
                style={input}
              />

              <label>Observación</label>
              <input
                value={formCargoMasivo.observacion}
                onChange={(e) =>
                  setFormCargoMasivo((prev) => ({
                    ...prev,
                    observacion: e.target.value,
                  }))
                }
                style={input}
              />

              <div style={miniCard}>
                <strong>Clientes incluidos</strong>
                <span>{clientesParaCargoMasivo.length}</span>
                <small>
                  Se excluyen clientes suspendidos manualmente, inactivos o cancelados.
                </small>
              </div>

              <div style={actions}>
                <button
                  style={btnSec}
                  onClick={() => setMostrarCargoMasivo(false)}
                >
                  Cancelar
                </button>

                <button style={btnPri} onClick={emitirCargoMasivo}>
                  Emitir cargos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mostrarPago && clienteCuentaCorriente && (
  <div style={overlay}>
    <div style={modal}>
      <h2 style={{ marginTop: 0 }}>
  {formPago.tipoMovimiento === "cargo"
    ? "Emitir cargo SaaS"
    : formPago.tipoMovimiento === "pago"
    ? "Registrar pago SaaS"
    : "Registrar movimiento SaaS"}
</h2>

      <div style={form}>
        <label>Tipo de movimiento</label>
        <select
          value={formPago.tipoMovimiento}
          onChange={(e) =>
            setFormPago((prev) => ({
              ...prev,
              tipoMovimiento: e.target.value,
              concepto:
                e.target.value === "cargo"
                  ? "mensualidad"
                  : e.target.value === "pago"
                  ? "pago"
                  : "ajuste",
            }))
          }
          style={input}
        >
          <option value="cargo">Cargo</option>
          <option value="pago">Pago</option>
          <option value="credito">Crédito / bonificación</option>
          <option value="ajuste">Ajuste</option>
        </select>
        <input
          type="number"
          placeholder="Monto"
          value={formPago.monto}
          onChange={(e) =>
            setFormPago((prev) => ({ ...prev, monto: e.target.value }))
          }
          style={input}
        />

        <input
          type="date"
          value={formPago.fechaPago}
          onChange={(e) =>
            setFormPago((prev) => ({ ...prev, fechaPago: e.target.value }))
          }
          style={input}
        />

        <label>Período</label>
        <select
          value={formPago.periodoFacturado}
          onChange={(e) =>
            setFormPago((prev) => ({
              ...prev,
              periodoFacturado: e.target.value,
            }))
          }
          style={input}
        >
          <option value="">Sin período</option>
          {periodosDisponibles.map((periodo) => (
            <option key={periodo} value={periodo}>
              {periodo}
            </option>
          ))}
        </select>
        <label>Concepto</label>  
        <select
          value={formPago.concepto}
          onChange={(e) =>
            setFormPago((prev) => ({ ...prev, concepto: e.target.value }))
          }
          style={input}
        >
          {formPago.tipoMovimiento === "cargo" && (
            <>
              <option value="mensualidad">Mensualidad</option>
              <option value="instalacion">Instalación</option>
              <option value="cargo_extra">Cargo extra</option>
            </>
          )}

          {formPago.tipoMovimiento === "pago" && (
            <>
              <option value="pago">Pago recibido</option>
            </>
          )}

          {formPago.tipoMovimiento === "credito" && (
            <>
              <option value="bonificacion">Bonificación</option>
              <option value="saldo_favor">Saldo a favor</option>
            </>
          )}

          {formPago.tipoMovimiento === "ajuste" && (
            <>
              <option value="ajuste">Ajuste manual</option>
            </>
          )}
        </select>

        {formPago.tipoMovimiento !== "cargo" && (
          <select
            value={formPago.medioPago}
            onChange={(e) =>
              setFormPago((prev) => ({ ...prev, medioPago: e.target.value }))
            }
            style={input}
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="mp">Mercado Pago</option>
            <option value="otro">Otro</option>
          </select>
        )}

        <input
          placeholder="Observación"
          value={formPago.observacion}
          onChange={(e) =>
            setFormPago((prev) => ({ ...prev, observacion: e.target.value }))
          }
          style={input}
        />

        <div style={actions}>
          <button style={btnSec} onClick={() => setMostrarPago(false)}>
            Cancelar
          </button>

          <button
            style={btnPri}
            onClick={async () => {
              try {
                await registrarMovimientoSaas({
                  clienteSaas: clienteCuentaCorriente,
                  ...formPago,
                });

                const pagos = await obtenerPagosSaas(clienteCuentaCorriente.id);
                setPagosCliente(pagos);

                await cargarClientes();
                const clientesSnap = await getDocs(collection(db, "clientes-saas"));
                const clientesActualizados = clientesSnap.docs.map((docu) => ({
                  id: docu.id,
                  ...docu.data(),
                }));

                const clienteActualizado = clientesActualizados.find(
                  (c) => c.id === clienteCuentaCorriente.id
                );

                if (clienteActualizado) {
                  setClienteCuentaCorriente(clienteActualizado);
                }

                setMostrarPago(false);
                setFormPago({
                  tipoMovimiento: "pago",
                  monto: "",
                  fechaPago: new Date().toISOString().slice(0, 10),
                  medioPago: "transferencia",
                  concepto: "mensualidad",
                  periodoFacturado: "",
                  observacion: "",
                });;
              } catch (error) {
                console.error(error);
                alert(error.message || "No se pudo registrar el pago.");
              }
            }}
          >
            {formPago.tipoMovimiento === "cargo" ? "Guardar cargo" : "Guardar pago"}
          </button>
        </div>
      </div>
    </div>
  </div>
)}

      {mostrarInvitacion && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>Invitar usuario</h2>

            <div style={form}>
              <select
                value={formInvitacion.clienteId}
                onChange={(e) =>
                  setFormInvitacion((prev) => ({
                    ...prev,
                    clienteId: e.target.value,
                  }))
                }
                style={input}
              >
                <option value="">Seleccionar empresa</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>

              <input
                placeholder="Nombre del usuario"
                value={formInvitacion.nombre}
                onChange={(e) =>
                  setFormInvitacion((prev) => ({
                    ...prev,
                    nombre: e.target.value,
                  }))
                }
                style={input}
              />

              <input
                placeholder="Email del usuario"
                type="email"
                value={formInvitacion.email}
                onChange={(e) =>
                  setFormInvitacion((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                style={input}
              />

              <select
                value={formInvitacion.rol}
                onChange={(e) =>
                  setFormInvitacion((prev) => ({
                    ...prev,
                    rol: e.target.value,
                  }))
                }
                style={input}
              >
                <option value="admin">Admin empresa</option>
                <option value="usuario">Usuario operativo</option>
              </select>

              {linkGenerado && (
                <div style={linkBox}>
                  <strong>Link generado</strong>
                  <p style={{ wordBreak: "break-all", marginBottom: 10 }}>{linkGenerado}</p>
                  <button onClick={() => copiarLink(linkGenerado)} style={btnEditar}>
                    Copiar link
                  </button>
                </div>
              )}

              <div style={actions}>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarInvitacion(false);
                    setLinkGenerado("");
                  }}
                  style={btnSec}
                >
                  Cerrar
                </button>

                <button type="button" onClick={crearInvitacion} style={btnPri}>
                  Crear invitación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const topbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const card = {
  marginTop: 20,
  background: "#fff",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
};

const cardDetalle = {
  marginTop: 20,
  background: "#fff",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 4px 18px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
};

const detalleHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 18,
};

const gridDosColumnas = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: 20,
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#0796c9",
  color: "#fff",
  fontSize: 13,
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

const btnGestionar = {
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#eef2ff",
  color: "#3730a3",
  cursor: "pointer",
  fontWeight: 700,
};

const btnInvitar = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
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
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
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

const linkBox = {
  background: "#f3f4f6",
  padding: 12,
  borderRadius: 10,
};

const miniCard = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  minWidth: 140,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const filtrosBar = {
  marginBottom: 14,
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const inputFiltro = {
  height: 38,
  width: 260,
  border: "1px solid #ddd",
  borderRadius: 9,
  padding: "0 12px",
  fontSize: 14,
};

const selectFiltro = {
  height: 38,
  width: 220,
  border: "1px solid #ddd",
  borderRadius: 9,
  padding: "0 12px",
  fontSize: 14,
  background: "#fff",
};

const filaSuspendida = {
  background: "#f3f4f6",
  color: "#9ca3af",
  opacity: 0.75,
};

