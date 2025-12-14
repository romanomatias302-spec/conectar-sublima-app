import React, { useState, useEffect, useRef } from "react";
import { FaEllipsisV, FaEye, FaEdit, FaTrash } from "react-icons/fa";
import "./ActionMenu.css";

export default function ActionMenu({ onVer, onEditar, onEliminar }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickDentroMenu = menuRef.current && menuRef.current.contains(event.target);
      const clickEnBoton = btnRef.current && btnRef.current.contains(event.target);
      if (!clickDentroMenu && !clickEnBoton) setAbierto(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const abrirCerrar = () => {
    if (!abierto && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: rect.right - 160, // 160 = ancho aproximado del menú
      });
    }
    setAbierto(!abierto);
  };

  const ejecutar = (accion) => {
    setAbierto(false);
    if (accion) accion();
  };

  return (
    <div className="action-menu-root" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className={`action-menu-trigger ${abierto ? "active" : ""}`}
        onClick={abrirCerrar}
        title="Acciones"
      >
        <FaEllipsisV />
      </button>

      {abierto && (
        <div
          ref={menuRef}
          className="action-menu-dropdown fixed"
          style={{ top: pos.top, left: pos.left }}
        >
          {onVer && (
            <button type="button" onClick={() => ejecutar(onVer)}>
              <FaEye className="icono" />
              <span>Ver</span>
            </button>
          )}
          {onEditar && (
            <button type="button" onClick={() => ejecutar(onEditar)}>
              <FaEdit className="icono" />
              <span>Editar</span>
            </button>
          )}
          {onEliminar && (
            <button type="button" className="danger" onClick={() => ejecutar(onEliminar)}>
              <FaTrash className="icono" />
              <span>Eliminar</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
