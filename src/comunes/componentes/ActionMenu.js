import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { FaEllipsisV, FaEye, FaEdit, FaTrash } from "react-icons/fa";
import "./ActionMenu.css";

export default function ActionMenu({ onVer, onEditar, onEliminar }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const btnRef = useRef(null);
  const menuRef = useRef(null);

  // guardamos el rect del botón al momento de abrir
  const anchorRectRef = useRef(null);

  // ID único por instancia (para coordinar "solo uno abierto")
  const instanceIdRef = useRef(
    `am_${Math.random().toString(36).slice(2)}_${Date.now()}`
  );

  // 🔹 Cerrar al click afuera + cerrar en scroll/resize
  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickDentroMenu =
        menuRef.current && menuRef.current.contains(event.target);
      const clickEnBoton =
        btnRef.current && btnRef.current.contains(event.target);

      if (!clickDentroMenu && !clickEnBoton) setAbierto(false);
    };

    const handleScrollOrResize = () => {
      setAbierto(false);
    };

    document.addEventListener("click", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, []);

  // 🔹 Cuando otro ActionMenu abre, este se cierra
  useEffect(() => {
    const handleAnotherMenuOpened = (e) => {
      const openedId = e.detail?.id;
      if (openedId && openedId !== instanceIdRef.current) {
        setAbierto(false);
      }
    };

    window.addEventListener("actionmenu:open", handleAnotherMenuOpened);
    return () =>
      window.removeEventListener("actionmenu:open", handleAnotherMenuOpened);
  }, []);

  // ✅ Posicionamiento REAL (anti-corte)
  useLayoutEffect(() => {
    if (!abierto) return;
    if (!btnRef.current || !menuRef.current) return;

    const rect = anchorRectRef.current || btnRef.current.getBoundingClientRect();

    const gap = 8;
    const menuWidth = menuRef.current.offsetWidth || 180;
    const menuHeight = menuRef.current.offsetHeight || 120;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // ✅ Regla clara:
    // - si NO entra abajo y arriba tiene más espacio => abrir arriba
    const abrirArriba = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    let top = abrirArriba
      ? rect.top - menuHeight - gap
      : rect.bottom + gap;

    // ✅ Clamp vertical: nunca se sale del viewport
    top = Math.min(
      Math.max(top, gap),
      window.innerHeight - menuHeight - gap
    );

    // ✅ Clamp horizontal: nunca se sale del viewport
    let left = rect.right - menuWidth;
    left = Math.min(
      Math.max(left, gap),
      window.innerWidth - menuWidth - gap
    );

    setPos({ top, left });
  }, [abierto, onVer, onEditar, onEliminar]);

  const abrirCerrar = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!btnRef.current) return;

    if (!abierto) {
      anchorRectRef.current = btnRef.current.getBoundingClientRect();

      // avisar al resto que este menú se abrió (para que cierren)
      window.dispatchEvent(
        new CustomEvent("actionmenu:open", {
          detail: { id: instanceIdRef.current },
        })
      );
      setAbierto(true);
    } else {
      setAbierto(false);
    }
  };

  const ejecutar = (accion, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (accion) accion();
    setAbierto(false);
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
          onClick={(e) => e.stopPropagation()}
        >
          {onVer && (
            <button type="button" onClick={(e) => ejecutar(onVer, e)}>
              <FaEye className="icono" />
              <span>Ver</span>
            </button>
          )}

          {onEditar && (
            <button type="button" onClick={(e) => ejecutar(onEditar, e)}>
              <FaEdit className="icono" />
              <span>Editar</span>
            </button>
          )}

          {onEliminar && (
            <button type="button" onClick={(e) => ejecutar(onEliminar, e)}>
              <FaTrash className="icono" />
              <span>Eliminar</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
