import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function AtributosExtraConfigEditor({
  atributosIniciales = [],
  onGuardar,
  onCerrar,
}) {
  const [atributos, setAtributos] = useState([]);

  useEffect(() => {
    // Si no hay atributos cargados, se inicializa con un campo genérico
    setAtributos(
      atributosIniciales.length > 0
        ? atributosIniciales
        : [{ nombre: "Observaciones", valor: "" }]
    );
  }, [atributosIniciales]);

  // ➕ Agregar atributo
  const agregarAtributo = () => {
    const nuevo = prompt("Nombre del nuevo campo (ej. Material, Marca, etc.)");
    if (!nuevo) return;
    if (atributos.some((a) => a.nombre.toLowerCase() === nuevo.toLowerCase())) {
      alert("Ese campo ya existe.");
      return;
    }
    setAtributos([...atributos, { nombre: nuevo, valor: "" }]);
  };

  // ❌ Eliminar atributo
  const eliminarAtributo = (nombre) => {
    if (window.confirm(`¿Eliminar el campo "${nombre}"?`)) {
      setAtributos(atributos.filter((a) => a.nombre !== nombre));
    }
  };

  // 🔼 Mover hacia arriba
  const moverArriba = (index) => {
    if (index === 0) return;
    const nuevos = [...atributos];
    [nuevos[index - 1], nuevos[index]] = [nuevos[index], nuevos[index - 1]];
    setAtributos(nuevos);
  };

  // 🔽 Mover hacia abajo
  const moverAbajo = (index) => {
    if (index === atributos.length - 1) return;
    const nuevos = [...atributos];
    [nuevos[index + 1], nuevos[index]] = [nuevos[index], nuevos[index + 1]];
    setAtributos(nuevos);
  };

  // 💾 Guardar cambios
  const guardarCambios = () => {
    onGuardar(atributos);
    onCerrar();
  };

  return (
    <div className="atributos-editor">
      <h2>Atributos adicionales</h2>
      <p className="descripcion">
        Agregá campos personalizados para tus productos.  
        Por ejemplo: <strong>Material</strong>, <strong>Marca</strong>, <strong>Observaciones</strong>, etc.  
        Estos aparecerán en el formulario de pedidos y podés reordenarlos.
      </p>

      {/* 📋 Lista editable */}
      <div className="atributos-lista">
        {atributos.map((a, i) => (
          <div key={i} className="atributo-item">
            <span>{a.nombre}</span>
            <div className="acciones-atributo">
              <button title="Mover arriba" onClick={() => moverArriba(i)}>⬆</button>
              <button title="Mover abajo" onClick={() => moverAbajo(i)}>⬇</button>
              <button
                className="btn-mini-eliminar"
                onClick={() => eliminarAtributo(a.nombre)}
                title="Eliminar campo"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button className="btn-mini-agregar" onClick={agregarAtributo}>
          + Agregar campo
        </button>
      </div>

      {/* 💾 Botones */}
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
        <div className="preview-atributos">
          {atributos.map((a, i) => (
            <div key={i} className="preview-atributo-item">
              <label>{a.nombre}</label>
              <input type="text" placeholder="Escribí aquí..." disabled />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
