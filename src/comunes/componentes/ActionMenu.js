import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  FaEllipsisV,
  FaEye,
  FaEdit,
  FaTrash,
  FaCopy,
  FaToggleOn,
} from "react-icons/fa";
import "./ActionMenu.css";

export default function ActionMenu({
  items = null,

  // Compatibilidad con usos actuales
  onVer,
  onEditar,
  onRenombrar,
  onDuplicar,
  onEliminar,
  onCambiarEstado,
  labelCambiarEstado = "Cambiar estado",

  title = "Acciones",
  triggerClassName = "",
}) {
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
  }, [
    abierto,
    items,
    onVer,
    onEditar,
    onRenombrar,
    onDuplicar,
    onEliminar,
    onCambiarEstado,
  ]);

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

    const itemsCompatibles = [
    onVer
      ? {
          id: "ver",
          label: "Ver",
          icon: <FaEye className="icono" />,
          onClick: onVer,
        }
      : null,

    onEditar
      ? {
          id: "editar",
          label: "Editar",
          icon: <FaEdit className="icono" />,
          onClick: onEditar,
        }
      : null,

    onRenombrar
      ? {
          id: "renombrar",
          label: "Renombrar",
          icon: <FaEdit className="icono" />,
          onClick: onRenombrar,
        }
      : null,

    onDuplicar
      ? {
          id: "duplicar",
          label: "Duplicar",
          icon: <FaCopy className="icono" />,
          onClick: onDuplicar,
        }
      : null,

    onCambiarEstado
      ? {
          id: "cambiar-estado",
          label: labelCambiarEstado,
          icon: <FaToggleOn className="icono" />,
          onClick: onCambiarEstado,
        }
      : null,

    onEliminar
      ? {
          id: "eliminar",
          label: "Eliminar",
          icon: <FaTrash className="icono" />,
          onClick: onEliminar,
          danger: true,
        }
      : null,
  ].filter(Boolean);

  const itemsFinales = Array.isArray(items)
    ? items.filter((item) => item && item.visible !== false)
    : itemsCompatibles;

   return (
    <div
      className="action-menu-root"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        className={`action-menu-trigger ${
          abierto ? "active" : ""
        } ${triggerClassName}`}
        onClick={abrirCerrar}
        title={title}
        aria-label={title}
        aria-expanded={abierto}
        aria-haspopup="menu"
      >
        <FaEllipsisV />
      </button>

      {abierto && itemsFinales.length > 0 && (
        <div
          ref={menuRef}
          className="action-menu-dropdown fixed"
          style={{
            top: pos.top,
            left: pos.left,
          }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {itemsFinales.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.danger ? "danger" : ""}
              disabled={item.disabled === true}
              onClick={(e) => ejecutar(item.onClick, e)}
              role="menuitem"
            >
              {item.icon && (
                <span className="action-menu-item-icon">
                  {item.icon}
                </span>
              )}

              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}