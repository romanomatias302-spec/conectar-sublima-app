import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function ColoresConfigEditor({
  coloresIniciales = [],
  onGuardar,
  onCerrar,
}) {
  const [colores, setColores] = useState([]);

  useEffect(() => {
    // Soporta colores viejos como string y nuevos como objeto
    const coloresNormalizados =
      coloresIniciales.length > 0
        ? coloresIniciales.map((c) =>
            typeof c === "string"
              ? { nombre: c, codigo: "" }
              : {
                  nombre: c?.nombre || "",
                  codigo: c?.codigo || "",
                }
          )
        : [
            { nombre: "Negro", codigo: "#000000" },
            { nombre: "Blanco", codigo: "#FFFFFF" },
            { nombre: "Rojo", codigo: "#FF0000" },
            { nombre: "Azul", codigo: "#0000FF" },
            { nombre: "Verde", codigo: "#008000" },
          ];

    setColores(coloresNormalizados);
  }, [coloresIniciales]);

  // ➕ Agregar nuevo color
  const agregarColor = () => {
    const nuevo = prompt("Ingresá el nombre del color (ejemplo: Bordó, Celeste, Amarillo):");
    if (!nuevo) return;

    const colorNormalizado = nuevo.trim();
    if (!colorNormalizado) return;

    const yaExiste = colores.some(
      (c) => (c.nombre || "").toLowerCase() === colorNormalizado.toLowerCase()
    );

    if (yaExiste) {
      alert("Ese color ya está en la lista.");
      return;
    }

    setColores([...colores, { nombre: colorNormalizado, codigo: "" }]);
  };

  // ❌ Eliminar color
  const eliminarColor = (colorNombre) => {
    if (window.confirm(`¿Eliminar el color "${colorNombre}" de la lista?`)) {
      setColores(colores.filter((c) => c.nombre !== colorNombre));
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
            <span>{c.nombre}</span>
            <button
              className="btn-mini-eliminar"
              onClick={() => eliminarColor(c.nombre)}
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
            <option key={i}>{c.nombre}</option>
          ))}
        </select>
      </div>
    </div>
  );
}