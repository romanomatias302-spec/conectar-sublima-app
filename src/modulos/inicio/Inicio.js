import React from "react";
import "./Inicio.css";
import { FaBox, FaUsers, FaClipboardList, FaChartBar, FaCog } from "react-icons/fa";

export default function Inicio({ onNavigate }) {
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
        <div onClick={() => onNavigate("configuracion")} className="modulo">
          <FaCog className="icon" />
          <span>Configuración</span>
        </div>
      </section>
    </div>
  );
}
