import React from "react";
import { FaUsers, FaClipboardList, FaCog, FaBars } from "react-icons/fa";
import "./Sidebar.css";

export default function Sidebar({ onSelect, expandido, onToggle }) {
  return (
    <div className={`sidebar ${expandido ? "expandido" : "colapsado"}`}>
      <div className="sidebar-header">
        <button className="toggle-btn" onClick={onToggle}>
          <FaBars />
        </button>
        {expandido && <h2>Conectar Sublima</h2>}
      </div>

      <ul className="menu">
        <li onClick={() => onSelect("clientes")}>
          <FaUsers className="icon" />
          {expandido && <span>Clientes</span>}
        </li>

        <li onClick={() => onSelect("pedidos")}>
          <FaClipboardList className="icon" />
          {expandido && <span>Pedidos</span>}
        </li>

        <li onClick={() => onSelect("configuracion")}>
          <FaCog className="icon" />
          {expandido && <span>Configuración</span>}
        </li>
      </ul>
    </div>
  );
}
