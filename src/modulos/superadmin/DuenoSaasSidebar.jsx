import React from "react";

export default function DuenoSaasSidebar({ seccionActiva, setSeccionActiva }) {
  const items = [
    { id: "clientes", label: "Clientes" },
    { id: "estadisticas", label: "Estadísticas" },
    { id: "comercial", label: "Comercial" },
    { id: "auditoria", label: "Auditoría" },
  ];

  return (
    <aside className="dueno-saas-sidebar">
      <div className="dueno-saas-brand">
        <strong>ZALFRO</strong>
        <span>Panel Dueño SaaS</span>
      </div>

      <nav className="dueno-saas-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSeccionActiva(item.id)}
            className={
              seccionActiva === item.id
                ? "dueno-saas-nav-item activo"
                : "dueno-saas-nav-item"
            }
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
