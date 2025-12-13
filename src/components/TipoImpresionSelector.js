// 🧩 TipoImpresionSelector.js
import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function TipoImpresionSelector({ tipoInicial, onGuardar }) {
  const [tipo, setTipo] = useState(tipoInicial || "multiple");

  useEffect(() => {
    if (tipoInicial) setTipo(tipoInicial);
  }, [tipoInicial]);

  const guardarTipo = () => {
    onGuardar(tipo);
  };

  return (
    <div className="tipo-impresion-box">
      <h3>Tipo de áreas de impresión</h3>
      <p className="descripcion">
        Seleccioná el tipo de configuración según la cantidad de zonas de impresión del producto.
      </p>

      <select
        className="selector-tipo"
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
      >
        <option value="multiple">🧢 Múltiples áreas (recomendado para remeras, buzos, camperas)</option>
        <option value="simple">☕ Única área (recomendado para tazas, gorras, botellas)</option>
        <option value="personalizado">⚙️ Personalizado (creá tus propias zonas)</option>
      </select>

      <div className="form-actions">
        <button className="btn-guardar" onClick={guardarTipo}>
          Guardar
        </button>
      </div>
    </div>
  );
}
