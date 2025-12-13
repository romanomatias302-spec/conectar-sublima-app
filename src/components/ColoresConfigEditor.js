import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function ColoresConfigEditor({
  coloresIniciales = [],
  onGuardar,
  onCerrar,
}) {
  const [colores, setColores] = useState([]);

  useEffect(() => {
    // Normalizar: si vienen strings, los convertimos a objetos con código vacío
    const normalizados = coloresIniciales.map((c) =>
      typeof c === "string" ? { nombre: c, codigo: "" } : c
    );
    setColores(normalizados);
  }, [coloresIniciales]);

  // ➕ Agregar nuevo color
  const agregarColor = () => {
    const nombre = prompt("Ingresá el nombre del color (ej. Bordó, Celeste, Amarillo):");
    if (!nombre) return;

    if (colores.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert("Ese color ya está en la lista.");
      return;
    }

    setColores([...colores, { nombre, codigo: "" }]);
  };

  // ❌ Eliminar color
  const eliminarColor = (nombre) => {
    if (window.confirm(`¿Eliminar el color "${nombre}"?`)) {
      setColores(colores.filter((c) => c.nombre !== nombre));
    }
  };

  // 🎨 Editar código de color
  const cambiarCodigo = (index, valor) => {
    const nuevos = [...colores];
    nuevos[index].codigo = valor;
    setColores(nuevos);
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
        Cada color que agregues acá aparecerá como opción disponible para tus productos.
      </p>

      {/* 📋 Lista de colores */}
      <div className="colores-lista">
        {colores.map((c, i) => (
          <div key={i} className="color-item">
            <div className="color-info">
              <span>{c.nombre}</span>
              {c.codigo && (
                <div
                  className="color-preview"
                  style={{ backgroundColor: c.codigo }}
                  title={c.codigo}
                />
              )}
            </div>

            <div className="color-actions">
              <input
                type="color"
                value={c.codigo || "#ffffff"}
                onChange={(e) => cambiarCodigo(i, e.target.value)}
                title="Seleccionar color"
              />
              <button
                className="btn-mini-eliminar"
                onClick={() => eliminarColor(c.nombre)}
              >
                ✕
              </button>
            </div>
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
            <option key={i}>{c.nombre}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
