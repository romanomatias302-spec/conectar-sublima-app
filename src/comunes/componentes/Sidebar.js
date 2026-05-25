import React, { useState } from "react";
import {
  FaUsers,
  FaClipboardList,
  FaCog,
  FaBars,
  FaHome,
  FaSignOutAlt,
  FaCashRegister,
  FaExchangeAlt,
} from "react-icons/fa";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import "./Sidebar.css";
import { puedeHacer } from "../../utils/permisos";

export default function Sidebar({
  onSelect,
  expandido,
  onToggle,
  perfil,
  puedeVerModulo,
}) {
  const [ventasOpen, setVentasOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error("Error logout:", error);
    }
  };

  const esAdminTotal =
    perfil?.rol === "admin" || perfil?.rol === "superadmin";

  const puede = (modulo) => {
    if (esAdminTotal) return true;
    if (!puedeVerModulo) return false;
    return puedeVerModulo(modulo);
  };

  const puedeCrearVentas =
  puedeHacer(perfil, "ventas", "crear");

const puedeVerListadoVentas =
  puedeHacer(perfil, "ventas", "listado");

  return (
    <div className={`sidebar ${expandido ? "expandido" : "colapsado"}`}>
      <div className="sidebar-header">
        <button className="toggle-btn" onClick={onToggle}>
          <FaBars />
        </button>
        {expandido && <h2>PedidoSimple</h2>}
      </div>

      <ul className="menu">
        {puede("inicio") && (
          <li onClick={() => onSelect("inicio")}>
            <FaHome className="icon" />
            {expandido && <span>Inicio</span>}
          </li>
        )}

        {puede("clientes") && (
          <li onClick={() => onSelect("listado")}>
            <FaUsers className="icon" />
            {expandido && <span>Clientes</span>}
          </li>
        )}

        {puede("pedidos") && (
          <li onClick={() => onSelect("pedidos")}>
            <FaClipboardList className="icon" />
            {expandido && <span>Pedidos</span>}
          </li>
        )}

        {puede("produccion") && (
          <li onClick={() => onSelect("produccion")}>
            <FaClipboardList className="icon" />
            {expandido && <span>Producción</span>}
          </li>
        )}

        {(puedeCrearVentas || puedeVerListadoVentas) && (
          <li className="menu-group">
            <div
              className="menu-item-with-arrow"
              onClick={() => setVentasOpen((prev) => !prev)}
            >
              <div className="menu-item-main">
                <FaCashRegister className="icon" />
                {expandido && <span>Ventas</span>}
              </div>

              {expandido && (
                <span className={`submenu-arrow ${ventasOpen ? "open" : ""}`}>
                  ▾
                </span>
              )}
            </div>

            {expandido && ventasOpen && (
              <div className="sidebar-submenu">
              {puedeCrearVentas && (
                <div
                  className="sidebar-subitem"
                  onClick={() =>
                    onSelect("ventas-crear", {
                      pedido: null,
                      productosPedido: [],
                    })
                  }
                >
                  Crear venta
                </div>
              )}

              {puedeVerListadoVentas && (
                <div
                  className="sidebar-subitem"
                  onClick={() => onSelect("ventas-listado")}
                >
                  Listado de ventas
                </div>
              )}
              </div>
            )}
          </li>
        )}

        {puede("caja") && (
          <li onClick={() => onSelect("caja")}>
            <FaCashRegister className="icon" />
            {expandido && <span>Caja</span>}
          </li>
        )}

        {puede("informes") && (
          <li onClick={() => onSelect("movimientos")}>
            <FaExchangeAlt className="icon" />
            {expandido && <span>Informes</span>}
          </li>
        )}

        {puede("configuracion") && (
          <li onClick={() => onSelect("configuracion")}>
            <FaCog className="icon" />
            {expandido && <span>Configuración</span>}
          </li>
        )}

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {(perfil?.nombre || perfil?.email || "U").charAt(0).toUpperCase()}
          </div>

          {expandido && (
            <div className="sidebar-user-info">
              <strong>{perfil?.nombre || "Usuario"}</strong>
              <span>{perfil?.email || ""}</span>
              <small>
                {perfil?.rol === "superadmin"
                  ? "Dueño SaaS"
                  : perfil?.rol === "admin"
                  ? "Admin"
                  : "Usuario"}
              </small>
            </div>
          )}
        </div>
      </ul>

      <ul className="menu bottom-menu">
        <li onClick={handleLogout} className="logout">
          <FaSignOutAlt className="icon" />
          {expandido && <span>Cerrar sesión</span>}
        </li>
      </ul>
    </div>
  );
}