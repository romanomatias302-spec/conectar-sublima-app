import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function DetallesPorTalleConfigEditor({
  detallesIniciales = [],
  talles = [],
  onGuardar,
  onCerrar,
}) {
  const [detalles, setDetalles] = useState([]);

  // ✅ Precargar los talles como lista editable
  useEffect(() => {
    if (detallesIniciales.length > 0) {
      setDetalles(detallesIniciales);
    } else {
      const iniciales = talles.map((t) => ({ nombre: t }));
      setDetalles(iniciales);
    }
  }, [detallesIniciales, talles]);

  // ➕ Agregar nuevo talle manual (por si el usuario quiere sumar)
  const agregarCampo = () => {
    const nuevo = prompt("Nombre del nuevo campo (ejemplo: T18, 3XL, etc.)");
    if (!nuevo) return;
    if (detalles.some((d) => d.nombre.toLowerCase() === nuevo.toLowerCase())) {
      alert("Ese campo ya existe.");
      return;
    }
    setDetalles([...detalles, { nombre: nuevo }]);
  };

  // ❌ Eliminar campo
  const eliminarCampo = (nombre) => {
    if (window.confirm(`¿Eliminar el campo "${nombre}"?`)) {
      setDetalles(detalles.filter((d) => d.nombre !== nombre));
    }
  };

  // 💾 Guardar
  const guardarCambios = () => {
    onGuardar(detalles);
    onCerrar();
  };

  return (
    <div className="talles-editor">
      <h2>Detalles por talle</h2>
      <p className="descripcion">
        Agregá los campos que se mostrarán en tu formulario para escribir observaciones por cada talle.  
        Ideal para camisetas de fútbol o productos personalizados.
      </p>

      {/* 📋 Lista editable */}
      <div className="talles-lista">
        {detalles.map((d, i) => (
          <div key={i} className="talle-item">
            <span>{d.nombre}</span>
            <button
              className="btn-mini-eliminar"
              onClick={() => eliminarCampo(d.nombre)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn-mini-agregar" onClick={agregarCampo}>
          + Agregar campo
        </button>
      </div>

      {/* 💾 Acciones */}
      <div className="zonas-actions">
        <button className="btn-guardar" onClick={guardarCambios}>
          Guardar Cambios
        </button>
        <button className="cancelar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {/* 👁️ Vista previa */}
      <div className="preview-box">
        <h4>Vista previa (como se verá en el formulario)</h4>
        {detalles.map((d, i) => (
          <div key={i} className="preview-subzona-item">
            <label>{d.nombre}</label>
            <input type="text" placeholder="Escribí aquí..." disabled />
          </div>
        ))}
      </div>
    </div>
  );
}
