import React, { useState, useEffect } from "react";
import "./ConfiguracionProductos.css";

export default function ZonasConfigEditor({
  zonasIniciales = null, // ahora puede ser array u objeto
  productoNombre = "",
  onGuardar,
  onCerrar,
}) {
  const [zonas, setZonas] = useState([]);
  const [tipoArea, setTipoArea] = useState("multiple"); // multiple | unica | personalizada

  // ✅ Helpers: convertir formatos
  const objectToArray = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    return Object.entries(obj).map(([grupo, subzonas]) => ({
      grupo,
      subzonas: Array.isArray(subzonas) ? subzonas : [],
    }));
  };

  const arrayToObject = (arr) => {
    if (!Array.isArray(arr)) return {};
    return arr.reduce((acc, item) => {
      const grupo = item?.grupo ? String(item.grupo) : "Zonas";
      const subzonas = Array.isArray(item?.subzonas) ? item.subzonas : [];
      acc[grupo] = subzonas.map((s) => String(s));
      return acc;
    }, {});
  };

  const detectarTipoArea = (arr) => {
    // heurística simple: si es 1 grupo con 1 subzona => unica, si hay varios => multiple
    if (!Array.isArray(arr) || arr.length === 0) return "personalizada";
    if (arr.length === 1) return "unica";
    return "multiple";
  };

  // 🟢 Inicialización inmediata (acepta zonasIniciales objeto o array)
  useEffect(() => {
    // 1) Si zonasIniciales viene como OBJETO {Frente:[...]}
    if (zonasIniciales && !Array.isArray(zonasIniciales) && typeof zonasIniciales === "object") {
      const arr = objectToArray(zonasIniciales);
      setZonas(arr);
      setTipoArea(detectarTipoArea(arr));
      return;
    }

    // 2) Si zonasIniciales viene como ARRAY [{grupo, subzonas}]
    if (Array.isArray(zonasIniciales) && zonasIniciales.length > 0) {
      setZonas(zonasIniciales);
      setTipoArea(detectarTipoArea(zonasIniciales));
      return;
    }

    // 3) Si no hay zonas cargadas: precarga por nombre
    const nombre = (productoNombre || "").toLowerCase();
    if (nombre.includes("remera") || nombre.includes("camiseta")) {
      setTipoArea("multiple");
      setZonas([
        { grupo: "Frente", subzonas: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"] },
        { grupo: "Espalda", subzonas: ["E1", "E2", "E3", "E4"] },
        { grupo: "Mangas", subzonas: ["M1", "M2"] },
      ]);
    } else if (nombre.includes("taza") || nombre.includes("gorra")) {
      setTipoArea("unica");
      setZonas([{ grupo: "General", subzonas: ["Zona única de impresión"] }]);
    } else {
      setTipoArea("personalizada");
      setZonas([]);
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
      setZonas([{ grupo: "General", subzonas: ["Zona única de impresión"] }]);
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

  // ✅ Guardar: mandamos OBJETO al padre (formato único en Firestore)
  const guardarCambios = () => {
    const zonasObjeto = arrayToObject(zonas);
    onGuardar(zonasObjeto); // ✅ ahora Firestore queda {Frente:[...], ...}
    onCerrar();
  };

  return (
    <div className="zonas-editor">
      <h2>Zonas de impresión</h2>
      <p className="descripcion">
        Configurá las áreas donde se imprimen tus productos.
        Podés elegir entre múltiples zonas, un área única o crear tus propias zonas.
      </p>

      <div className="tipo-area">
        <label><strong>Tipo de área de impresión:</strong></label>
        <select value={tipoArea} onChange={(e) => setTipoArea(e.target.value)}>
          <option value="multiple">Múltiples áreas (recomendado para remeras)</option>
          <option value="unica">Área única (recomendado para tazas o gorras)</option>
          <option value="personalizada">Personalizada (crear manualmente)</option>
        </select>
      </div>

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
            Este producto tiene una única zona de impresión.
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
