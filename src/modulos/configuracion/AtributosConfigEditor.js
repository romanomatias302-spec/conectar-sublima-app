import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { doc, updateDoc } from "firebase/firestore";
import "./ConfiguracionProductos.css";

export default function AtributosConfigEditor({ productoId, atributosIniciales = [], onCerrar }) {
  const [atributos, setAtributos] = useState(atributosIniciales);

  useEffect(() => {
    setAtributos(atributosIniciales);
  }, [atributosIniciales]);

  const agregarAtributo = () => {
    const nuevo = prompt("Nombre del nuevo atributo (ej: Nombre del cliente, Observaciones):");
    if (nuevo && !atributos.includes(nuevo)) setAtributos([...atributos, nuevo]);
  };

  const eliminarAtributo = (a) => {
    setAtributos(atributos.filter((att) => att !== a));
  };

  const guardarCambios = async () => {
    try {
      await updateDoc(doc(db, "productosBase", productoId), { atributos });
      alert("Atributos actualizados correctamente ✅");
      onCerrar();
    } catch (error) {
      console.error("Error al guardar atributos:", error);
      alert("Hubo un problema al guardar los atributos.");
    }
  };

  return (
    <div className="zonas-editor">
      <h2>Atributos adicionales</h2>
      <p className="descripcion">
        Campos personalizados que pueden sumarse al producto, como observaciones,
        notas, nombres o cualquier otro campo adicional.
      </p>

      <ul className="lista-editable">
        {atributos.map((a, i) => (
          <li key={i}>
            {a}
            <button className="btn-mini-eliminar" onClick={() => eliminarAtributo(a)}>
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="zonas-actions">
        <button className="btn-agregar" onClick={agregarAtributo}>
          + Agregar atributo
        </button>
        <button className="btn-guardar" onClick={guardarCambios}>
          Guardar Cambios
        </button>
        <button className="cancelar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {/* 👁️ Vista previa visual */}
      <div className="preview-box">
        <h4>Vista previa (formulario del pedido)</h4>
        <div className="preview-atributos">
          {atributos.length === 0 ? (
            <p className="preview-placeholder">No hay atributos cargados aún</p>
          ) : (
            atributos.map((a, i) => (
              <div key={i} className="preview-atributo-item">
                <label>{a}</label>
                <input type="text" placeholder="..." disabled />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
