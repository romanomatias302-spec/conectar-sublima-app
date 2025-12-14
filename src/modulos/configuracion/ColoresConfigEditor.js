import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function ColoresConfigEditor({
  coloresIniciales = [],
  onGuardar,
  onCerrar,
}) {
  const [colores, setColores] = useState([]);

  useEffect(() => {
    // Si no hay colores cargados, se cargan algunos por defecto
    setColores(
      coloresIniciales.length > 0
        ? coloresIniciales
        : ["Negro", "Blanco", "Rojo", "Azul", "Verde"]
    );
  }, [coloresIniciales]);

  // ➕ Agregar nuevo color
  const agregarColor = () => {
    const nuevo = prompt("Ingresá el nombre del color (ejemplo: Bordó, Celeste, Amarillo):");
    if (!nuevo) return;
    const colorNormalizado = nuevo.trim();
    if (colores.includes(colorNormalizado)) {
      alert("Ese color ya está en la lista.");
      return;
    }
    setColores([...colores, colorNormalizado]);
  };

  // ❌ Eliminar color
  const eliminarColor = (color) => {
    if (window.confirm(`¿Eliminar el color "${color}" de la lista?`)) {
      setColores(colores.filter((c) => c !== color));
    }
  };

  // 💾 Guardar cambios
  const guardarCambios = () => {
    onGuardar(colores);
    onCerrar();
  };

  return (
    <div className="colores-editor">
      <h2>Colores del producto</h2>
      <p className="descripcion">
        Agregá colores a la lista desplegable que verás en tu formulario de pedidos.  
        Cada color que agregues acá aparecerá como opción disponible cuando crees o edites un producto.
      </p>

      {/* 📋 Lista de colores */}
      <div className="colores-lista">
        {colores.map((c, i) => (
          <div key={i} className="color-item">
            <span>{c}</span>
            <button
              className="btn-mini-eliminar"
              onClick={() => eliminarColor(c)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn-mini-agregar" onClick={agregarColor}>
          + Agregar color
        </button>
      </div>

      {/* 💾 Acciones */}
      <div className="form-actions">
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
        <select className="selector-color" disabled>
          <option>Seleccionar color...</option>
          {colores.map((c, i) => (
            <option key={i}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
