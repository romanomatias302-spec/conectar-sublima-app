import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import {FaExclamationCircle} from "react-icons/fa";
import { auth, db } from "../../firebase";
import { cambiarEstadoUsuarioSaas } from "../../firebase/saasEntitlements";
import {
  calculateSaasResourceUsage,
  formatPlanUsage,
  planLimitMessage,
} from "../../domain/saasEntitlementUsage";
import {pendingPlanEntitlements} from "../../domain/saasPlanChange";
import ClienteSaasForm from "./ClienteSaasForm";
import {
  crearInvitacionUsuario,
  cancelarInvitacion,
  escucharInvitacionesPorCliente,
} from "../../firebase/invitacionesUsuarios";
import {
  registrarMovimientoSaas,
  obtenerPagosSaas,
  anularMovimientoSaas,
  cambiarSuspensionManualSaas,
} from "../../firebase/saasPagos";
import DuenoSaasEstadisticas from "./DuenoSaasEstadisticas";
import {
  activateSaasClientRow,
  buildSaasPanelMetrics,
  buildSaasTabUrl,
  classifySaasClient,
  resolveSaasClientStatus,
  filterSaasClients,
  formatSaasMoney,
  getSaasTabFromSearch,
  indexInitialSaasBilling,
  saasBalanceStatus,
  isInteractiveSaasTarget,
  refreshAfterSaasMutation,
  resolveSaasCurrency,
  resolveSaasMovementCurrency,
  resolveSaasPlanLabel,
  resolveSaasPrice,
  restoreSaasSection,
  persistSaasSection,
} from "../../domain/saasPanel";
import "./css/DuenoSaasLayout.css";
import "./css/DuenoSaasSidebar.css";
import "./css/DuenoSaasClientes.css";
import "./css/DuenoSaasEstadisticas.css";
import DuenoSaasSidebar from "./DuenoSaasSidebar";
import {recurringSaasPeriodKey} from "../../domain/saasBillingState";

export default function DuenoSaasPanel() {
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [movimientosSaas, setMovimientosSaas] = useState([]);
  const [usoClientes, setUsoClientes] = useState({});
  const [loading, setLoading] = useState(true);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [clienteUsuarios, setClienteUsuarios] = useState(null);
  const [clienteCuentaCorriente, setClienteCuentaCorriente] = useState(null);

  const [mostrarInvitacion, setMostrarInvitacion] = useState(false);
  const [linkGenerado, setLinkGenerado] = useState("");
  const [creandoInvitacion, setCreandoInvitacion] = useState(false);



  const [formInvitacion, setFormInvitacion] = useState({
    clienteId: "",
    nombre: "",
    email: "",
    rol: "admin",
  });

const [filtroEstado, setFiltroEstado] = useState("todos");
const [busquedaCliente, setBusquedaCliente] = useState("");
const [filtroPlan, setFiltroPlan] = useState([]);
const [filtroPagosMensuales, setFiltroPagosMensuales] = useState(false);
const [mostrarFiltroPlanes, setMostrarFiltroPlanes] = useState(false);
const filtroPlanesRef = useRef(null);
const [filtroPais, setFiltroPais] = useState("todos");
const [filtroMoneda, setFiltroMoneda] = useState("todos");
const [ordenClientes, setOrdenClientes] = useState("recientes");
const [pagosCliente, setPagosCliente] = useState([]);
const [mostrarPago, setMostrarPago] = useState(false);
const [mostrarCargoMasivo, setMostrarCargoMasivo] = useState(false);
const [menuClienteAbierto, setMenuClienteAbierto] = useState(null);
const [seccionActiva, setSeccionActiva] = useState(() =>
  typeof window === "undefined" ? "clientes" : restoreSaasSection(window.localStorage, window.location.search)
);

const [posicionMenuCliente, setPosicionMenuCliente] = useState(null);
const [clienteMobileAbierto, setClienteMobileAbierto] = useState(null);





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

  if (typeof valor === "string") {
    const soloFecha = valor.slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
      const [anio, mes, dia] = soloFecha.split("-");
      return `${dia}/${mes}/${anio}`;
    }
  }

  let fecha = null;

  if (valor?.seconds) {
    fecha = new Date(valor.seconds * 1000);
  } else {
    fecha = new Date(valor);
  }

  if (!fecha || isNaN(fecha.getTime())) return "-";

  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const anio = fecha.getFullYear();

  return `${dia}/${mes}/${anio}`;
};

const obtenerTimestampCliente = (c) => {
  const valor =
    c.createdAt ||
    c.fechaAlta ||
    c.fechaCreacion ||
    c.created_at ||
    null;

  if (!valor) return 0;

  if (valor.seconds) return valor.seconds * 1000;

  const fecha = new Date(valor);
  return isNaN(fecha.getTime()) ? 0 : fecha.getTime();
};

const formatearMoneda = (valor, moneda = "USD") => {
  const codigo = String(moneda || "USD").toUpperCase();

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: codigo,
    minimumFractionDigits: codigo === "ARS" ? 0 : 2,
    maximumFractionDigits: 2,
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
      return lista;
    } catch (error) {
      console.error("Error al cargar clientes SaaS:", error);
    } finally {
      setLoading(false);
    }
  };

  const cargarMovimientosSaas = async () => {
  try {
    const snapshot = await getDocs(collection(db, "saas_pagos"));

    const lista = snapshot.docs.map((docu) => ({
      id: docu.id,
      ...docu.data(),
    }));

    setMovimientosSaas(lista);
    return lista;
  } catch (error) {
    console.error("Error cargando movimientos SaaS:", error);
  }
};

const mapearUsoClientes = (snapshot) => {
  const uso = {};

  snapshot.docs.forEach((docu) => {
    const data = docu.data();
    const clienteId = data.clienteId || docu.id;

    if (!clienteId) return;

    const ultimoUso =
      data.ultimoUsoAt?.seconds
        ? new Date(data.ultimoUsoAt.seconds * 1000).toISOString().slice(0, 10)
        : data.updatedAt?.seconds
        ? new Date(data.updatedAt.seconds * 1000).toISOString().slice(0, 10)
        : data.ultimoUso || "";

    uso[clienteId] = {
      pedidosUltimos30: Number(data.pedidosUltimos30 || 0),
      ventasUltimos30: Number(data.ventasUltimos30 || 0),
      imagenesPedidoUltimos30: Number(data.imagenesPedidoUltimos30 || 0),
      storageUltimos30MB: Number(data.storageUltimos30MB || 0),

      pedidos: Number(data.pedidosTotal || data.pedidos || 0),
      ventas: Number(data.ventasTotal || data.ventas || 0),
      imagenesPedidoTotal: Number(data.imagenesPedidoTotal || 0),
      storageTotalMB: Number(data.storageTotalMB || 0),

      ultimoUso,
    };
  });

  setUsoClientes(uso);
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

  const cargarSucursales = async () => {
    try {
      const snapshot = await getDocs(collection(db, "sucursales"));
      setSucursales(snapshot.docs.map((item) => ({firebaseId: item.id, ...item.data()})));
    } catch (error) {
      console.error("Error cargando sucursales SaaS:", error);
    }
  };

  const cargarInvitaciones = async (clientesActuales = clientes) => {
    try {
      const nombres = new Map(clientesActuales.map((cliente) => [cliente.id, cliente.nombre || cliente.id]));
      const snapshot = await getDocs(collection(db, "invitaciones_usuarios"));
      const todas = snapshot.docs.map((item) => ({...item.data(), id: item.id}))
        .filter((inv) => nombres.has(inv.clienteId))
        .map((inv) => ({...inv, clienteNombre: nombres.get(inv.clienteId)}))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setInvitaciones(todas);
    } catch (error) {
      console.error("Error cargando invitaciones:", error);
    }
  };

useEffect(() => {
  cargarUsuarios();
  cargarSucursales();
  cargarMovimientosSaas();

  const unsubClientes = onSnapshot(
    collection(db, "clientes-saas"),
    (snapshot) => {
      const lista = snapshot.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));

      setClientes(lista);
      setLoading(false);

      cargarInvitaciones(lista);
    },
    (error) => {
      console.error(
        "Error escuchando clientes SaaS:",
        error
      );

      setLoading(false);
    }
  );

  const unsubUso = onSnapshot(
    collection(db, "clientes-saas-uso"),
    (snapshot) => {
      mapearUsoClientes(snapshot);
    },
    (error) => {
      console.error(
        "Error escuchando uso SaaS:",
        error
      );
    }
  );

  return () => {
    unsubClientes();
    unsubUso();
  };
}, []);

const clienteUsuariosUsage = useMemo(() => calculateSaasResourceUsage({
  client: clienteUsuarios || {},
  users: usuarios.filter((user) => user.clienteId === clienteUsuarios?.id),
  invitations: invitaciones.filter((item) => item.clienteId === clienteUsuarios?.id),
}), [clienteUsuarios, usuarios, invitaciones]);

const usoEntitlementsCliente = (cliente) => calculateSaasResourceUsage({
  client: cliente,
  users: usuarios.filter((user) => user.clienteId === cliente.id),
  invitations: invitaciones.filter((item) => item.clienteId === cliente.id),
  branches: sucursales.filter((branch) => branch.clienteId === cliente.id),
});

useEffect(() => {
  const syncTab = () => setSeccionActiva(restoreSaasSection(window.localStorage, window.location.search));
  window.addEventListener("popstate", syncTab);
  const current = restoreSaasSection(window.localStorage, window.location.search);
  const raw = new URLSearchParams(window.location.search).get("tab");
  if (raw && raw !== current) {
    window.history.replaceState(null, "", buildSaasTabUrl(window.location, current));
  }
  return () => window.removeEventListener("popstate", syncTab);
}, []);

useEffect(() => { persistSaasSection(window.localStorage, seccionActiva); }, [seccionActiva]);

const cambiarSeccion = (tab) => {
  const nextUrl = buildSaasTabUrl(window.location, tab);
  window.history.pushState(null, "", nextUrl);
  setSeccionActiva(getSaasTabFromSearch(new URL(nextUrl, window.location.origin).search));
};

const refrescarDatosSaas = async (kind) => {
  let refreshedClients = null;
  await refreshAfterSaasMutation(kind, {
    clients: async () => {
      refreshedClients = await cargarClientes();
    },
    movements: cargarMovimientosSaas,
  });
  return refreshedClients;
};

  useEffect(() => {
  const cerrarMenu = () => {
    setMenuClienteAbierto(null);
    setPosicionMenuCliente(null);
  };

  window.addEventListener("scroll", cerrarMenu, true);
  window.addEventListener("resize", cerrarMenu);

  return () => {
    window.removeEventListener("scroll", cerrarMenu, true);
    window.removeEventListener("resize", cerrarMenu);
  };
}, []);

useEffect(() => {
  function handleClickOutside(event) {
    if (
      filtroPlanesRef.current &&
      !filtroPlanesRef.current.contains(event.target)
    ) {
      setMostrarFiltroPlanes(false);
    }
  }

  if (mostrarFiltroPlanes) {
    document.addEventListener("mousedown", handleClickOutside);
  }

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, [mostrarFiltroPlanes]);

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
  if (creandoInvitacion) return;

  try {
    setCreandoInvitacion(true);

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

    // Refrescar únicamente las invitaciones del cliente afectado.
    const clienteActual = clientes.find(
      (c) => c.id === formInvitacion.clienteId
    );

    const nuevasInvitaciones =
      await escucharInvitacionesPorCliente(
        formInvitacion.clienteId
      );

    setInvitaciones((prev) => [
      ...prev.filter(
        (inv) =>
          inv.clienteId !== formInvitacion.clienteId
      ),
      ...nuevasInvitaciones.map((inv) => ({
        ...inv,
        clienteNombre:
          clienteActual?.nombre ||
          formInvitacion.clienteId,
      })),
    ]);
  } catch (error) {
    console.error(error);

    const mensaje =
      String(error?.message || "").includes(
        "INVITATION_ALREADY_PENDING"
      )
        ? "Ya existe una invitación pendiente para este email."
        : error?.message ||
          "No se pudo crear la invitación.";

    alert(mensaje);
  } finally {
    setCreandoInvitacion(false);
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

    setInvitaciones((prev) =>
      prev.map((inv) =>
        inv.id === id
          ? { ...inv, estado: "cancelada" }
          : inv
      )
    );
  } catch (error) {
    console.error(error);
    alert(
      error?.message ||
        "No se pudo cancelar la invitación."
    );
  }
};

  const suspenderUsuario = async (usuario) => {
    const ok = window.confirm(`¿Suspender usuario ${usuario.email}?`);
    if (!ok) return;

    try {
      await cambiarEstadoUsuarioSaas({
        clienteId: usuario.clienteId,
        uid: usuario.firebaseId,
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
      await cambiarEstadoUsuarioSaas({
        clienteId: usuario.clienteId,
        uid: usuario.firebaseId,
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

const movimientosSaasActivos = useMemo(
  () => movimientosSaas.filter((m) => m.anulado !== true),
  [movimientosSaas]
);
const initialBillingIndex = useMemo(() => indexInitialSaasBilling(clientes, movimientosSaas), [clientes, movimientosSaas]);

const pagosSaasActivos = useMemo(
  () => movimientosSaasActivos.filter((m) => m.tipoMovimiento === "pago"),
  [movimientosSaasActivos]
);

const pagosPorCliente = useMemo(() => pagosSaasActivos.reduce((acc, pago) => {
  const clienteId = pago.clienteSaasId;
  if (!clienteId) return acc;

  if (!acc[clienteId]) {
    acc[clienteId] = {
      cantidadPagos: 0,
      totalPagado: 0,
      ultimoPago: "",
    };
  }

  acc[clienteId].cantidadPagos += 1;
  acc[clienteId].totalPagado += Number(pago.monto || 0);

  if (pago.fechaPago && pago.fechaPago > acc[clienteId].ultimoPago) {
    acc[clienteId].ultimoPago = pago.fechaPago;
  }

  return acc;
}, {}), [pagosSaasActivos]);


const metricasPanel = useMemo(
  () => buildSaasPanelMetrics(clientes, movimientosSaas),
  [clientes, movimientosSaas]
);
const resumenDashboard = {
  totalClientes: clientes.length,
  activos: metricasPanel.counts.active,
  gracia: metricasPanel.counts.grace,
  suspendidos: metricasPanel.churn.risk + metricasPanel.churn.recovery,
  noRecuperados: metricasPanel.counts.churn,
  enPrueba: metricasPanel.counts.trial,
  conDeuda: clientes.filter((c) => Number(c.saldoCuentaCorriente || 0) > 0).length,
  monedasConDeuda: Object.keys(metricasPanel.debt).length,
  pagosRegistrados: pagosSaasActivos.length,
};

const planesFiltro = [...new Set([...clientes.map(resolveSaasPlanLabel), "Legacy mensual", "Legacy anual", "Personalizado"])].sort();
const alternarPlanFiltro = (plan) => {
  setFiltroPagosMensuales(false);
  setFiltroPlan((actual) => {
    const lista = Array.isArray(actual) ? actual : [];

    return lista.includes(plan)
      ? lista.filter((item) => item !== plan)
      : [...lista, plan];
  });
};

const limpiarFiltroPlanes = () => {
  setFiltroPagosMensuales(false);
  setFiltroPlan([]);
};

const seleccionarPlanesPagosMensuales = () => {
  setFiltroPlan([]);
  setFiltroPagosMensuales(true);
};
const paisesFiltro = [...new Set(clientes.map((c) => c.pais).filter(Boolean))].sort();
const monedasFiltro = [
  ...new Set(
    clientes
      .map((c) => resolveSaasCurrency(c, "USD"))
      .filter(Boolean)
  ),
].sort();

const clientesFiltrados = useMemo(() => filterSaasClients(clientes, {
    search: busquedaCliente,
    state: filtroEstado,
    plan: filtroPlan,
    paidMonthly: filtroPagosMensuales,
    country: filtroPais,
    currency: filtroMoneda,
  })
  .sort((a, b) => {
  if (ordenClientes === "recientes") {
    return obtenerTimestampCliente(b) - obtenerTimestampCliente(a);
  }

  if (ordenClientes === "antiguos") {
    return obtenerTimestampCliente(a) - obtenerTimestampCliente(b);
  }

  if (ordenClientes === "nombre") {
    return (a.nombre || "").localeCompare(b.nombre || "");
  }

  if (ordenClientes === "estado") {
    const aActivo = ["active", "grace"].includes(resolveSaasClientStatus(a));
    const bActivo = ["active", "grace"].includes(resolveSaasClientStatus(b));

    if (aActivo === bActivo) return 0;

    return aActivo ? -1 : 1;
  }

    return 0;
  }), [clientes, busquedaCliente, filtroEstado, filtroPlan, filtroPagosMensuales, filtroPais, filtroMoneda, ordenClientes]);

const periodoActual = new Date().toISOString().slice(0, 7);

const fechaPeriodoAnterior = new Date();
fechaPeriodoAnterior.setMonth(fechaPeriodoAnterior.getMonth() - 1);

const periodoAnterior = fechaPeriodoAnterior.toISOString().slice(0, 7);

const periodosDisponibles = [
  ...new Set([
    periodoActual,
    periodoAnterior,
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
const periodoCargoEsperado = clienteCuentaCorriente
  ? recurringSaasPeriodKey(clienteCuentaCorriente, formPago.fechaPago)
  : "";

const clientesParaCargoMasivo = clientes.filter((c) => {
  const planCliente = c.planNombre || c.plan;

  if (planCliente !== formCargoMasivo.planNombre) return false;

  if (c.suspendidoManual === true) return false;
  if (c.suspendidoPorSistema === true) return false;
  if (["suspendida", "suspended", "gracia", "past_due"].includes(String(c.subscriptionStatus || c.estadoSuscripcion || "").toLowerCase())) return false;
  if (Number(c.saldoCuentaCorriente || 0) > 0) return false;
  if ((c.estado || "") === "inactivo") return false;
  if ((c.estadoSuscripcion || "") === "cancelado") return false;

  return true;
});

const monedasCargoMasivo = [
  ...new Set(
    clientesParaCargoMasivo.map((cliente) =>
      resolveSaasCurrency(cliente, "USD")
    )
  ),
];
const monedaCargoMasivo = monedasCargoMasivo.length === 1
  ? monedasCargoMasivo[0]
  : "";

const emitirCargoMasivo = async () => {
  if (!formCargoMasivo.planNombre) {
    alert("Seleccioná un plan.");
    return;
  }

  if (!formCargoMasivo.monto || Number(formCargoMasivo.monto) <= 0) {
    alert("Ingresá un monto válido.");
    return;
  }

  if (monedasCargoMasivo.length > 1) {
    alert(
      "El plan seleccionado incluye clientes con distintas monedas de facturación. " +
      "Filtrá o emití los cargos por moneda para evitar importes incorrectos."
    );
    return;
  }

  const ok = window.confirm(
    `Se emitirá un cargo de ${formatearMoneda(
      formCargoMasivo.monto,
      monedaCargoMasivo || "USD"
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

    await refrescarDatosSaas("recurringCharge");
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
  <div className="dueno-saas-layout">
    <DuenoSaasSidebar
      seccionActiva={seccionActiva}
      setSeccionActiva={cambiarSeccion}
      onCerrarSesion={cerrarSesion}
    />

    <main className="dueno-saas-main">

      {seccionActiva === "clientes" && (
        <div style={topbar}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Panel Dueño SaaS</h1>

        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={abrirNuevoCliente} style={btnNuevo}>
            Nuevo cliente
          </button>

          <button
            onClick={() => setMostrarCargoMasivo(true)}
            style={btnGestionar}
          >
            + Cargo mensual masivo
          </button>


        </div>
      </div>
      )}


        {seccionActiva === "estadisticas" && (
          <DuenoSaasEstadisticas
            clientes={clientes}
            movimientosSaas={movimientosSaas}
            usoClientes={usoClientes}
            pagosPorCliente={pagosPorCliente}
            formatearFecha={formatearFecha}
          />
        )}
     {seccionActiva === "clientes" && (
        <>

      <div style={dashboardGrid}>
        <div style={dashboardCard}>
          <strong>Total clientes</strong>
          <span>{resumenDashboard.totalClientes}</span>
        </div>

        <div style={dashboardCard}>
          <strong>Activos</strong>
          <span>{resumenDashboard.activos}</span>
        </div>

        <div style={dashboardCard}>
          <strong>En gracia</strong>
          <span>{resumenDashboard.gracia}</span>
        </div>

        <div style={dashboardCard}>
          <strong>Suspendidos recuperables</strong>
          <span>{resumenDashboard.suspendidos}</span>
        </div>

        <div style={dashboardCard}>
          <strong>No recuperados</strong>
          <span>{resumenDashboard.noRecuperados}</span>
        </div>

        <div style={dashboardCard}>
          <strong>En prueba</strong>
          <span>{resumenDashboard.enPrueba}</span>
        </div>

        <div style={dashboardCard}>
          <strong>Con deuda</strong>
          <span>{resumenDashboard.conDeuda}</span>
        </div>

        <div style={dashboardCard}>
          <strong>Monedas con deuda</strong>
          <span>{resumenDashboard.monedasConDeuda}</span>
        </div>

        <div style={dashboardCard}>
          <strong>Pagos registrados</strong>
          <span>{resumenDashboard.pagosRegistrados}</span>
        </div>
      </div>



      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Clientes SaaS</h2>
          <div className="saas-client-filters" style={filtrosBar}>
            <input
              aria-label="Buscar cliente"
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar nombre, email, ID, país o plan..."
              style={inputFiltro}
            />

            <select
              value={filtroEstado}
              aria-label="Estado y situación de cobro"
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={selectFiltro}
            >
              <option value="todos">Estado / cobro: todos</option>
              <option value="active">Activos</option>
              <option value="grace">En gracia</option>
              <option value="suspended">Suspendidos recuperables</option>
              <option value="churn">No recuperados</option>
              <option value="trial">Pruebas</option>
              <option value="mora">Con saldo a abonar</option>
              <option value="saldo_favor">Con saldo a favor</option>
              <option value="cancelled">Inactivos / cancelados</option>
            </select>
            <select
              value={ordenClientes}
              aria-label="Orden del listado"
              onChange={(e) => setOrdenClientes(e.target.value)}
              style={{...selectFiltro, order: 4}}
            >
              <option value="recientes">Más recientes primero</option>
              <option value="antiguos">Más antiguos primero</option>
              <option value="nombre">Nombre A-Z</option>
              <option value="estado">Activos primero</option>
            </select>

            <select aria-label="País" value={filtroPais} onChange={(e) => setFiltroPais(e.target.value)} style={{...selectFiltro, order: 5}}>
              <option value="todos">Todos los países</option>
              {paisesFiltro.map((pais) => <option key={pais} value={pais}>{pais}</option>)}
            </select>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 4,
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: "#f8fafc",
                  order: 6,
                }}
              >
                {[
                  ["todos", "Todas"],
                  ["ARS", "$ ARS"],
                  ["USD", "US$ USD"],
                ].map(([value, label]) => {
                  const activo = filtroMoneda === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFiltroMoneda(value)}
                      style={{
                        border: 0,
                        borderRadius: 7,
                        padding: "6px 9px",
                        background: activo ? "#fff" : "transparent",
                        color: activo ? "#0284c7" : "#64748b",
                        fontWeight: activo ? 700 : 500,
                        cursor: "pointer",
                        boxShadow: activo
                          ? "0 1px 4px rgba(15,23,42,.10)"
                          : "none",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div
                ref={filtroPlanesRef}
                style={{
                  position: "relative",
                  order: 3,
                }}
              >
              <button
                type="button"
                onClick={() =>
                  setMostrarFiltroPlanes((actual) => !actual)
                }
                style={{
                  ...selectFiltro,
                  width: 190,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  background: "#fff",
                }}
              >
                <span>
                  {filtroPagosMensuales ? "Planes pagos mensuales" : filtroPlan.length === 0
                    ? "Todos los planes"
                    : filtroPlan.length === 1
                    ? filtroPlan[0]
                    : `${filtroPlan.length} planes`}
                </span>

                <span style={{ fontSize: 11 }}>▼</span>
              </button>

              {mostrarFiltroPlanes && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    zIndex: 30,
                    width: 280,
                    maxHeight: 360,
                    overflowY: "auto",
                    padding: "12px",
                    background: "#fff",
                    border: "1px solid #dbe3ee",
                    borderRadius: 14,
                    boxShadow: "0 16px 35px rgba(15, 23, 42, 0.16)",
                  }}
                >
                  <button
                    type="button"
                    onClick={seleccionarPlanesPagosMensuales}
                    style={{
                      width: "100%",
                      border: 0,
                      borderRadius: 8,
                      padding: "9px 10px",
                      marginBottom: 8,
                      background: "#eef8fc",
                      color: "#0284c7",
                      fontWeight: 700,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    Planes pagos mensuales
                  </button>

                  <div
                    style={{
                      height: 1,
                      background: "#e2e8f0",
                      margin: "6px 0 8px",
                    }}
                  />

                {planesFiltro.map((plan) => (
                  <label
                    key={plan}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "18px 1fr",
                      alignItems: "start",
                      columnGap: 10,
                      padding: "9px 8px",
                      cursor: "pointer",
                      fontSize: 14,
                      borderRadius: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filtroPlan.includes(plan)}
                      onChange={() => alternarPlanFiltro(plan)}
                      style={{
                        marginTop: 2,
                        width: 15,
                        height: 15,
                        accentColor: "#0284c7",
                      }}
                    />

                    <span
                      style={{
                        lineHeight: 1.25,
                        color: "#111827",
                        fontWeight: filtroPlan.includes(plan) ? 700 : 500,
                      }}
                    >
                      {plan}
                    </span>
                  </label>
                ))}

                  <div
                    style={{
                      height: 1,
                      background: "#e2e8f0",
                      margin: "8px 0",
                    }}
                  />

                  <button
                    type="button"
                    onClick={limpiarFiltroPlanes}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: "6px",
                      fontSize: 13,
                    }}
                  >
                    Mostrar todos
                  </button>
                </div>
              )}
            </div>

            <button type="button" style={{...selectFiltro, order: 7, background: "transparent", color: "#64748b"}} onClick={() => {
              setBusquedaCliente(""); setFiltroEstado("todos"); setFiltroPlan([]); setFiltroPagosMensuales(false);
              setFiltroPais("todos"); setFiltroMoneda("todos"); setOrdenClientes("recientes");
            }}>Limpiar filtros</button>
</div>

           <div className="saas-clientes-mobile">
              {clientesFiltrados.map((c) => {
                const abierto = clienteMobileAbierto === c.id;

                return (
                  <div className="saas-cliente-card-mobile" key={c.id}>
                    <button
                      type="button"
                      className="saas-cliente-card-head"
                      onClick={() =>
                        setClienteMobileAbierto(abierto ? null : c.id)
                      }
                    >
                      <div>
                        <strong>
                          {c.nombre || c.nombreCliente || c.empresa || c.id || "—"}
                          {initialBillingIndex[c.id]?.needsAttention && (
                            <FaExclamationCircle title="Falta registrar el primer cargo o pago de este cliente." aria-label="Falta registrar el primer cargo o pago" style={{marginLeft: 7, color: "#d97706", verticalAlign: "-2px"}} />
                          )}
                        </strong>
                        <span>{resolveSaasPlanLabel(c)}{c.pendingPlanId ? ` · pendiente a ${pendingPlanEntitlements(c)?.planName}` : ""}</span>
                        <span style={{color: saasBalanceStatus(c).color}} title={saasBalanceStatus(c).label}>
                          {formatSaasMoney(saasBalanceStatus(c).balance, resolveSaasCurrency(c, "USD"))}
                        </span>
                      </div>

                      <b>{abierto ? "▲" : "▼"}</b>
                    </button>

                    {abierto && (
                      <div className="saas-cliente-card-body">
                        <p><span>Email</span><strong>{c.email || "—"}</strong></p>
                        <p><span>Estado</span><strong>{classifySaasClient(c).label}</strong></p>
                        <p>
                          <span>Precio</span>
                          <strong>
                            {formatSaasMoney(
                              resolveSaasPrice(c),
                              resolveSaasCurrency(c, "USD")
                            )}
                          </strong>
                        </p>
                        <p><span>País</span><strong>{c.pais || "—"}</strong></p>
                        <p>
                          <span>Próximo cobro</span>

                          <strong
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 2,
                            }}
                          >
                            <span>
                              {formatearFecha(
                                c.nextBillingDate || c.fechaProximoCargo
                              )}
                            </span>

                            <span
                              style={{
                                color: "#d97706",
                                fontSize: 12,
                              }}
                            >
                              Vence: {formatearFecha(c.fechaVencimiento)}
                            </span>
                          </strong>
                        </p>

                        <div className="saas-cliente-card-actions">
                          <button type="button" onClick={() => abrirEditarCliente(c)}>
                            Editar
                          </button>

                          <button type="button" onClick={() => setClienteUsuarios(c)}>
                            Usuarios
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              setClienteCuentaCorriente(c);
                              const pagos = await obtenerPagosSaas(c.id);
                              setPagosCliente(pagos);
                            }}
                          >
                            Cuenta corriente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>     

          {loading ? (
            <p>Cargando clientes...</p>
          ) : (

            
          
          <div className="saas-clientes-table-shell">

            <table
              className="saas-clientes-table-desktop saas-clientes-table-header"
              style={table}
            >
              <colgroup>
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "5%" }} />
              </colgroup>

              <thead>
                <tr>
                  <th style={th}>Empresa</th>
                  <th style={th}>Email</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Saldo</th>
                  <th style={th}>Precio</th>
                  <th style={th}>Estado</th>
                  <th style={th}>País</th>
                  <th style={th}>Cobro / vencimiento</th>
                  <th style={{ ...th, textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
            </table>

            <div className="saas-clientes-table-scroll">
              <table
                className="saas-clientes-table-desktop saas-clientes-table-body"
                style={table}
              >
                <colgroup>
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "5%" }} />
                </colgroup>

                <tbody>
              {clientesFiltrados.map((c) => (
                <tr
                  key={c.id}
                  style={
                    resolveSaasClientStatus(c) === "suspended"
                      ? {...filaSuspendida, cursor: "pointer"}
                      : {cursor: "pointer"}
                  }
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    activateSaasClientRow(event, c, abrirEditarCliente);
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !isInteractiveSaasTarget(event.target, event.currentTarget)) {
                      event.preventDefault();
                      abrirEditarCliente(c);
                    }
                  }}
                >
                  <td style={td}>
                    {c.nombre || c.nombreCliente || c.empresa || c.id || "—"}
                    {initialBillingIndex[c.id]?.needsAttention && (
                      <FaExclamationCircle title="Falta registrar el primer cargo o pago de este cliente." aria-label="Falta registrar el primer cargo o pago" style={{marginLeft: 7, color: "#d97706", verticalAlign: "-2px"}} />
                    )}
                  </td>
                  <td style={td}>{c.email || "—"}</td>
                  <td style={td}>
                    <div>{resolveSaasPlanLabel(c)}</div>
                    {c.pendingPlanId && (() => {
                      const pending = pendingPlanEntitlements(c);
                      const usage = usoEntitlementsCliente(c);
                      return pending ? (
                        <small style={{display: "block", marginTop: 4, color: "#b45309", fontWeight: 700}}>
                          Downgrade pendiente a {pending.planName} · {usage.usedUsers}/{pending.maxUsers ?? "∞"} usuarios · {usage.activeBranches}/{pending.maxBranches ?? "∞"} sucursales
                        </small>
                      ) : null;
                    })()}
                  </td>
                  <td style={td}>
                    <span style={{color: saasBalanceStatus(c).color, fontWeight: 700}} title={saasBalanceStatus(c).label}>
                      {formatSaasMoney(saasBalanceStatus(c).balance, resolveSaasCurrency(c, "USD"))}
                    </span>
                    <small style={{display: "block", color: saasBalanceStatus(c).color}}>{saasBalanceStatus(c).label}</small>
                  </td>

                  <td style={td}>
                    {formatSaasMoney(
                      resolveSaasPrice(c),
                      resolveSaasCurrency(c, "USD")
                    )}
                  </td>
                  <td style={td}>{classifySaasClient(c).label}</td>
                  <td style={td}>{c.pais || "—"}</td>
                  <td style={td}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <span
                        style={{
                          color: "#111827",
                          fontWeight: 600,
                        }}
                      >
                        {formatearFecha(
                          c.nextBillingDate || c.fechaProximoCargo
                        )}
                      </span>

                      <span
                        style={{
                          color: "#d97706",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Vence: {formatearFecha(c.fechaVencimiento)}
                      </span>
                    </div>
                  </td>

                    <td
                      style={{
                        ...td,
                        textAlign: "center",
                        paddingLeft: 6,
                        paddingRight: 6,
                      }}
                    >
                      <button
                        type="button"
                        style={btnMenuCliente}
                      onClick={(e) => {
                        e.stopPropagation();

                          const rect = e.currentTarget.getBoundingClientRect();
                          const altoMenu = 190;
                          const espacioAbajo = window.innerHeight - rect.bottom;

                          if (menuClienteAbierto === c.id) {
                            setMenuClienteAbierto(null);
                            setPosicionMenuCliente(null);
                            return;
                          }

                          setPosicionMenuCliente({
                            top:
                              espacioAbajo < altoMenu
                                ? rect.top - altoMenu - 6
                                : rect.bottom + 6,
                            left: rect.right - 220,
                          });

                          setMenuClienteAbierto(c.id);
                        }}
                      >
                        ⋮
                      </button>

                    </td>
                </tr>
              ))}

              {clientesFiltrados.length === 0 && (
                <tr>
                  <td style={td} colSpan="9">
                    No hay clientes cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          </div>
        )}
      </div>

          </>
            )}

      {menuClienteAbierto &&
        posicionMenuCliente &&
        clientesFiltrados.find((cliente) => cliente.id === menuClienteAbierto) && (
          <div
            style={{
              ...dropdownCliente,
              top: posicionMenuCliente.top,
              left: posicionMenuCliente.left,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const c = clientesFiltrados.find(
                (cliente) => cliente.id === menuClienteAbierto
              );

              if (!c) return null;

              return (
                <>
                  <button
                    type="button"
                    style={dropdownItemCliente}
                    onClick={() => {
                      abrirEditarCliente(c);
                      setMenuClienteAbierto(null);
                      setPosicionMenuCliente(null);
                    }}
                  >
                    Editar cliente
                  </button>

                  <button
                    type="button"
                    style={dropdownItemCliente}
                    onClick={() => {
                      setClienteUsuarios(c);
                      setMenuClienteAbierto(null);
                      setPosicionMenuCliente(null);
                    }}
                  >
                    Usuarios
                  </button>

                  <button
                    type="button"
                    style={dropdownItemCliente}
                    onClick={async () => {
                      setClienteCuentaCorriente(c);
                      const pagos = await obtenerPagosSaas(c.id);
                      setPagosCliente(pagos);
                      setMenuClienteAbierto(null);
                      setPosicionMenuCliente(null);
                    }}
                  >
                    Cuenta corriente
                  </button>

                  <div style={dropdownDivider} />

                {(() => {
                  const estadoCanonico = resolveSaasClientStatus(c);
                  const estaSuspendido = estadoCanonico === "suspended";

                  return (
                    <button
                      type="button"
                      style={{
                        ...dropdownItemCliente,
                        color: estaSuspendido ? "#16a34a" : "#dc2626",
                        fontWeight: 700,
                      }}
                      onClick={async () => {
                        try {
                          await cambiarSuspensionManualSaas(
                            c.id,
                            estaSuspendido ? "activo" : "suspendido"
                          );

                          await refrescarDatosSaas("suspension");

                          setMenuClienteAbierto(null);
                          setPosicionMenuCliente(null);
                        } catch (error) {
                          console.error(
                            "No se pudo cambiar la suspensión SaaS:",
                            error
                          );

                          alert(
                            error?.message ||
                              "No se pudo actualizar el estado del cliente."
                          );
                        }
                      }}
                    >
                      {estaSuspendido
                        ? "Reactivar"
                        : "Suspender manualmente"}
                    </button>
                  );
                })()}
                </>
              );
            })()}
          </div>
        )}

     

      {clienteUsuarios && (
  <div style={overlay}>
    <div style={{ ...modal, maxWidth: 1000 }}>
      <div style={detalleHeader}>
        <div>
          <h2 style={{ margin: 0 }}>
            Usuarios - {clienteUsuarios.nombre}
          </h2>
          <p style={{margin: "6px 0 0", color: "#475569", fontWeight: 600}}>
            {formatPlanUsage(
              clienteUsuariosUsage.usedUsers,
              clienteUsuariosUsage.entitlements.maxUsers,
              clienteUsuariosUsage.entitlements.unlimitedUsers
            )}
          </p>
          {!clienteUsuariosUsage.canAddUser && (
            <p style={{color: "#b91c1c", margin: "6px 0 0"}}>
              {planLimitMessage(
                clienteUsuariosUsage.entitlements,
                "users",
                clienteUsuariosUsage.usersOverLimit
              )}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => abrirInvitacionParaCliente(clienteUsuarios)}
            style={btnNuevo}
            disabled={!clienteUsuariosUsage.canAddUser}
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
                          disabled={!clienteUsuariosUsage.canAddUser}
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
                    periodoFacturado: recurringSaasPeriodKey(clienteCuentaCorriente, prev.fechaPago),
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
                <span>
                  {formatearMoneda(
                    resumenCuenta.cargos,
                    resolveSaasCurrency(clienteCuentaCorriente, "USD")
                  )}
                </span>
              </div>

              <div style={miniCard}>
                <strong>Total pagos</strong>
                <span>
                  {formatearMoneda(
                    resumenCuenta.pagos,
                    resolveSaasCurrency(clienteCuentaCorriente, "USD")
                  )}
                </span>
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
                    ? `Debe ${formatearMoneda(
                        resumenCuenta.saldo,
                        resolveSaasCurrency(clienteCuentaCorriente, "USD")
                      )}`
                    : resumenCuenta.saldo < 0
                    ? `A favor ${formatearMoneda(
                        Math.abs(resumenCuenta.saldo),
                        resolveSaasCurrency(clienteCuentaCorriente, "USD")
                      )}`
                    : formatearMoneda(
                        0,
                        resolveSaasCurrency(clienteCuentaCorriente, "USD")
                      )}
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
                        <td style={td}>
                          {formatearMoneda(
                            p.cargos,
                            resolveSaasCurrency(clienteCuentaCorriente, "USD")
                          )}
                        </td>

                        <td style={td}>
                          {formatearMoneda(
                            p.pagos,
                            resolveSaasCurrency(clienteCuentaCorriente, "USD")
                          )}
                        </td>

                        <td style={td}>
                          {formatearMoneda(
                            p.saldo,
                            resolveSaasCurrency(clienteCuentaCorriente, "USD")
                          )}
                        </td>
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
                    <td style={td}>{formatearFecha(p.fechaPago)}</td>
                    <td style={td}>{p.periodoFacturado || "-"}</td>
                    <td style={td}>{p.tipoMovimiento || "pago"}</td>
                    <td style={td}>{p.concepto || "-"}</td>
                    <td style={td}>{p.medioPago || "-"}</td>
                    <td style={td}>
                      {formatearMoneda(
                        p.monto,
                        resolveSaasMovementCurrency(p) ||
                          resolveSaasCurrency(clienteCuentaCorriente, "USD")
                      )}
                    </td>
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

                              const clientesActualizados = await refrescarDatosSaas("voidMovement") || [];

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
            await refrescarDatosSaas(clienteEditando?.id ? "plan" : "client");
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
                {formatearMoneda(
                  formCargoMasivo.monto,
                  monedaCargoMasivo || "USD"
                )}
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
              periodoFacturado: e.target.value === "cargo"
                ? recurringSaasPeriodKey(clienteCuentaCorriente, prev.fechaPago)
                : prev.periodoFacturado,
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
            setFormPago((prev) => ({
              ...prev,
              fechaPago: e.target.value,
              periodoFacturado: prev.tipoMovimiento === "cargo"
                ? recurringSaasPeriodKey(clienteCuentaCorriente, e.target.value)
                : prev.periodoFacturado,
            }))
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
          {formPago.tipoMovimiento !== "cargo" && <option value="">Sin período</option>}
          {periodoCargoEsperado && !periodosDisponibles.includes(periodoCargoEsperado) && (
            <option value={periodoCargoEsperado}>{periodoCargoEsperado}</option>
          )}
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

                const clientesActualizados = await refrescarDatosSaas("payment") || [];

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

                <button
                  type="button"
                  onClick={crearInvitacion}
                  style={btnPri}
                  disabled={creandoInvitacion || !clienteUsuariosUsage.canAddUser}
                >
                  {creandoInvitacion ? "Creando..." : "Crear invitación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  </div>
);
}

const dashboardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 14,
  marginBottom: 20,
};

const dashboardCard = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
  border: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const btnMenuCliente = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: "20px",
};

const dropdownCliente = {
  position: "fixed",
  width: 220,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
  zIndex: 999999,
  overflow: "hidden",
};

const dropdownItemCliente = {
  width: "100%",
  border: "none",
  background: "#fff",
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: 14,
};

const dropdownDivider = {
  height: 1,
  background: "#e5e7eb",
  margin: "4px 0",
};

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
  overflow: "visible",
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
  borderCollapse: "separate",
  borderSpacing: 0,
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
  maxHeight: "88vh",
  overflowY: "auto",
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
  color: "#6b7280",
};

const saasMenu = {
  display: "flex",
  gap: 10,
  marginTop: 18,
  marginBottom: 18,
  overflowX: "auto",
  paddingBottom: 4,
};

const saasMenuItem = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#374151",
  borderRadius: 999,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const saasMenuItemActivo = {
  background: "#111827",
  color: "#fff",
  borderColor: "#111827",
};

const estadisticasLayout = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const gridEstadisticas = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 18,
};

const tablaScroll = {
  width: "100%",
  overflowX: "auto",
};

