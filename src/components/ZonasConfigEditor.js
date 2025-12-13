import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function ZonasConfigEditor({
  zonasIniciales = [],
  productoNombre = "",
  onGuardar,
  onCerrar,
}) {
  const [zonas, setZonas] = useState([]);
  const [tipoArea, setTipoArea] = useState("multiple"); // multiple | unica | personalizada

  // 🟢 Inicialización inmediata (si no hay zonas cargadas)
  useEffect(() => {
    if (zonasIniciales && zonasIniciales.length > 0) {
      setZonas(zonasIniciales);
    } else {
      // Detecta tipo de producto y precarga automáticamente
      const nombre = productoNombre.toLowerCase();
      if (nombre.includes("remera") || nombre.includes("camiseta")) {
        setTipoArea("multiple");
        setZonas([
          { grupo: "Frente", subzonas: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"] },
          { grupo: "Espalda", subzonas: ["E1", "E2", "E3", "E4"] },
          { grupo: "Mangas", subzonas: ["M1", "M2"] },
        ]);
      } else if (nombre.includes("taza") || nombre.includes("gorra")) {
        setTipoArea("unica");
        setZonas([{ grupo: "Área única", subzonas: ["A1"] }]);
      } else {
        setTipoArea("personalizada");
        setZonas([]);
      }
    }
  }, [zonasIniciales, productoNombre]);

  // 🟢 Cambiar tipo de área → recarga zonas por defecto
  useEffect(() => {
    if (tipoArea === "multiple") {
      setZonas([
        { grupo: "Frente", subzonas: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"] },
        { grupo: "Espalda", subzonas: ["E1", "E2", "E3", "E4"] },
        { grupo: "Mangas", subzonas: ["M1", "M2"] },
      ]);
    } else if (tipoArea === "unica") {
      setZonas([{ grupo: "Área única", subzonas: ["A1"] }]);
    } else if (tipoArea === "personalizada") {
      setZonas([]);
    }
  }, [tipoArea]);

  // ➕ Agregar zona (solo personalizada)
  const agregarZona = () => {
    const nombre = prompt("Nombre de la nueva zona (ej. Frente, Espalda...)");
    if (!nombre) return;
    setZonas([...zonas, { grupo: nombre, subzonas: [] }]);
  };

  const eliminarZona = (grupo) => {
    if (window.confirm(`¿Eliminar la zona "${grupo}"?`)) {
      setZonas(zonas.filter((z) => z.grupo !== grupo));
    }
  };

  const agregarSubzona = (grupo) => {
    const nombre = prompt("Código de subzona (ej. F1, E1, M1...)");
    if (!nombre) return;
    setZonas(
      zonas.map((z) =>
        z.grupo === grupo
          ? { ...z, subzonas: [...(z.subzonas || []), nombre] }
          : z
      )
    );
  };

  const eliminarSubzona = (grupo, subzona) => {
    setZonas(
      zonas.map((z) =>
        z.grupo === grupo
          ? { ...z, subzonas: z.subzonas.filter((s) => s !== subzona) }
          : z
      )
    );
  };

  const guardarCambios = () => {
    onGuardar(zonas);
    onCerrar();
  };

  return (
    <div className="zonas-editor">
      <h2>Zonas de impresión</h2>
      <p className="descripcion">
        Configurá las áreas donde se imprimen tus productos.  
        Podés elegir entre múltiples zonas, un área única o crear tus propias zonas.
      </p>

      {/* 🔽 Selector de tipo de área */}
      <div className="tipo-area">
        <label><strong>Tipo de área de impresión:</strong></label>
        <select value={tipoArea} onChange={(e) => setTipoArea(e.target.value)}>
          <option value="multiple">Múltiples áreas (recomendado para remeras)</option>
          <option value="unica">Área única (recomendado para tazas o gorras)</option>
          <option value="personalizada">Personalizada (crear manualmente)</option>
        </select>
      </div>

      {/* 🖼️ Imagen / referencia */}
      {tipoArea === "multiple" && (
        <div className="referencia-img">
          <img
            src="/imagenes/remera_vectorial.png"
            alt="Referencia de zonas"
            className="remera-zonas"
          />
          <p className="img-subtexto">
            Ejemplo de esquema de impresión para productos con múltiples áreas (Frente, Espalda, Mangas).
          </p>
        </div>
      )}

      {tipoArea === "unica" && (
        <div className="referencia-img unica">
          <div className="area-unica-demo">A1</div>
          <p className="img-subtexto">
            Este producto tiene una única zona de impresión (A1).  
            Ideal para tazas, gorras o productos con un solo frente imprimible.
          </p>
        </div>
      )}

      {tipoArea === "personalizada" && (
        <div className="referencia-img personalizada">
          <p className="img-subtexto">
            Creá tus propias zonas de impresión según el producto que necesites.  
            Podés agregar zonas y subzonas libremente.
          </p>
        </div>
      )}

      {/* 🧱 Listado editable */}
      {zonas.length > 0 &&
        zonas.map((zona, i) => (
          <div key={i} className="zona-grupo">
            <div className="zona-header">
              <h4>{zona.grupo}</h4>
              {tipoArea === "personalizada" && (
                <button
                  className="btn-mini-eliminar"
                  onClick={() => eliminarZona(zona.grupo)}
                >
                  ✕
                </button>
              )}
            </div>

            <ul className="lista-editable">
              {(zona.subzonas || []).map((s, j) => (
                <li key={j}>
                  {s}
                  {tipoArea === "personalizada" && (
                    <button
                      className="btn-mini-eliminar"
                      onClick={() => eliminarSubzona(zona.grupo, s)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {tipoArea === "personalizada" && (
              <button
                className="btn-mini-agregar"
                onClick={() => agregarSubzona(zona.grupo)}
              >
                + Subzona
              </button>
            )}
          </div>
        ))}

      {/* 🟢 Botones generales */}
      <div className="zonas-actions">
        {tipoArea === "personalizada" && (
          <button className="btn-agregar" onClick={agregarZona}>
            + Agregar Zona
          </button>
        )}
        <button className="btn-guardar" onClick={guardarCambios}>
          Guardar Cambios
        </button>
        <button className="cancelar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {/* 👁️ Vista previa */}
      <div className="preview-box">
        <h4>Vista previa (como se verá al crear el pedido)</h4>
        {zonas.map((zona, i) => (
          <div key={i} className="preview-zona">
            <strong>{zona.grupo}</strong>
            <div className="preview-subzonas">
              {(zona.subzonas || []).map((s, j) => (
                <div key={j} className="preview-subzona-item">
                  <label>{s}</label>
                  <input type="text" placeholder="Diseño..." disabled />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
