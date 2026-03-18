import React, { useState } from "react";
import {
  Home,
  Users,
  ClipboardList,
  Settings,
  PlusCircle,
  FilePlus,
  UserPlus,
} from "lucide-react";
import "./MobileMenu.css";

export default function MobileMenu({ vistaActual, onSelect, onCrear }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  const toggleMenu = () => setMenuAbierto(!menuAbierto);

  const handleCrear = (tipo) => {
    setMenuAbierto(false);
    onCrear(tipo);
  };

  return (
    <>
      {/* 🔹 Menú inferior fijo */}
      <nav className="mobile-menu">
        <button
          className={`menu-btn ${vistaActual === "inicio" ? "active" : ""}`}
          onClick={() => onSelect("inicio")}
        >
          <Home size={22} />
          <span>Inicio</span>
        </button>

        <button
          className={`menu-btn ${vistaActual === "clientes" ? "active" : ""}`}
          onClick={() => onSelect("listado")}
        >
          <Users size={22} />
          <span>Clientes</span>
        </button>

        {/* 🔹 Botón central flotante */}
        <button className="btn-central" onClick={toggleMenu}>
          <PlusCircle size={34} />
        </button>

        <button
          className={`menu-btn ${vistaActual === "pedidos" ? "active" : ""}`}
          onClick={() => onSelect("pedidos")}
        >
          <ClipboardList size={22} />
          <span>Pedidos</span>
        </button>

        <button
          className={`menu-btn ${vistaActual === "configuracion" ? "active" : ""}`}
          onClick={() => onSelect("configuracion")}
        >
          <Settings size={22} />
          <span>Config</span>
        </button>
      </nav>

      {/* 🔹 Menú emergente (crear pedido / cliente) */}
      {menuAbierto && (
        <div className="menu-flotante">
          <button onClick={() => handleCrear("pedido")}>
            <UserPlus size={18} /> Crear pedido
          </button>
          <button onClick={() => handleCrear("cliente")}>
            <UserPlus size={18} /> Crear cliente
          </button>
        </div>
      )}
    </>
  );
}
