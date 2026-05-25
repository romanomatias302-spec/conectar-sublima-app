import React, { useState } from "react";
import {
  Home,
  Users,
  ClipboardList,
  Settings,
  PlusCircle,
  FilePlus,
  UserPlus,
  Menu,
  Factory,
  CreditCard,
  BarChart3,
  Wallet,
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

const irA = (vista, extra = {}) => {
  setMenuAbierto(false);
  onSelect(vista, extra);
};

  const puedeVerInicio = puedeHacer(perfil, "inicio", "ver");
  const puedeVerClientes = puedeHacer(perfil, "clientes", "ver");
  const puedeVerPedidos = puedeHacer(perfil, "pedidos", "ver");
  const puedeVerConfiguracion = puedeHacer(perfil, "configuracion", "ver");
  const puedeVerProduccion = puedeHacer(perfil, "produccion", "ver");
const puedeVerVentas = puedeHacer(perfil, "ventas", "ver");
const puedeCrearVentas =
  puedeHacer(perfil, "ventas", "crear");

const puedeVerListadoVentas =
  puedeHacer(perfil, "ventas", "listado");
const puedeVerCaja = puedeHacer(perfil, "caja", "ver");
const puedeVerInformes = puedeHacer(perfil, "informes", "ver");

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
        <button className="menu-btn" onClick={toggleMenu}>
          <Menu size={22} />
          <span>Menú</span>
        </button>

      </nav>

{menuAbierto && (
  <div className="menu-flotante menu-flotante-modulos">
    {mostrarBotonCentral && (
      <>
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

        <div className="menu-flotante-separador" />
      </>
    )}

    {puedeVerInicio && (
      <button onClick={() => irA("inicio")}>
        <Home size={18} /> Inicio
      </button>
    )}

    {puedeVerClientes && (
      <button onClick={() => irA("listado")}>
        <Users size={18} /> Clientes
      </button>
    )}

    {puedeVerPedidos && (
      <button onClick={() => irA("pedidos")}>
        <ClipboardList size={18} /> Pedidos
      </button>
    )}

    {puedeVerProduccion && (
      <button onClick={() => irA("produccion")}>
        <Factory size={18} /> Producción
      </button>
    )}

    {(puedeCrearVentas || puedeVerListadoVentas) && (
      <>
      <>
        {puedeCrearVentas && (
          <button onClick={() =>
            irA("ventas-crear", {
              pedido: null,
              productosPedido: [],
            })
          }>
            <CreditCard size={18} />
            Crear venta
          </button>
        )}

        {puedeVerListadoVentas && (
          <button onClick={() => irA("ventas-listado")}>
            <CreditCard size={18} />
            Listado ventas
          </button>
        )}
      </>
      </>
    )}

    {puedeVerCaja && (
      <button onClick={() => irA("caja")}>
        <Wallet size={18} /> Caja
      </button>
    )}

    {puedeVerInformes && (
      <button onClick={() => irA("movimientos")}>
        <BarChart3 size={18} /> Informes
      </button>
    )}

    {puedeVerConfiguracion && (
      <button onClick={() => irA("configuracion")}>
        <Settings size={18} /> Configuración
      </button>
    )}
  </div>
)}
    </>
  );
}