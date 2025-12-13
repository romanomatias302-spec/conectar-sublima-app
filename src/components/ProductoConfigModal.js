// 📁 src/components/ProductoConfigModal.js
import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./ProductoConfigModal.css";

export default function ProductoConfigModal({ onClose, onProductoCreado }) {
  const [nombre, setNombre] = useState("");
  const [campos, setCampos] = useState({
    areasImpresion: false,
    talles: false,
    colores: false,
    enlaces: false,
    observaciones: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChangeCampo = (campo) => {
    setCampos((prev) => ({ ...prev, [campo]: !prev[campo] }));
  };

  const guardarProducto = async () => {
    if (!nombre.trim()) {
      setError("El nombre del producto es obligatorio.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await addDoc(collection(db, "productos_config"), {
        nombre,
        campos,
        fechaCreacion: serverTimestamp(),
      });

      if (onProductoCreado) onProductoCreado();
      onClose();
    } catch (err) {
      console.error("Error al guardar producto:", err);
      setError("Error al guardar el producto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content producto-config-modal">
        <h2>Nuevo Producto Personalizado</h2>

        {error && <div className="error">{error}</div>}

        <label>Nombre del producto</label>
        <input
          type="text"
          placeholder="Ej: Short de fútbol"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <h3>Campos disponibles</h3>
        <div className="checkbox-grid">
          {Object.entries(campos).map(([campo, valor]) => (
            <label key={campo} className="checkbox-item">
              <input
                type="checkbox"
                checked={valor}
                onChange={() => handleChangeCampo(campo)}
              />
              {campo
                .replace(/([A-Z])/g, " $1")
                .replace(/^\w/, (c) => c.toUpperCase())}
            </label>
          ))}
        </div>

        <div className="modal-buttons">
          <button className="cancelar" onClick={onClose}>
            Cancelar
          </button>
          <button onClick={guardarProducto} disabled={loading}>
            {loading ? "Guardando..." : "Guardar Producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
