import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./ProductoFormModal.css";

export default function ProductoFormModal({
  pedidoId,
  productoEditando,
  onClose,
  onProductoGuardado,
}) {
  const [formData, setFormData] = useState({
    producto: "",
    productoNombre: "",
    color: "",
    detalle: "",
    cantidad: 1,
    zonas: {},
    talles: {},
    detallePorTalle: {},
    imagenes: [""],
  });

  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [switchesActivos, setSwitchesActivos] = useState({});
  const [camposOrden, setCamposOrden] = useState([]);
  const [totalTalles, setTotalTalles] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ colores configurados
  const [coloresDisponibles, setColoresDisponibles] = useState([]);

  // ✅ Config dinámica
  const [zonasConfig, setZonasConfig] = useState(null);
  const [tallesConfig, setTallesConfig] = useState(null);

  // ✅ NUEVO: tipoArea que viene de productosBase (multiple | unica | personalizada)
  const [tipoAreaProducto, setTipoAreaProducto] = useState(null);

  // =========================
  // Helpers
  // =========================
  const buildBooleanMap = (arrOrObj) => {
    if (Array.isArray(arrOrObj)) {
      return arrOrObj.reduce((acc, k) => ({ ...acc, [k]: true }), {});
    }
    if (arrOrObj && typeof arrOrObj === "object") return arrOrObj;
    return {};
  };

  const ensureObject = (val) => (val && typeof val === "object" ? val : {});

  const mergeKeepExisting = (baseKeys, existingObj, defaultValue = "") => {
    const prev = ensureObject(existingObj);
    return (baseKeys || []).reduce((acc, k) => {
      acc[k] = prev[k] ?? defaultValue;
      return acc;
    }, {});
  };

  const getProductoNombreById = (id) => {
    const p = productosDisponibles.find((x) => x.id === id);
    return p?.nombre || "";
  };

  const inferTipoAreaDesdeZonas = (zCfg) => {
    if (!zCfg) return null;

    // zonas como objeto {Frente:[...], Espalda:[...]}
    if (typeof zCfg === "object" && !Array.isArray(zCfg)) {
      const keys = Object.keys(zCfg);
      if (keys.length === 0) return "personalizada";
      if (keys.length === 1) return "unica";
      return "multiple";
    }

    // zonas como array [{grupo, subzonas}]
    if (Array.isArray(zCfg)) {
      if (zCfg.length === 0) return "personalizada";
      if (zCfg.length === 1) return "unica";
      return "multiple";
    }

    return null;
  };

  // =========================
  // Fallbacks
  // =========================
  const zonasFallback = {
    Frente: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"],
    Espalda: ["E1", "E2", "E3", "E4"],
    Mangas: ["M1", "M2"],
  };

  const tallesFallback = [
    "XS","S","M","L","XL","XXL","3XL","4XL","5XL",
    "XL Mujer","XXL Mujer",
    "T4","T6","T8","T10","T12","T14","T16",
  ];

  // =========================
  // 🔹 Cargar productosBase
  // =========================
  useEffect(() => {
    const cargarProductos = async () => {
      try {
        const snapshot = await getDocs(collection(db, "productosBase"));
        const lista = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setProductosDisponibles(lista);
      } catch (err) {
        console.error("Error al cargar productosBase:", err);
      }
    };
    cargarProductos();
  }, []);

  // =========================
  // 🔹 Si editamos
  // =========================
  useEffect(() => {
    if (productoEditando) {
      setFormData({
        producto: productoEditando.producto || "",
        productoNombre: productoEditando.productoNombre || "",
        color: productoEditando.color || "",
        detalle: productoEditando.detalle || "",
        cantidad: productoEditando.cantidad || 1,
        zonas: productoEditando.zonas || {},
        talles: productoEditando.talles || {},
        detallePorTalle: productoEditando.detallePorTalle || {},
        imagenes: productoEditando.imagenes || [""],
      });
    }
  }, [productoEditando]);

  // =========================
  // 🔹 Al seleccionar producto: cargar config
  // =========================
  useEffect(() => {
    const cargarConfiguracionProducto = async () => {
      if (!formData.producto) return;

      try {
        const ref = doc(db, "productosBase", formData.producto);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data();

        // ✅ switches
        const switches = buildBooleanMap(data.switches || {});
        setSwitchesActivos(switches);

        // ✅ orden de campos
        setCamposOrden(data.orden_personalizado || data.orden_campos || []);

        // ✅ zonas / talles
        setZonasConfig(data.zonas ?? null);
        setTallesConfig(data.talles ?? null);

        // ✅ tipoArea (lo guardás como tipoArea según tu captura)
        setTipoAreaProducto(data.tipoArea || data.tipo_area || null);

        // ✅ colores
        setColoresDisponibles(Array.isArray(data.colores) ? data.colores : []);

        // ✅ productoNombre
        setFormData((prev) => ({
          ...prev,
          productoNombre:
            prev.productoNombre || data.nombre || getProductoNombreById(prev.producto),
        }));

        // ✅ asegurar keys talles
        if (Array.isArray(data.talles)) {
          setFormData((prev) => ({
            ...prev,
            talles: mergeKeepExisting(data.talles, prev.talles, 0),
            detallePorTalle: mergeKeepExisting(data.talles, prev.detallePorTalle, ""),
          }));
        } else if (data.talles && typeof data.talles === "object") {
          const keys = Object.keys(data.talles);
          setFormData((prev) => ({
            ...prev,
            talles: mergeKeepExisting(keys, prev.talles, 0),
            detallePorTalle: mergeKeepExisting(keys, prev.detallePorTalle, ""),
          }));
        }
      } catch (err) {
        console.error("Error al cargar configuración del producto:", err);
      }
    };

    cargarConfiguracionProducto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.producto]);

  // =========================
  // 🔹 Calcular total talles
  // =========================
  useEffect(() => {
    const total = Object.values(formData.talles || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );
    setTotalTalles(total);
  }, [formData.talles]);

  // =========================
  // 🔹 Handlers
  // =========================
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "producto") {
      setError("");
      const nombre = getProductoNombreById(value);

      setFormData((prev) => ({
        ...prev,
        producto: value,
        productoNombre: nombre || prev.productoNombre || "",
        color: "",
        zonas: {},
        talles: {},
        detallePorTalle: {},
        imagenes: [""],
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleZonaChange = (zona, value) => {
    setFormData((prev) => ({ ...prev, zonas: { ...prev.zonas, [zona]: value } }));
  };

  const handleTalleChange = (talle, value) => {
    setFormData((prev) => ({
      ...prev,
      talles: { ...prev.talles, [talle]: parseInt(value) || 0 },
    }));
  };

  const handleDetalleTalleChange = (talle, value) => {
    setFormData((prev) => ({
      ...prev,
      detallePorTalle: { ...prev.detallePorTalle, [talle]: value },
    }));
  };

  const handleImagenChange = (index, value) => {
    const nuevas = [...(formData.imagenes || [""])];
    nuevas[index] = value;
    setFormData((prev) => ({ ...prev, imagenes: nuevas }));
  };

  const agregarCampoImagen = () => {
    const nuevas = [...(formData.imagenes || [""])];
    if (nuevas.length < 10) nuevas.push("");
    setFormData((prev) => ({ ...prev, imagenes: nuevas }));
  };

  const eliminarCampoImagen = (index) => {
    const nuevas = [...(formData.imagenes || [])];
    nuevas.splice(index, 1);
    setFormData((prev) => ({ ...prev, imagenes: nuevas.length ? nuevas : [""] }));
  };

  // =========================
  // 🔹 Guardar
  // =========================
  const guardarProducto = async () => {
    if (!formData.producto) {
      setError("Debe seleccionar un producto configurado.");
      return;
    }

    const productoNombreFinal =
      formData.productoNombre || getProductoNombreById(formData.producto) || "";

    const datosAGuardar = {
      ...formData,
      productoNombre: productoNombreFinal,
      totalTalles,
    };

    setLoading(true);
    try {
      const productosRef = collection(db, `pedidos/${pedidoId}/productos`);
      if (productoEditando) {
        await updateDoc(doc(productosRef, productoEditando.id), datosAGuardar);
      } else {
        await addDoc(productosRef, datosAGuardar);
      }
      onProductoGuardado();
      onClose();
    } catch (err) {
      console.error("Error al guardar producto:", err);
      setError("Error al guardar producto.");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // Render helpers
  // =========================
  const resolveZonasToRender = () => {
    if (zonasConfig && typeof zonasConfig === "object" && !Array.isArray(zonasConfig)) {
      return zonasConfig;
    }
    return zonasFallback;
  };

  const resolveTallesToRender = () => {
    if (Array.isArray(tallesConfig)) return tallesConfig;
    if (tallesConfig && typeof tallesConfig === "object") return Object.keys(tallesConfig);
    return tallesFallback;
  };

  const tipoAreaFinal = useMemo(() => {
    return tipoAreaProducto || inferTipoAreaDesdeZonas(zonasConfig) || null;
  }, [tipoAreaProducto, zonasConfig]);

  // ✅ Para no duplicar: si mostramos imágenes arriba, sacamos "imagenes" del render dinámico
  const camposOrdenFiltrados = useMemo(() => {
    return (camposOrden || []).filter((c) => c !== "imagenes");
  }, [camposOrden]);

  const renderReferenciaZonas = () => {
    // Solo mostrar si tiene sentido (si existe zonas o tipoArea o el switch de zonas)
    const habilitado = Boolean(switchesActivos?.zonas || zonasConfig || tipoAreaFinal);
    if (!habilitado) return null;

    if (tipoAreaFinal === "multiple") {
      return (
        <div className="pfm-ref-card">
          <div className="pfm-ref-title">Referencia zonas</div>
          <img
            src="/imagenes/remera_vectorial.png"
            alt="Referencia de zonas"
            className="pfm-ref-img"
          />
          <div className="pfm-ref-sub">
            Esquema de impresión para productos con múltiples áreas (Frente, Espalda, Mangas).
          </div>
        </div>
      );
    }

    if (tipoAreaFinal === "unica") {
      return (
        <div className="pfm-ref-card">
          <div className="pfm-ref-title">Referencia zona única</div>
          <div className="pfm-ref-unica">A1</div>
          <div className="pfm-ref-sub">
            Este producto tiene una sola zona de impresión.
          </div>
        </div>
      );
    }

    if (tipoAreaFinal === "personalizada") {
      return (
        <div className="pfm-ref-card">
          <div className="pfm-ref-title">Referencia personalizada</div>
          <div className="pfm-ref-sub">
            Zonas creadas manualmente. Usá el listado de zonas para cargar detalles.
          </div>
        </div>
      );
    }

    // Si aún no viene tipoArea: no mostramos nada (o podés mostrar un placeholder)
    return null;
  };

  const renderCampo = (campo) => {
    if (!switchesActivos[campo]) return null;

    switch (campo) {
      case "color":
      case "colores":
        return (
          <div className="pfm-field">
            <div className="pfm-label">Color</div>

            {coloresDisponibles.length > 0 ? (
              <select
                className="pfm-control"
                name="color"
                value={formData.color || ""}
                onChange={handleChange}
              >
                <option value="">Seleccionar color...</option>
                {coloresDisponibles.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="pfm-control"
                type="text"
                name="color"
                placeholder="Ej: blanco, negro, rojo..."
                value={formData.color}
                onChange={handleChange}
              />
            )}
          </div>
        );

      case "zonas": {
        const zonas = resolveZonasToRender();
        return (
          <div className="pfm-field">
            <div className="pfm-label">Zonas de impresión</div>

            <div className="pfm-zonas">
              {Object.entries(zonas).map(([titulo, items]) => (
                <div key={titulo} className="pfm-zona-card">
                  <div className="pfm-zona-title">{titulo}</div>

                  <div className="pfm-zona-grid">
                    {(items || []).map((zona) => (
                      <div key={zona} className="pfm-zona-row">
                        <div className="pfm-zona-tag">{zona}</div>
                        <input
                          className="pfm-control pfm-control-sm"
                          type="text"
                          value={formData.zonas?.[zona] || ""}
                          onChange={(e) => handleZonaChange(zona, e.target.value)}
                          placeholder="Detalle..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "talles": {
        const talles = resolveTallesToRender();
        return (
          <div className="pfm-field">
            <div className="pfm-label">Talles disponibles</div>

            <div className="pfm-talles">
              {talles.map((t) => (
                <div key={t} className="pfm-talle-row">
                  <div className="pfm-talle-name">{t}</div>

                  <input
                    className="pfm-control pfm-control-qty"
                    type="number"
                    min="0"
                    value={formData.talles?.[t] ?? 0}
                    onChange={(e) => handleTalleChange(t, e.target.value)}
                  />

                  <input
                    className="pfm-control pfm-control-detail"
                    type="text"
                    placeholder="Detalle por talle..."
                    value={formData.detallePorTalle?.[t] ?? ""}
                    onChange={(e) => handleDetalleTalleChange(t, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="pfm-total">
              📊 Total de unidades: <strong>{totalTalles}</strong>
            </div>
          </div>
        );
      }

      case "imagenes":
        return (
          <div className="pfm-field">
            <div className="pfm-label">Imágenes / Enlaces</div>

            <div className="pfm-links">
              {(formData.imagenes || []).map((img, index) => (
                <div key={index} className="pfm-link-row">
                  <input
                    className="pfm-control"
                    type="text"
                    placeholder="https://drive.google.com/..."
                    value={img}
                    onChange={(e) => handleImagenChange(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="pfm-link-remove"
                    onClick={() => eliminarCampoImagen(index)}
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {(formData.imagenes || []).length < 10 && (
                <button
                  type="button"
                  className="pfm-link-add"
                  onClick={agregarCampoImagen}
                >
                  + Agregar enlace
                </button>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="pfm-overlay" onMouseDown={onClose}>
      <div
        className="pfm-modal scrollable-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pfm-header">
          <h2 className="pfm-title">
            {productoEditando ? "Editar Producto" : "Agregar Producto"}
          </h2>
          <button className="pfm-close" onClick={onClose} type="button" title="Cerrar">
            ✕
          </button>
        </div>

        {error && <div className="pfm-error">{error}</div>}

        {/* ✅ TOP: izquierda (producto/detalle/enlaces) + derecha (referencia) */}
        <div className="pfm-top-grid">
          <div className="pfm-top-left">
            {/* Producto */}
            <div className="pfm-field">
              <div className="pfm-label">Producto</div>
              <select
                className="pfm-control"
                name="producto"
                value={formData.producto}
                onChange={handleChange}
              >
                <option value="">Seleccionar producto...</option>
                {productosDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Detalle general */}
            <div className="pfm-field">
              <div className="pfm-label">Detalle general</div>
              <textarea
                className="pfm-control pfm-textarea"
                name="detalle"
                placeholder="Ej: diseño personalizado, logo en frente..."
                value={formData.detalle}
                onChange={handleChange}
              />
            </div>

            {/* Enlaces arriba (si el switch está activo) */}
            {switchesActivos?.imagenes ? renderCampo("imagenes") : null}
          </div>

          <div className="pfm-top-right">
            {renderReferenciaZonas()}
          </div>
        </div>

        {/* Campos dinámicos */}
        {Object.values(switchesActivos).some((v) => v) ? (
          <div className="pfm-dynamic">
            {camposOrdenFiltrados.map((campo) => (
              <React.Fragment key={campo}>{renderCampo(campo)}</React.Fragment>
            ))}
          </div>
        ) : (
          <div className="pfm-empty">
            ⚙️ Este producto no tiene campos configurados.
            <br />
            Editalo desde <strong>Configuración de Productos</strong>.
          </div>
        )}

        {/* Botones */}
        <div className="pfm-actions">
          <button className="pfm-btn pfm-btn-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="pfm-btn pfm-btn-primary"
            onClick={guardarProducto}
            disabled={loading}
            type="button"
          >
            {loading ? "Guardando..." : productoEditando ? "Guardar Cambios" : "Guardar Producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
