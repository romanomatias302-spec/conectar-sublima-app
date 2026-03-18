import React from "react";
import { FaUsers, FaClipboardList, FaCog, FaBars, FaHome, FaSignOutAlt } from "react-icons/fa";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import "./Sidebar.css";



export default function Sidebar({ onSelect, expandido, onToggle, perfil }) {

  const handleLogout = async () => {

    try{

    await signOut(auth);

    window.location.reload();

    }catch(error){

    console.error("Error logout:", error);

    }

    };

  return (
    <div className={`sidebar ${expandido ? "expandido" : "colapsado"}`}>
      <div className="sidebar-header">
        <button className="toggle-btn" onClick={onToggle}>
          <FaBars />
        </button>
        {expandido && <h2>PedidoSimple</h2>}
      </div>

      

      <ul className="menu">

        <li onClick={() => onSelect("inicio")}>
        <FaHome className="icon"/>
        {expandido && <span>Inicio</span>}
        </li>

        <li onClick={() => onSelect("listado")}>
        <FaUsers className="icon"/>
        {expandido && <span>Clientes</span>}
        </li>

        <li onClick={() => onSelect("pedidos")}>
        <FaClipboardList className="icon"/>
        {expandido && <span>Pedidos</span>}
        </li>

        <li onClick={() => onSelect("configuracion")}>
        <FaCog className="icon"/>
        {expandido && <span>Configuración</span>}
        </li>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {(perfil?.nombre || perfil?.email || "U").charAt(0).toUpperCase()}
          </div>

          {expandido && (
            <div className="sidebar-user-info">
              <strong>{perfil?.nombre || "Usuario"}</strong>
              <span>{perfil?.email || ""}</span>
              <small>
                {perfil?.rol === "superadmin" ? "Dueño SaaS" : "Admin"}
              </small>
            </div>
          )}
        </div>

        </ul>

        <ul className="menu bottom-menu">

          <li onClick={handleLogout} className="logout">

          <FaSignOutAlt className="icon"/>

          {expandido && <span>Cerrar sesión</span>}

          </li>

          </ul>
    </div>
  );
}
