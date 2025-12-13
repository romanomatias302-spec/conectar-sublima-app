import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function TallesConfigEditor({
  tallesIniciales = [],
  onGuardar,
  onCerrar,
}) {
  const [talles, setTalles] = useState([]);

  useEffect(() => {
    setTalles(tallesIniciales.length > 0 ? tallesIniciales : [
      "XS", "S", "M", "L", "XL", "XXL",
      "S Mujer", "M Mujer", "L Mujer", "XL Mujer", "XXL Mujer",
      "T4", "T6", "T8", "T10", "T12", "T14", "T16"
    ]);
  }, [tallesIniciales]);

  // 🟢 Agregar un talle nuevo
  const agregarTalle = () => {
    const nuevo = prompt("Ingresá el nombre del nuevo talle (ej. 3XL, 5XL, etc.)");
    if (!nuevo) return;
    if (talles.includes(nuevo)) {
      alert("Ese talle ya existe.");
      return;
    }
    setTalles([...talles, nuevo]);
  };

  // 🟢 Eliminar talle
  const eliminarTalle = (talle) => {
    if (window.confirm(`¿Eliminar el talle "${talle}"?`)) {
      setTalles(talles.filter((t) => t !== talle));
    }
  };

  // 🟢 Guardar
  const guardarCambios = () => {
    onGuardar(talles);
    onCerrar();
  };

  return (
    <div className="talles-editor">
      <h2>Talles disponibles</h2>
      <p className="descripcion">
        Agregá, editá o eliminá talles según las prendas que manejes.  
        Estos talles se mostrarán automáticamente en el formulario de pedidos.
      </p>

      <div className="talles-lista">
        {talles.map((t, i) => (
          <div key={i} className="talle-item">
            <span>{t}</span>
            <button
              className="btn-mini-eliminar"
              onClick={() => eliminarTalle(t)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn-mini-agregar" onClick={agregarTalle}>
          + Agregar talle
        </button>
      </div>

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
        <h4>Vista previa (como se verá en el pedido)</h4>
        <div className="preview-subzonas">
          {talles.map((t, i) => (
            <div key={i} className="preview-subzona-item">
              <label>{t}</label>
              <input type="number" placeholder="Cantidad..." disabled />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
