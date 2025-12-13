import React, { useState, useEffect, useRef } from "react";
import { FaEllipsisV, FaEye, FaEdit, FaTrash } from "react-icons/fa";
import "./ActionMenu.css";

export default function ActionMenu({ onVer, onEditar, onEliminar }) {
  const [abierto, setAbierto] = useState(false);
  const menuRef = useRef(null);

  // 🔹 Cerrar el menú si se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="action-menu-container" ref={menuRef}>
      <button
        className={`action-menu-trigger ${abierto ? "active" : ""}`}
        onClick={() => setAbierto(!abierto)}
        title="Acciones"
      >
        <FaEllipsisV />
      </button>

      {abierto && (
        <div className="action-menu-dropdown">
          {onVer && (
            <button onClick={onVer}>
              <FaEye className="icono" />
              <span>Ver</span>
            </button>
          )}
          {onEditar && (
            <button onClick={onEditar}>
              <FaEdit className="icono" />
              <span>Editar</span>
            </button>
          )}
          {onEliminar && (
            <button onClick={onEliminar}>
              <FaTrash className="icono" />
              <span>Eliminar</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
