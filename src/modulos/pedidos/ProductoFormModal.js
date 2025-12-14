import React, { useState, useEffect } from "react";
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

  // ✅ NUEVO: colores configurados (para mostrar lista en vez de texto libre)
  const [coloresDisponibles, setColoresDisponibles] = useState([]);

  // ✅ Config dinámica (desde Firestore) para render
  const [zonasConfig, setZonasConfig] = useState(null);
  const [tallesConfig, setTallesConfig] = useState(null);

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

  // =========================
  // Fallbacks (por si falta config)
  // =========================
  const zonasFallback = {
    Frente: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"],
    Espalda: ["E1", "E2", "E3", "E4"],
    Mangas: ["M1", "M2"],
  };

  const tallesFallback = [
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "3XL",
    "4XL",
    "5XL",
    "XL Mujer",
    "XXL Mujer",
    "T4",
    "T6",
    "T8",
    "T10",
    "T12",
    "T14",
    "T16",
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
  // 🔹 Si estamos editando un producto dentro del pedido
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
  // 🔹 Cuando se selecciona un producto base -> cargar config desde Firestore
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

        // ✅ colores (para select)
        setColoresDisponibles(Array.isArray(data.colores) ? data.colores : []);

        // ✅ set productoNombre si no viene
        setFormData((prev) => ({
          ...prev,
          productoNombre: prev.productoNombre || data.nombre || getProductoNombreById(prev.producto),
        }));

        // ✅ si talles viene como array u objeto -> asegurar keys en formData
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

        // ✅ si zonas viene como objeto -> no hace falta tocar formData.zonas,
        // se guardan valores por key cuando el usuario escribe.
      } catch (err) {
        console.error("Error al cargar configuración del producto:", err);
      }
    };

    cargarConfiguracionProducto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.producto]);

  // =========================
  // 🔹 Calcular total de talles
  // =========================
  useEffect(() => {
    const total = Object.values(formData.talles || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );
    setTotalTalles(total);
  }, [formData.talles]);

  // =========================
  // 🔹 Manejo general
  // =========================
  const handleChange = (e) => {
    const { name, value } = e.target;

    // ✅ si cambia producto, set productoNombre también
    if (name === "producto") {
      setError("");
      const nombre = getProductoNombreById(value);
      setFormData((prev) => ({
        ...prev,
        producto: value,
        productoNombre: nombre || prev.productoNombre || "",
        // opcional: resetear campos dependientes
        color: "",
        zonas: {},
        talles: {},
        detallePorTalle: {},
        imagenes: [""],
      }));
      return;
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleZonaChange = (zona, value) => {
    setFormData({ ...formData, zonas: { ...formData.zonas, [zona]: value } });
  };

  const handleTalleChange = (talle, value) => {
    setFormData({
      ...formData,
      talles: { ...formData.talles, [talle]: parseInt(value) || 0 },
    });
  };

  const handleDetalleTalleChange = (talle, value) => {
    setFormData({
      ...formData,
      detallePorTalle: { ...formData.detallePorTalle, [talle]: value },
    });
  };

  const handleImagenChange = (index, value) => {
    const nuevas = [...(formData.imagenes || [""])];
    nuevas[index] = value;
    setFormData({ ...formData, imagenes: nuevas });
  };

  const agregarCampoImagen = () => {
    const nuevas = [...(formData.imagenes || [""])];
    if (nuevas.length < 10) nuevas.push("");
    setFormData({ ...formData, imagenes: nuevas });
  };

  const eliminarCampoImagen = (index) => {
    const nuevas = [...(formData.imagenes || [])];
    nuevas.splice(index, 1);
    setFormData({ ...formData, imagenes: nuevas });
  };

  // =========================
  // 🔹 Guardar producto
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
  // Render helpers dinámicos
  // =========================
  const resolveZonasToRender = () => {
    // zonas como objeto { Frente:[...], Espalda:[...] }
    if (zonasConfig && typeof zonasConfig === "object" && !Array.isArray(zonasConfig)) {
      return zonasConfig;
    }
    // si por algún motivo viene mal, fallback
    return zonasFallback;
  };

  const resolveTallesToRender = () => {
    // talles como array
    if (Array.isArray(tallesConfig)) return tallesConfig;
    // talles como objeto -> keys
    if (tallesConfig && typeof tallesConfig === "object") return Object.keys(tallesConfig);
    return tallesFallback;
  };

  const renderCampo = (campo) => {
    if (!switchesActivos[campo]) return null;

    switch (campo) {
      case "color":
      case "colores":
        return (
          <div className="campo-form">
            <label>Color</label>

            {/* ✅ si hay colores configurados -> select */}
            {coloresDisponibles.length > 0 ? (
              <select name="color" value={formData.color || ""} onChange={handleChange}>
                <option value="">Seleccionar color...</option>
                {coloresDisponibles.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
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
          <div className="campo-form">
            <label>Zonas de impresión</label>
            {Object.entries(zonas).map(([titulo, items]) => (
              <div key={titulo} className="zona-grupo">
                <h4>{titulo}</h4>
                <div className="zona-campos">
                  {(items || []).map((zona) => (
                    <div key={zona} className="zona-item">
                      <label>{zona}</label>
                      <input
                        type="text"
                        value={formData.zonas?.[zona] || ""}
                        onChange={(e) => handleZonaChange(zona, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "talles": {
        const talles = resolveTallesToRender();
        return (
          <div className="campo-form">
            <label>Talles disponibles</label>
            <div className="talles-grid">
              {talles.map((t) => (
                <div key={t} className="talle-item">
                  <label>{t}</label>
                  <input
                    type="number"
                    value={formData.talles?.[t] ?? ""}
                    onChange={(e) => handleTalleChange(t, e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Detalle por talle..."
                    value={formData.detallePorTalle?.[t] ?? ""}
                    onChange={(e) => handleDetalleTalleChange(t, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <p className="total-talles">
              📊 Total de unidades: <strong>{totalTalles}</strong>
            </p>
          </div>
        );
      }

      case "imagenes":
        return (
          <div className="campo-form">
            <label>Imágenes / Enlaces</label>
            {(formData.imagenes || []).map((img, index) => (
              <div key={index} className="imagen-item">
                <input
                  type="text"
                  placeholder="https://drive.google.com/..."
                  value={img}
                  onChange={(e) => handleImagenChange(index, e.target.value)}
                />
                <button
                  type="button"
                  className="btn-eliminar-img"
                  onClick={() => eliminarCampoImagen(index)}
                >
                  ✕
                </button>
              </div>
            ))}
            {(formData.imagenes || []).length < 10 && (
              <button type="button" className="btn-agregar-img" onClick={agregarCampoImagen}>
                + Agregar enlace
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content producto-form scrollable-modal">
        <h2>{productoEditando ? "Editar Producto" : "Agregar Producto"}</h2>

        {error && <div className="error">{error}</div>}

        {/* 🔹 Selección de producto */}
        <label>Producto</label>
        <select name="producto" value={formData.producto} onChange={handleChange}>
          <option value="">Seleccionar producto...</option>
          {productosDisponibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {/* 🔹 Detalle general */}
        <label>Detalle general</label>
        <textarea
          name="detalle"
          placeholder="Ej: diseño personalizado, logo en frente..."
          value={formData.detalle}
          onChange={handleChange}
        ></textarea>

        {/* 🔹 Campos configurados dinámicamente */}
        {Object.values(switchesActivos).some((v) => v) ? (
          camposOrden.map((campo) => (
            <React.Fragment key={campo}>{renderCampo(campo)}</React.Fragment>
          ))
        ) : (
          <div className="mensaje-sin-campos">
            ⚙️ Este producto no tiene campos configurados.
            <br />
            Editalo desde la sección <strong>Configuración de Productos</strong>.
          </div>
        )}

        {/* 🔹 Botones */}
        <div className="modal-buttons">
          <button className="cancelar" onClick={onClose} type="button">
            Cancelar
          </button>
          <button onClick={guardarProducto} disabled={loading} type="button">
            {loading
              ? "Guardando..."
              : productoEditando
              ? "Guardar Cambios"
              : "Guardar Producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
