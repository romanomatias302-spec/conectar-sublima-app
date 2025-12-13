import React, { useState } from "react";
import "./Inicio.css";
import {
  FaBox,
  FaUsers,
  FaClipboardList,
  FaChartBar,
  FaPlus,
  FaCog,
  FaHome,
  FaFileInvoice,
} from "react-icons/fa";

export default function Inicio({ onNavigate }) {
  const [menuFlotante, setMenuFlotante] = useState(false);

  const toggleMenu = () => setMenuFlotante(!menuFlotante);

  const crearElemento = (tipo) => {
    setMenuFlotante(false);
    if (tipo === "pedido") onNavigate("nuevoPedido");
    if (tipo === "cliente") onNavigate("formulario");
  };

  return (
    <div className="inicio-container">
      {/* 🧭 CABECERA */}
      <header className="inicio-header">
        <h1>Conectar Sublima</h1>
        <input className="search-bar" placeholder="Buscar o escribir..." />
      </header>

      {/* 📊 RESUMEN */}
      <section className="resumen-cards">
        <div className="card">
          <p>Pedidos Hoy</p>
          <h2>8</h2>
        </div>
        <div className="card">
          <p>Clientes Nuevos</p>
          <h2>3</h2>
        </div>
        <div className="card">
          <p>Pedidos Pendientes</p>
          <h2>5</h2>
        </div>
      </section>

      {/* ⚡ ACCESOS RÁPIDOS */}
      <section className="accesos-rapidos">
        <div onClick={() => onNavigate("pedidos")} className="modulo">
          <FaClipboardList className="icon" />
          <span>Pedidos</span>
        </div>
        <div onClick={() => onNavigate("listado")} className="modulo">
          <FaUsers className="icon" />
          <span>Clientes</span>
        </div>
        <div className="modulo">
          <FaBox className="icon" />
          <span>Productos</span>
        </div>
        <div className="modulo">
          <FaChartBar className="icon" />
          <span>Estadísticas</span>
        </div>
        <div className="modulo">
          <FaCog className="icon" />
          <span>Configuración</span>
        </div>
      </section>

      {/* ➕ MENÚ FLOTANTE */}
      {menuFlotante && (
        <div className="menu-flotante">
          <button onClick={() => crearElemento("pedido")}>
            <FaFileInvoice /> Crear Pedido
          </button>
          <button onClick={() => crearElemento("cliente")}>
            <FaUsers /> Crear Cliente
          </button>
        </div>
      )}

      {/* 🧭 BARRA INFERIOR (MÓVIL) */}
      <nav className="bottom-nav">
        <FaHome
          className="nav-icon"
          onClick={() => onNavigate("inicio")}
          title="Inicio"
        />
        <FaClipboardList
          className="nav-icon"
          onClick={() => onNavigate("pedidos")}
          title="Pedidos"
        />
        <div className="nav-plus" onClick={toggleMenu} title="Crear">
          <FaPlus />
        </div>
        <FaUsers
          className="nav-icon"
          onClick={() => onNavigate("listado")}
          title="Clientes"
        />
        <FaCog
          className="nav-icon"
          onClick={() => onNavigate("configuracion")}
          title="Configuración"
        />
      </nav>
    </div>
  );
}
