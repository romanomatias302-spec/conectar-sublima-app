import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./modulos/auth/Login";
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




export default function App() {
  
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mensajeBloqueo, setMensajeBloqueo] = useState("");

  const [vista, setVista] = useState("inicio");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [sidebarExpandido, setSidebarExpandido] = useState(true);


  const irAVista = (nuevaVista, extra = {}) => {
    const nuevoCliente = extra.cliente ?? null;
    const nuevoPedido = extra.pedido ?? null;

    setVista(nuevaVista);
    setClienteSeleccionado(nuevoCliente);
    setPedidoSeleccionado(nuevoPedido);

    window.history.pushState(
      {
        vista: nuevaVista,
        cliente: nuevoCliente,
        pedido: nuevoPedido,
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
      const unsub = onAuthStateChanged(auth, async (user) => {
        try {
          if (!user) {
            setUsuario(null);
            setPerfil(null);
            setMensajeBloqueo("");
            setAuthLoading(false);
            return;
          }

          setUsuario(user);

          const ref = doc(db, "usuarios", user.uid);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            setPerfil(null);
            setMensajeBloqueo("");
            setAuthLoading(false);
            return;
          }

          const dataPerfil = snap.data();
          console.log("PERFIL LOGIN:", dataPerfil);
          setPerfil(dataPerfil);

          setMensajeBloqueo("");

          // 🔒 bloqueo por usuario inactivo
          if (dataPerfil.activo !== true) {
            setMensajeBloqueo("Tu usuario está suspendido. Contactá al administrador.");
            setAuthLoading(false);
            return;
          }

          

          // 🔒 bloqueo por cliente SaaS suspendido
          if (dataPerfil.rol === "admin" && dataPerfil.clienteId) {
            console.log("clienteId del perfil:", dataPerfil.clienteId);

            const clienteSaasRef = doc(db, "clientes-saas", dataPerfil.clienteId);
            const clienteSaasSnap = await getDoc(clienteSaasRef);

            console.log("¿Existe clientes-saas?", clienteSaasSnap.exists());

            if (!clienteSaasSnap.exists()) {
              console.log("NO EXISTE clientes-saas para:", dataPerfil.clienteId);
              setMensajeBloqueo("No se encontró la empresa asociada a tu cuenta.");
              setAuthLoading(false);
              return;
            }

            const clienteSaasData = clienteSaasSnap.data();

            const estadoRaw = clienteSaasData?.estado;
            const estadoCliente =
              typeof estadoRaw === "string"
                ? estadoRaw.trim().toLowerCase()
                : "";

            console.log("ESTADO RAW:", JSON.stringify(estadoRaw), typeof estadoRaw);
            console.log("ESTADO NORMALIZADO:", JSON.stringify(estadoCliente));

            // solo bloquear si el estado dice explícitamente suspendido/bloqueado/inactivo
            if (["suspendido", "bloqueado", "inactivo"].includes(estadoCliente)) {
              console.log("BLOQUEADO POR ESTADO");
              setMensajeBloqueo("Tu cuenta se encuentra suspendida. Contactá al administrador.");
              setAuthLoading(false);
              return;
            }

            console.log("CLIENTE HABILITADO PARA ENTRAR");

            
          }

          setMensajeBloqueo("");
        } catch (error) {
          console.error("Error al cargar perfil:", error);
          setPerfil(null);
          setMensajeBloqueo("");
        } finally {
          setAuthLoading(false);
        }
      });

      return () => unsub();
    }, []);

    useEffect(() => {
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
        } else {
          setVista("inicio");
          setClienteSeleccionado(null);
          setPedidoSeleccionado(null);
        }
      };

      window.addEventListener("popstate", manejarPopState);

      return () => {
        window.removeEventListener("popstate", manejarPopState);
      };
    }, []);

  // 🔹 Navegación desde el sidebar
  const manejarSeleccionSidebar = (modulo) => {
    irAVista(modulo === "clientes" ? "listado" : modulo);
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

      case "detallePedido":
      case "nuevoPedido":
        irAVista("detallePedido", { pedido: null });
        break;

      default:
        break;
    }
  };

    if (authLoading) {
      return <div style={{ padding: 30 }}>Cargando...</div>;
    }

    if (!usuario) {
      return <Login />;
    }

    if (usuario && !perfil && authLoading) {
      return <div style={{ padding: 30 }}>Cargando perfil...</div>;
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
            onVerDetalle={(pedido) => {
              irAVista("detallePedido", { pedido });
            }}
          />
        )}

        {vista === "detallePedido" && (
          <PedidoDetalle
            perfil={perfil}
            pedido={pedidoSeleccionado}
            onVolver={() => irAVista("pedidos")}
          />
        )}

        {vista === "configuracion" && (
          <Configuracion
            perfil={perfil}
            modoOscuro={modoOscuro}
            setModoOscuro={setModoOscuro}
          />
        )}
      </main>

      {/* 🚀 Menú inferior móvil */}
      <MobileMenu
        vistaActual={vista}
        onSelect={manejarSeleccionSidebar}
        onCrear={(tipo) => {
          if (tipo === "pedido") {
            irAVista("pedidos", { pedido: null });
          } else if (tipo === "cliente") {
            irAVista("formulario", { cliente: null });
          }
        }}
      />
    </div>
  );
}
