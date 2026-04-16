import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function DetallesCosturaConfigEditor({
  detallesIniciales = [],
  onGuardar,
  onCerrar,
}) {
  const [detalles, setDetalles] = useState([]);

  useEffect(() => {
    setDetalles(
      detallesIniciales.length > 0
        ? detallesIniciales
        : [
            { nombre: "Tipo de cuello" },
            { nombre: "Tela" },
            { nombre: "Color de cuello" },
          ]
    );
  }, [detallesIniciales]);

  const agregarDetalle = () => {
    const nuevo = prompt("Nombre del nuevo detalle de costura");
    if (!nuevo) return;

    if (detalles.some((d) => d.nombre.toLowerCase() === nuevo.toLowerCase())) {
      alert("Ese campo ya existe.");
      return;
    }

    setDetalles([...detalles, { nombre: nuevo }]);
  };

  const eliminarDetalle = (nombre) => {
    if (window.confirm(`¿Eliminar el campo "${nombre}"?`)) {
      setDetalles(detalles.filter((d) => d.nombre !== nombre));
    }
  };

  const moverArriba = (index) => {
    if (index === 0) return;
    const nuevos = [...detalles];
    [nuevos[index - 1], nuevos[index]] = [nuevos[index], nuevos[index - 1]];
    setDetalles(nuevos);
  };

  const moverAbajo = (index) => {
    if (index === detalles.length - 1) return;
    const nuevos = [...detalles];
    [nuevos[index + 1], nuevos[index]] = [nuevos[index], nuevos[index + 1]];
    setDetalles(nuevos);
  };

  const guardarCambios = () => {
    onGuardar(detalles);
    onCerrar();
  };

  return (
    <div className="atributos-editor">
      <h2>Detalles de costura</h2>
      <p className="descripcion">
        Configurá campos técnicos del producto, por ejemplo:
        <strong> tipo de cuello</strong>, <strong>tela</strong>,
        <strong> color de cuello</strong>, <strong>puño</strong>, etc.
      </p>

      <div className="atributos-lista">
        {detalles.map((d, i) => (
          <div key={i} className="atributo-item">
            <span>{d.nombre}</span>
            <div className="acciones-atributo">
              <button title="Mover arriba" onClick={() => moverArriba(i)}>⬆</button>
              <button title="Mover abajo" onClick={() => moverAbajo(i)}>⬇</button>
              <button
                className="btn-mini-eliminar"
                onClick={() => eliminarDetalle(d.nombre)}
                title="Eliminar campo"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        <button className="btn-mini-agregar" onClick={agregarDetalle}>
          + Agregar detalle
        </button>
      </div>

      <div className="form-actions">
        <button className="btn-guardar" onClick={guardarCambios}>
          Guardar Cambios
        </button>
        <button className="cancelar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div className="preview-box">
        <h4>Vista previa (como se verá en el formulario)</h4>
        <div className="preview-atributos">
          {detalles.map((d, i) => (
            <div key={i} className="preview-atributo-item">
              <label>{d.nombre}</label>
              <input type="text" placeholder="Escribí aquí..." disabled />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}