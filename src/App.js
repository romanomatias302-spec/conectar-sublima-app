import React, { useState, useEffect } from "react";
import Sidebar from "./comunes/componentes/Sidebar";
import ClientesList from "./modulos/clientes/ClientesList";
import ClienteForm from "./modulos/clientes/ClienteForm";
import ClienteDetalle from "./modulos/clientes/ClienteDetalle";
import PedidosList from "./modulos/pedidos/PedidosList";
import PedidoDetalle from "./modulos/pedidos/PedidoDetalle";
import Inicio from "./modulos/inicio/Inicio";
import Configuracion from "./modulos/configuracion/Configuracion";
import MobileMenu from "./comunes/componentes/MobileMenu";
import "./App.css";




export default function App() {
  
  const [vista, setVista] = useState("inicio");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [colapsada, setColapsada] = useState(false);
  

  // ✅ Estado global de modo oscuro (persistente)
  const [modoOscuro, setModoOscuro] = useState(
    localStorage.getItem("modoOscuro") === "true"
  );

  // ✅ Aplicar y guardar preferencia en body y localStorage
  useEffect(() => {
    document.body.classList.toggle("dark-mode", modoOscuro);
    localStorage.setItem("modoOscuro", modoOscuro);
  }, [modoOscuro]);

  // 🔹 Navegación desde el sidebar
  const manejarSeleccionSidebar = (modulo) => {
    setVista(modulo === "clientes" ? "listado" : modulo);
  };

  // 🔹 Navegación desde la pantalla de inicio
  const manejarNavegacionDesdeInicio = (modulo) => {
    switch (modulo) {
      case "inicio":
        setVista("inicio");
        break;
      case "listado":
        setVista("listado");
        break;
      case "formulario":
        setVista("formulario");
        break;
      case "pedidos":
        setVista("pedidos");
        break;
      case "detallePedido":
      case "nuevoPedido":
        setPedidoSeleccionado(null);
        setVista("detallePedido");
        break;
      default:
        break;
    }
  };

  
  return (
    <div className={`app-layout ${modoOscuro ? "dark-layout" : ""}`}>
      {/* 🧭 Sidebar lateral */}
      <Sidebar
        onSelect={manejarSeleccionSidebar}
        colapsada={colapsada}
        onToggle={() => setColapsada(!colapsada)}
      />

      {/* 🧱 Contenido principal */}
      <main className={`main-content ${colapsada ? "collapsed" : ""}`}>
        {vista === "inicio" && (
          <Inicio onNavigate={manejarNavegacionDesdeInicio} />
        )}

        {vista === "listado" && (
          <ClientesList
            onNuevo={() => {
              setClienteSeleccionado(null);
              setVista("formulario");
            }}
            onEditar={(cliente) => {
              setClienteSeleccionado(cliente);
              setVista("formulario");
            }}
            onVer={(cliente) => {
              setClienteSeleccionado(cliente);
              setVista("detalle");
            }}
          />
        )}

        {vista === "formulario" && (
          <ClienteForm
            cliente={clienteSeleccionado}
            onCancelar={() => setVista("listado")}
            onGuardar={() => setVista("listado")}
          />
        )}

        {vista === "detalle" && (
          <ClienteDetalle
            cliente={clienteSeleccionado}
            onVolver={() => setVista("listado")}
            onEditar={(cliente) => {
              setClienteSeleccionado(cliente);
              setVista("formulario");
            }}
          />
        )}

        {vista === "pedidos" && (
          <PedidosList
            onVerDetalle={(pedido) => {
              setPedidoSeleccionado(pedido);
              setVista("detallePedido");
            }}
          />
        )}

        {vista === "detallePedido" && (
          <PedidoDetalle
            pedido={pedidoSeleccionado}
            onVolver={() => setVista("pedidos")}
          />
        )}

        {vista === "configuracion" && (
          <Configuracion modoOscuro={modoOscuro} setModoOscuro={setModoOscuro} />
        )}
      </main>

      {/* 🚀 Menú inferior móvil */}
      <MobileMenu
        vistaActual={vista}
        onSelect={manejarSeleccionSidebar}
        onCrear={(tipo) => {
          if (tipo === "pedido") {
            setPedidoSeleccionado(null);
            setVista("detallePedido");
          } else if (tipo === "cliente") {
            setClienteSeleccionado(null);
            setVista("formulario");
          }
        }}
      />
    </div>
  );
}
