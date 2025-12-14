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
    productoNombre: "", // ✅ nuevo
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

  // ✅ Config dinámica (desde Firestore) para render
  const [zonasConfig, setZonasConfig] = useState(null); // puede ser array u objeto
  const [tallesConfig, setTallesConfig] = useState(null); // puede ser array u objeto

  // =========================
  // Helpers de normalización
  // =========================
  const buildBooleanMap = (arrOrObj) => {
    // ["color","talles"] => { color:true, talles:true } (o false, no importa; usamos truthy)
    if (Array.isArray(arrOrObj)) {
      return arrOrObj.reduce((acc, k) => ({ ...acc, [k]: true }), {});
    }
    if (arrOrObj && typeof arrOrObj === "object") return arrOrObj;
    return {};
  };

  const ensureObject = (val) => (val && typeof val === "object" ? val : {});

  const mergeKeepExisting = (baseKeys, existingObj, defaultValue = "") => {
    // baseKeys: array de strings
    // existingObj: {key: value}
    // devuelve objeto con keys de baseKeys, preservando si ya existía
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
  // Fallbacks (para no romper)
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
  // 🔹 Cargar productos configurados
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
        productoNombre: productoEditando.productoNombre || "", // ✅ nuevo
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

        // ✅ switches normalizados
        const switches = buildBooleanMap(data.switches || {});
        setSwitchesActivos(switches);

        // ✅ orden de campos
        setCamposOrden(data.orden_personalizado || data.orden_campos || []);

        // ✅ zonas/talles dinámicos (pueden ser array u objeto)
        const zonasFromDb = data.zonas ?? null;
        const tallesFromDb = data.talles ?? null;

        setZonasConfig(zonasFromDb);
        setTallesConfig(tallesFromDb);

        // ✅ setear productoNombre si no está (o si quedó vacío)
        setFormData((prev) => ({
          ...prev,
          productoNombre: prev.productoNombre || data.nombre || getProductoNombreById(prev.producto),
        }));

        // ✅ si viene zonas/talles como ARRAY, armamos estructura base (preservando lo ya cargado)
        //   - zonas: string => value "" (texto)
        //   - talles: string => value 0 (cantidad)
        if (Array.isArray(zonasFromDb)) {
          setFormData((prev) => ({
            ...prev,
            zonas: mergeKeepExisting(zonasFromDb, prev.zonas, ""),
          }));
        }

        if (Array.isArray(tallesFromDb)) {
          setFormData((prev) => ({
            ...prev,
            talles: mergeKeepExisting(tallesFromDb, prev.talles, 0),
            detallePorTalle: mergeKeepExisting(tallesFromDb, prev.detallePorTalle, ""),
          }));
        }

        // ✅ si viene talles como OBJ {XL:true,...} o {XL:0,...} => usamos keys
        if (tallesFromDb && !Array.isArray(tallesFromDb) && typeof tallesFromDb === "object") {
          const keys = Object.keys(tallesFromDb);
          setFormData((prev) => ({
            ...prev,
            talles: mergeKeepExisting(keys, prev.talles, 0),
            detallePorTalle: mergeKeepExisting(keys, prev.detallePorTalle, ""),
          }));
        }

        // ✅ si viene zonas como OBJ agrupado {Frente:[...], Espalda:[...]} => no hace falta tocar formData.zonas
        // se renderiza por items y se guarda en formData.zonas con keys de cada zona
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

    // ✅ si cambia producto, reseteo error y seteo productoNombre
    if (name === "producto") {
      setError("");
      const nombre = getProductoNombreById(value);
      setFormData((prev) => ({
        ...prev,
        producto: value,
        productoNombre: nombre || prev.productoNombre || "",
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

    // ✅ asegurar productoNombre antes de guardar
    const productoNombreFinal =
      formData.productoNombre || getProductoNombreById(formData.producto) || "";

    const datosAGuardar = {
      ...formData,
      productoNombre: productoNombreFinal, // ✅ nuevo
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
  const normalizeZonasToRender = (raw) => {
  // Caso 1: array de objetos [{grupo, subzonas}]
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw[0] && typeof raw[0] === "object") {
      // [{grupo:"Frente", subzonas:["F1","F2"]}, ...]
      if ("grupo" in raw[0] && "subzonas" in raw[0]) {
        return raw.reduce((acc, item) => {
          const titulo = item.grupo || "Zonas";
          const items = Array.isArray(item.subzonas) ? item.subzonas : [];
          acc[titulo] = items.map((z) => String(z));
          return acc;
        }, {});
      }

      // array de objetos genérico -> intentamos sacar un string
      return { Zonas: raw.map((x) => String(x.nombre || x.codigo || x.id || "")) };
    }

    // Caso 2: array de strings ["F1","F2"]
    return { Zonas: raw.map((z) => String(z)) };
  }

  // Caso 3: objeto { Frente:[...], Espalda:[...] }
  if (raw && typeof raw === "object") {
    const out = {};
    Object.entries(raw).forEach(([titulo, items]) => {
      if (Array.isArray(items)) {
        out[titulo] = items.map((z) =>
          typeof z === "string" ? z : String(z.nombre || z.codigo || z.id || "")
        );
      } else {
        out[titulo] = [];
      }
    });
    return out;
  }

  // Caso 4: null/undefined
  return null;
};

const resolveZonasToRender = () => {
  const normalizadas = normalizeZonasToRender(zonasConfig);
  return normalizadas && Object.keys(normalizadas).length > 0
    ? normalizadas
    : zonasFallback;
};


  const resolveTallesToRender = () => {
    // 1) array
    if (Array.isArray(tallesConfig)) return tallesConfig;

    // 2) obj -> keys
    if (tallesConfig && typeof tallesConfig === "object") return Object.keys(tallesConfig);

    // 3) fallback
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
            <input
              type="text"
              name="color"
              placeholder="Ej: blanco, negro, rojo..."
              value={formData.color}
              onChange={handleChange}
            />
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
              <button
                type="button"
                className="btn-agregar-img"
                onClick={agregarCampoImagen}
              >
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
