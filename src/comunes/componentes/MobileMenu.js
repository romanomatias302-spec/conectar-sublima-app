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
import { puedeHacer } from "../../utils/permisos";

export default function MobileMenu({ vistaActual, onSelect, onCrear, perfil }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  const toggleMenu = () => setMenuAbierto(!menuAbierto);

  const handleCrear = (tipo) => {
    setMenuAbierto(false);
    onCrear(tipo);
  };

  const puedeVerInicio = puedeHacer(perfil, "inicio", "ver");
  const puedeVerClientes = puedeHacer(perfil, "clientes", "ver");
  const puedeVerPedidos = puedeHacer(perfil, "pedidos", "ver");
  const puedeVerConfiguracion = puedeHacer(perfil, "configuracion", "ver");

  const puedeCrearPedidos = puedeHacer(perfil, "pedidos", "crear");
  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");

  const mostrarBotonCentral = puedeCrearPedidos || puedeCrearClientes;

  return (
    <>
      <nav className="mobile-menu">
        {puedeVerInicio && (
          <button
            className={`menu-btn ${vistaActual === "inicio" ? "active" : ""}`}
            onClick={() => onSelect("inicio")}
          >
            <Home size={22} />
            <span>Inicio</span>
          </button>
        )}

        {puedeVerClientes && (
          <button
            className={`menu-btn ${vistaActual === "listado" ? "active" : ""}`}
            onClick={() => onSelect("listado")}
          >
            <Users size={22} />
            <span>Clientes</span>
          </button>
        )}

        {mostrarBotonCentral && (
          <button className="btn-central" onClick={toggleMenu}>
            <PlusCircle size={34} />
          </button>
        )}

        {puedeVerPedidos && (
          <button
            className={`menu-btn ${vistaActual === "pedidos" ? "active" : ""}`}
            onClick={() => onSelect("pedidos")}
          >
            <ClipboardList size={22} />
            <span>Pedidos</span>
          </button>
        )}

        {puedeVerConfiguracion && (
          <button
            className={`menu-btn ${vistaActual === "configuracion" ? "active" : ""}`}
            onClick={() => onSelect("configuracion")}
          >
            <Settings size={22} />
            <span>Config</span>
          </button>
        )}
      </nav>

      {menuAbierto && mostrarBotonCentral && (
        <div className="menu-flotante">
          {puedeCrearPedidos && (
            <button onClick={() => handleCrear("pedido")}>
              <FilePlus size={18} /> Crear pedido
            </button>
          )}

          {puedeCrearClientes && (
            <button onClick={() => handleCrear("cliente")}>
              <UserPlus size={18} /> Crear cliente
            </button>
          )}
        </div>
      )}
    </>
  );
}