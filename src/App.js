import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./modulos/auth/Login";
import ActivarCuenta from "./modulos/auth/ActivarCuenta";
import Sidebar from "./comunes/componentes/Sidebar";
import ClientesList from "./modulos/clientes/ClientesList";
import ClienteForm from "./modulos/clientes/ClienteForm";
import ClienteDetalle from "./modulos/clientes/ClienteDetalle";
import PedidosList from "./modulos/pedidos/PedidosList";
import PedidoDetalle from "./modulos/pedidos/PedidoDetalle";
import Inicio from "./modulos/inicio/Inicio";
import Configuracion from "./modulos/configuracion/Configuracion";
import MobileMenu from "./comunes/componentes/MobileMenu";
import DuenoSaasPanel from "./modulos/superadmin/DuenoSaasPanel";
import "./App.css";
import VentasList from "./modulos/ventas/VentasList";
import VentaFormModal from "./modulos/ventas/VentaFormModal";
import VentasPage from "./modulos/ventas/VentasPage";
import CotizacionesPage from "./modulos/ventas/CotizacionesPage";
import CotizacionDetalle from "./modulos/ventas/CotizacionDetalle";
import MovimientosList from "./modulos/movimientos/MovimientosList";
import VentaDetalle from "./modulos/ventas/VentaDetalle";
import { obtenerVentaPorId } from "./firebase/ventas";
import ProduccionPage from "./modulos/produccion/ProduccionPage";
import CajaPage from "./modulos/caja/CajaPage";
import { puedeHacer as puedeHacerPerfil } from "./utils/permisos";




export default function App() {
  
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mensajeBloqueo, setMensajeBloqueo] = useState("");
  const [errorConexionPerfil, setErrorConexionPerfil] = useState(false);

  const [vista, setVista] = useState(() => {
    return localStorage.getItem("vistaActual") || "inicio";
  });
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [sidebarExpandido, setSidebarExpandido] = useState(() => {
  return window.innerWidth > 768;
});
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState(null);
  const [cotizacionDetalleId, setCotizacionDetalleId] = useState(() => {
  return localStorage.getItem("cotizacionDetalleId") || "";
});
  const [productosPedidoParaVenta, setProductosPedidoParaVenta] = useState([]);
  const [cotizacionParaVenta, setCotizacionParaVenta] = useState(null);
  const [itemsCotizacionParaVenta, setItemsCotizacionParaVenta] = useState([]);
  const [mostrarModalVenta, setMostrarModalVenta] = useState(false);


  const [origenVista, setOrigenVista] = useState(null);
  useEffect(() => {
    localStorage.setItem("vistaActual", vista);
  }, [vista]);

  useEffect(() => {
  const recuperarVentaDetalle = async () => {
    try {
      if (vista !== "venta-detalle") return;
      if (ventaSeleccionada?.firebaseId) return;

      const ventaIdGuardada = localStorage.getItem("ventaDetalleId");

      if (!ventaIdGuardada) {
        irAVista("ventas-listado");
        return;
      }

      const venta = await obtenerVentaPorId(ventaIdGuardada);

      setVentaSeleccionada(venta);
    } catch (error) {
      console.error("Error recuperando venta tras refresh:", error);
      irAVista("ventas-listado");
    }
  };

  recuperarVentaDetalle();
}, [vista, ventaSeleccionada]);

useEffect(() => {
  const recuperarPedidoDetalle = async () => {
    try {
      if (vista !== "detallePedido") return;
      if (pedidoSeleccionado?.firebaseId) return;

      const pedidoIdGuardado = localStorage.getItem("pedidoDetalleId");

      if (!pedidoIdGuardado) {
        irAVista("pedidos");
        return;
      }

      const pedido = await obtenerPedidoPorId(pedidoIdGuardado);

      if (!pedido) {
        irAVista("pedidos");
        return;
      }

      setPedidoSeleccionado(pedido);
    } catch (error) {
      console.error("Error recuperando pedido tras refresh:", error);
      irAVista("pedidos");
    }
  };

  recuperarPedidoDetalle();
}, [vista, pedidoSeleccionado]);

  const esRutaActivacion = window.location.pathname === "/activar-cuenta";

const puedeHacer = (modulo, accion = "ver") => {
  return puedeHacerPerfil(perfil, modulo, accion);
};

const puedeVerModulo = (modulo) =>
  puedeHacer(modulo, "ver");

const irAVista = (nuevaVista, extra = {}) => {
  const nuevoCliente = extra.cliente ?? null;
  const nuevoPedido = extra.pedido ?? null;
  const nuevaVenta = extra.venta ?? null;
  const nuevaCotizacion = extra.cotizacion ?? null;
  const nuevoOrigen = extra.origen ?? null;
const nuevosProductosPedidoParaVenta =
  extra.productosPedido ?? [];
  const nuevaCotizacionParaVenta = extra.cotizacionParaVenta ?? null;
const nuevosItemsCotizacionParaVenta = extra.itemsCotizacion ?? [];



  setVista(nuevaVista);
  setClienteSeleccionado(nuevoCliente);
  setPedidoSeleccionado(nuevoPedido);
  setVentaSeleccionada(nuevaVenta);
  setCotizacionSeleccionada(nuevaCotizacion);
  setOrigenVista(nuevoOrigen);
  setProductosPedidoParaVenta(nuevosProductosPedidoParaVenta);
  setCotizacionParaVenta(nuevaCotizacionParaVenta);
  setItemsCotizacionParaVenta(nuevosItemsCotizacionParaVenta);
  localStorage.setItem("vistaActual", nuevaVista);

if (nuevaVenta?.firebaseId) {
  localStorage.setItem("ventaDetalleId", nuevaVenta.firebaseId);
}

if (nuevaVista !== "venta-detalle") {
  localStorage.removeItem("ventaDetalleId");
}
if (nuevaCotizacion?.firebaseId) {
  localStorage.setItem("cotizacionDetalleId", nuevaCotizacion.firebaseId);
  setCotizacionDetalleId(nuevaCotizacion.firebaseId);
}

if (nuevaVista !== "cotizacion-detalle") {
  localStorage.removeItem("cotizacionDetalleId");
  setCotizacionDetalleId("");
}

if (nuevoPedido?.firebaseId) {
  localStorage.setItem("pedidoDetalleId", nuevoPedido.firebaseId);
}

if (nuevaVista !== "detallePedido") {
  localStorage.removeItem("pedidoDetalleId");
}

  if (esRutaActivacion) return;

  window.history.pushState(
  {
    vista: nuevaVista,
    cliente: nuevoCliente,
    pedido: nuevoPedido,
    venta: nuevaVenta,
    cotizacion: nuevaCotizacion,
    origen: nuevoOrigen,
  },
    "",
    window.location.pathname
  );
};


  

  

  // ✅ Estado global de modo oscuro (persistente)
  const [modoOscuro, setModoOscuro] = useState(
    localStorage.getItem("modoOscuro") === "true"
  );

  // ✅ Aplicar y guardar preferencia en body y localStorage
  useEffect(() => {
    document.body.classList.toggle("dark-mode", modoOscuro);
    localStorage.setItem("modoOscuro", modoOscuro);
  }, [modoOscuro]);

useEffect(() => {
  let unsubscribePerfil = null;

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    if (unsubscribePerfil) {
      unsubscribePerfil();
      unsubscribePerfil = null;
    }

    if (!user) {
      setUsuario(null);
      setPerfil(null);
      setMensajeBloqueo("");
      setErrorConexionPerfil(false);
      setAuthLoading(false);
      return;
    }

    setUsuario(user);
    setAuthLoading(true);
    setErrorConexionPerfil(false);

    const ref = doc(db, "usuarios", user.uid);

    unsubscribePerfil = onSnapshot(
      ref,
      async (snap) => {
        try {
          if (!snap.exists()) {
            setPerfil(null);
            setMensajeBloqueo("");
            setAuthLoading(false);
            return;
          }

          const dataPerfil = snap.data();

          if (dataPerfil.activo !== true) {
            setPerfil(null);
            setMensajeBloqueo("Tu usuario está suspendido. Contactá al administrador.");
            setAuthLoading(false);
            return;
          }

          let monedaTenant = "ARS";
          let localeMonedaTenant = "es-AR";

          if (dataPerfil.clienteId && dataPerfil.rol !== "superadmin") {
            const clienteSaasRef = doc(db, "clientes-saas", dataPerfil.clienteId);
            const clienteSaasSnap = await getDoc(clienteSaasRef);

            if (!clienteSaasSnap.exists()) {
              setPerfil(null);
              setMensajeBloqueo("No se encontró la empresa asociada a tu cuenta.");
              setAuthLoading(false);
              return;
            }

            const clienteSaasData = clienteSaasSnap.data();

            monedaTenant = clienteSaasData?.moneda || "ARS";
            localeMonedaTenant = clienteSaasData?.localeMoneda || "es-AR";

            const estadoCliente =
              typeof clienteSaasData?.estado === "string"
                ? clienteSaasData.estado.trim().toLowerCase()
                : "";

            if (["suspendido", "bloqueado", "inactivo"].includes(estadoCliente)) {
              setPerfil(null);
              setMensajeBloqueo("Tu cuenta se encuentra suspendida. Contactá al administrador.");
              setAuthLoading(false);
              return;
            }
          }

          setPerfil({
            uid: user.uid,
            firebaseUid: user.uid,
            ...dataPerfil,
            moneda: monedaTenant,
            localeMoneda: localeMonedaTenant,
          });

          setMensajeBloqueo("");
          setErrorConexionPerfil(false);
          setAuthLoading(false);
        } catch (error) {
          console.error("Error escuchando perfil:", error);
          setErrorConexionPerfil(true);
          setAuthLoading(false);
        }
      },
      (error) => {
        console.error("Error listener perfil:", error);
        setErrorConexionPerfil(true);
        setAuthLoading(false);
      }
    );
  });

  return () => {
    if (unsubscribePerfil) unsubscribePerfil();
    unsubAuth();
  };
}, []);

    useEffect(() => {
      if (esRutaActivacion) return;

      window.history.replaceState(
        {
          vista: "inicio",
          cliente: null,
          pedido: null,
        },
        "",
        window.location.pathname
      );

      const manejarPopState = (event) => {
        const state = event.state;

        if (state?.vista) {
          setVista(state.vista);
          setClienteSeleccionado(state.cliente ?? null);
          setPedidoSeleccionado(state.pedido ?? null);
          setVentaSeleccionada(state.venta ?? null);
          setOrigenVista(state.origen ?? null);
          setCotizacionSeleccionada(state.cotizacion ?? null);

          if (state.vista !== "ventas-crear") {
            setCotizacionParaVenta(null);
            setItemsCotizacionParaVenta([]);
          }
        } 
        
        else {
          setVista("inicio");
          setClienteSeleccionado(null);
          setPedidoSeleccionado(null);
          setVentaSeleccionada(null);
          setOrigenVista(null);
          setCotizacionSeleccionada(null);
          setCotizacionParaVenta(null);
          setItemsCotizacionParaVenta([]);
        }
      };

      window.addEventListener("popstate", manejarPopState);

      return () => {
        window.removeEventListener("popstate", manejarPopState);
      };
    }, [esRutaActivacion]);

    useEffect(() => {
      if (!perfil) return;
      if (perfil.rol === "admin" || perfil.rol === "superadmin") return;

      const mapaVistaModulo = {
        inicio: "inicio",
        listado: "clientes",
        formulario: "clientes",
        detalle: "clientes",
        pedidos: "pedidos",
        detallePedido: "pedidos",
        produccion: "produccion",
        "ventas-crear": "ventas",
        "ventas-listado": "ventas",
        "venta-detalle": "ventas",
        "cotizaciones-crear": "ventas",
        "cotizacion-detalle": "ventas",
        movimientos: "informes",
        caja: "caja",
        configuracion: "configuracion",
      };

      const moduloActual = mapaVistaModulo[vista];

      if (!moduloActual) return;

      if (!puedeVerModulo(moduloActual)) {
        setVista("inicio");
        setClienteSeleccionado(null);
        setPedidoSeleccionado(null);
        setVentaSeleccionada(null);
        setOrigenVista(null);
      }
    }, [perfil, vista]);

  // 🔹 Navegación desde el sidebar
  const manejarSeleccionSidebar = (modulo, extra = {}) => {
    switch (modulo) {
      case "clientes":
        irAVista("listado");
        break;
      case "ventas":
        irAVista("ventas");
        break;
      case "movimientos":
        irAVista("movimientos");
        break;
      case "caja":
      irAVista("caja");
      break;  
      default:
        irAVista(modulo, extra);
        break;
    }
  };

const obtenerPedidoPorId = async (pedidoId) => {
  if (!pedidoId) return null;

  const pedidoRef = doc(db, "pedidos", pedidoId);
  const pedidoSnap = await getDoc(pedidoRef);

  if (!pedidoSnap.exists()) return null;

  return {
    firebaseId: pedidoSnap.id,
    ...pedidoSnap.data(),
  };
};

const abrirVentaDesdePedido = async (ventaId) => {
  try {
    const venta = await obtenerVentaPorId(ventaId);

irAVista("venta-detalle", {
  venta,
  pedido: pedidoSeleccionado,
  origen: "detallePedido",
});
  } catch (error) {
    console.error("Error abriendo venta desde pedido:", error);
    alert("No se pudo abrir la factura asociada.");
  }
};

    const abrirPedidoDesdeVenta = async (pedidoId) => {
      try {
        const pedidoRef = doc(db, "pedidos", pedidoId);
        const pedidoSnap = await getDoc(pedidoRef);

        if (!pedidoSnap.exists()) {
          throw new Error("El pedido no existe.");
        }

        const pedido = {
          firebaseId: pedidoSnap.id,
          ...pedidoSnap.data(),
        };

        irAVista("detallePedido", { pedido });
      } catch (error) {
        console.error("Error abriendo pedido desde venta:", error);
        alert("No se pudo abrir el pedido asociado.");
      }
    };

  // 🔹 Navegación desde la pantalla de inicio
  const manejarNavegacionDesdeInicio = (modulo) => {
  switch (modulo) {
    case "inicio":
      irAVista("inicio");
      break;

    case "listado":
      irAVista("listado");
      break;

    case "formulario":
      irAVista("formulario");
      break;

    case "pedidos":
      irAVista("pedidos");
      break;
      

    case "produccion":
      irAVista("produccion");
      break;

    case "detallePedido":
    case "nuevoPedido":
      irAVista("detallePedido", { pedido: null });
      break;

    case "ventas":
      irAVista("ventas");
      break;

    case "movimientos":
      irAVista("movimientos");
      break;

    default:
      break;
  }
};

    if (esRutaActivacion) {
      return <ActivarCuenta />;
    }

    if (authLoading) {
      return <div style={{ padding: 30 }}>Cargando...</div>;
    }

    if (!usuario) {
      return <Login />;
    }

    if (usuario && !perfil && authLoading) {
      return <div style={{ padding: 30 }}>Cargando perfil...</div>;
    }

if (!perfil && errorConexionPerfil) {
  return (
    <div style={{ padding: 30 }}>
      <h2>Reconectando...</h2>
      <p>No pudimos cargar tu perfil por un problema de conexión.</p>
      <p>Verificá internet y recargá la página.</p>
      <button onClick={() => window.location.reload()}>
        Reintentar
      </button>
      <button
        onClick={() => signOut(auth)}
        style={{ marginLeft: 10 }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

if (!perfil) {
  return (
    <div style={{ padding: 30 }}>
      <h2>Usuario sin perfil</h2>
      <p>No existe un perfil en Firestore para este usuario.</p>
      <button onClick={() => signOut(auth)}>Cerrar sesión</button>
    </div>
  );
}

    if (mensajeBloqueo) {
      console.log("SE ESTÁ MOSTRANDO BLOQUEO:", mensajeBloqueo);
      return (
        <div style={{ padding: 30 }}>
          <h2>Acceso bloqueado</h2>
          <p>{mensajeBloqueo}</p>
          <button onClick={() => signOut(auth)}>Cerrar sesión</button>
        </div>
      );
    }

    if (perfil.rol === "superadmin") {
      return <DuenoSaasPanel perfil={perfil} />;
    }
  
  return (
    <div
  className={`app-layout ${modoOscuro ? "dark-layout" : ""} ${
    sidebarExpandido ? "sidebar-expandido" : "sidebar-colapsado"
  }`}
>

      {/* 🧭 Sidebar lateral */}
      <Sidebar
        onSelect={manejarSeleccionSidebar}
        expandido={sidebarExpandido}
        perfil={perfil}
        onToggle={() => setSidebarExpandido(!sidebarExpandido)}
        puedeVerModulo={puedeVerModulo}
      />



      {/* 🧱 Contenido principal */}
      <main className={`main-content ${sidebarExpandido ? "sidebar-expandido" : "sidebar-colapsado"}`}>

        {vista === "inicio" && (
          <Inicio onNavigate={manejarNavegacionDesdeInicio} perfil={perfil} />
        )}

        {vista === "listado" && (
          <ClientesList
            perfil={perfil}
            onNuevo={() => {
              irAVista("formulario", { cliente: null });
            }}
            onEditar={(cliente) => {
              irAVista("formulario", { cliente });
            }}
            onVer={(cliente) => {
              irAVista("detalle", { cliente });
            }}
          />
        )}

        {vista === "formulario" && (
          <ClienteForm
            perfil={perfil}
            cliente={clienteSeleccionado}
            onCancelar={() => irAVista("listado")}
            onGuardar={() => irAVista("listado")}
          />
        )}

        {vista === "detalle" && (
          <ClienteDetalle
            perfil={perfil}
            cliente={clienteSeleccionado}
            onVolver={() => irAVista("listado")}
            onEditar={(cliente) => {
              irAVista("formulario", { cliente });
            }}
          />
        )}

        {vista === "pedidos" && (
          <PedidosList
            perfil={perfil}
            abrirNuevo={pedidoSeleccionado?.abrirNuevo === true}
            onVerDetalle={(pedido) => {
              irAVista("detallePedido", { pedido, origen: "pedidos" });
            }}
            onIrProduccion={(pedido) => {
              irAVista("produccion", { pedido });
            }}
          />
        )}

        {vista === "produccion" && (
          <ProduccionPage
            perfil={perfil}
            onVerPedido={(pedido) => {
              irAVista("detallePedido", { pedido, origen: "produccion" });
            }}
          />
        )}

        {vista === "detallePedido" && (
          <PedidoDetalle
            perfil={perfil}
            pedido={pedidoSeleccionado}
            origenVista={origenVista}
            onVerVenta={abrirVentaDesdePedido}
            onCrearVentaDesdePedido={(pedido, productos) => {
              irAVista("ventas-crear", {
                pedido,
                origen: "detallePedido",
                productosPedido: productos,
              });
            }}
            onVolver={() => {
              if (origenVista === "produccion") {
                irAVista("produccion");
                return;
              }

              if (origenVista === "pedidos") {
                irAVista("pedidos");
                return;
              }

              if (origenVista === "ventas") {
                irAVista("ventas-listado");
                return;
              }

              window.history.back();
            }}
          />
        )}

        {vista === "ventas-crear" && (
          <VentasPage
             perfil={perfil}
            pedidoInicial={pedidoSeleccionado}
            productosPedido={productosPedidoParaVenta}
            cotizacionInicial={cotizacionParaVenta}
            itemsCotizacion={itemsCotizacionParaVenta}
          />
        )}

       {vista === "cotizaciones-crear" && (
        <CotizacionesPage
          perfil={perfil}
          onVerCotizacion={(cotizacion) =>
            irAVista("cotizacion-detalle", { cotizacion })
          }
        />
      )}

      {vista === "cotizacion-detalle" && (
      <CotizacionDetalle
        perfil={perfil}
        cotizacionId={cotizacionSeleccionada?.firebaseId || cotizacionDetalleId}
          onVolver={() => irAVista("cotizaciones-crear")}
          onPrepararVenta={({ cotizacion, items }) =>
            irAVista("ventas-crear", {
              cotizacionParaVenta: cotizacion,
              itemsCotizacion: items,
            })
          }
        />
      )}

        {vista === "ventas-listado" && (
          <VentasList
            perfil={perfil}
            onVer={(venta) => irAVista("venta-detalle", { venta })}
            onEditar={(venta) => irAVista("venta-detalle", { venta })}
          />
        )}

{vista === "venta-detalle" && ventaSeleccionada && (
  <VentaDetalle
    perfil={perfil}
    ventaId={ventaSeleccionada.firebaseId}
    onVolver={() => {
      if (origenVista === "detallePedido") {
        irAVista("detallePedido", {
          pedido: pedidoSeleccionado,
          origen: "pedidos",
        });
        return;
      }

      irAVista("ventas-listado");
    }}
    onVerPedido={abrirPedidoDesdeVenta}
  />
)}


        {vista === "movimientos" && (
          <MovimientosList perfil={perfil} />
        )}

        {vista === "caja" && (
          <CajaPage
            perfil={perfil}
            onVerVenta={async (ventaId) => {
              try {
                const venta = await obtenerVentaPorId(ventaId);
                irAVista("venta-detalle", { venta });
              } catch (error) {
                console.error("Error abriendo venta desde caja:", error);
                alert("No se pudo abrir la venta asociada.");
              }
            }}
          />
        )}

        {vista === "configuracion" && (
          <Configuracion
            perfil={perfil}
            modoOscuro={modoOscuro}
            setModoOscuro={setModoOscuro}
            onActualizarPerfil={(cambios) =>
              setPerfil((prev) => ({
                ...prev,
                ...cambios,
              }))
            }
          />
        )}
      </main>

      {/* 🚀 Menú inferior móvil */}
      <MobileMenu
        vistaActual={vista}
        onSelect={manejarSeleccionSidebar}
        perfil={perfil}
        onCrear={(tipo) => {
        if (tipo === "pedido") {
          irAVista("pedidos", {
            pedido: { abrirNuevo: true },
          });

          } else if (tipo === "cliente") {
            irAVista("formulario", {
              cliente: null,
            });

          } else if (tipo === "venta") {
            irAVista("ventas-crear", {
              pedido: null,
              productosPedido: [],
            });
          }
        }}
      />
    </div>
  );
}
