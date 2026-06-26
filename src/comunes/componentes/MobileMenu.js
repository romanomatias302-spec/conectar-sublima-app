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
  LogOut,
  X,
  Tags,
} from "lucide-react";
import "./MobileMenu.css";
import { puedeHacer } from "../../utils/permisos";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";

export default function MobileMenu({ vistaActual, onSelect, onCrear, perfil }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [crearAbierto, setCrearAbierto] = useState(false);

  const toggleMenu = () => {
  setMenuAbierto((prev) => !prev);
  setCrearAbierto(false);
};

const toggleCrear = () => {
  setCrearAbierto((prev) => !prev);
  setMenuAbierto(false);
};

  const cerrarSesion = async () => {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (e) {
    console.error(e);
  }
};

const handleCrear = (tipo) => {
  setMenuAbierto(false);
  setCrearAbierto(false);
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
  const puedeCrearCotizaciones =
  puedeHacer(perfil, "ventas", "crearCotizacion");
const puedeVerCotizaciones =
  puedeHacer(perfil, "ventas", "cotizaciones");  
const puedeVerCaja = puedeHacer(perfil, "caja", "ver");
const puedeVerInformes = puedeHacer(perfil, "informes", "ver");
const puedeVerGastos = puedeHacer(perfil, "gastos", "ver");


  const puedeCrearPedidos = puedeHacer(perfil, "pedidos", "crear");
  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");

  const puedeVerProveedores = puedeHacer(perfil, "proveedores", "ver");
  const puedeVerListasPrecios = puedeHacer(perfil, "listasPrecios", "ver");

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
          <button className="btn-central" onClick={toggleCrear}>
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


<>
      <button
        className={`menu-btn mobile-only-btn ${menuAbierto ? "active" : ""}`}
        onClick={toggleMenu}
      >
        <Menu size={22} />
        <span>Menú</span>
      </button>

      {puedeVerVentas && (
        <button
          className={`menu-btn desktop-only-btn ${
            vistaActual === "ventas-crear" || vistaActual === "ventas-listado"
              ? "active"
              : ""
          }`}
          onClick={() => irA("ventas-listado")}
        >
          <CreditCard size={22} />
          <span>Ventas</span>
        </button>
      )}
    </>

      </nav>

{crearAbierto && (
  <>
    <div
      className="mobile-overlay mobile-overlay-crear"
      onClick={() => setCrearAbierto(false)}
    />

    <div
      className="menu-flotante menu-flotante-crear"
      onClick={(e) => e.stopPropagation()}
    >
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

{puedeCrearVentas && (
  <button
    onClick={() => {
      setCrearAbierto(false);
      irA("ventas-crear", {
        pedido: null,
        productosPedido: [],
      });
    }}
  >
    <CreditCard size={18} /> Crear venta
  </button>
)}
    </div>
  </>
)}

{menuAbierto && (
  <>
    <div
      className="mobile-overlay"
      onClick={() => setMenuAbierto(false)}
    />

    <div className="mobile-drawer">
      <div className="mobile-drawer-content">
        <div className="mobile-drawer-header">
          <strong>Menú</strong>

          <button
            type="button"
            onClick={() => setMenuAbierto(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="menu-flotante-modulos">


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

          {(puedeCrearVentas || puedeVerListadoVentas || puedeVerCotizaciones) && (
            <>
              {puedeCrearVentas && (
                <button
                  onClick={() =>
                    irA("ventas-crear", {
                      pedido: null,
                      productosPedido: [],
                    })
                  }
                >
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
              {puedeVerCotizaciones && (
                <button onClick={() => irA("cotizaciones-crear")}>
                  <CreditCard size={18} />
                  Cotizaciones
                </button>
              )}
            </>
          )}


          {puedeVerCaja && (
            <button onClick={() => irA("caja")}>
              <Wallet size={18} /> Caja
            </button>
          )}

          {puedeVerGastos && (
            <button onClick={() => irA("gastos")}>
              <Wallet size={18} /> Gastos
            </button>
          )}

          {puedeVerProveedores && (
            <button onClick={() => irA("proveedores")}>
              <Wallet size={18} /> Proveedores
            </button>
          )}

          {puedeVerListasPrecios && (
            <button onClick={() => irA("listasPrecios")}>
              <Tags size={18} /> Lista de precios
            </button>
          )}

          {puedeVerInformes && (
            <button onClick={() => irA("movimientos")}>
              <BarChart3 size={18} /> Informes
            </button>
          )}

          {puedeVerConfiguracion && (
            <button onClick={() => irA("configuracion")}>
              <Settings size={18} />
              Configuración
            </button>
          )}

         
        </div>

        <button
          className="mobile-logout"
          onClick={cerrarSesion}
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </div>
  </>
)}
    </>
  );
}