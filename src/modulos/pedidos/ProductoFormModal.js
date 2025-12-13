import React, { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, getDoc, getDocs } from "firebase/firestore";
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

  // 🔹 Cargar productos configurados
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

  // 🔹 Si estamos editando un producto dentro del pedido
  useEffect(() => {
    if (productoEditando) {
      setFormData({
        producto: productoEditando.producto || "",
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

  // 🔹 Cuando se selecciona un producto base
  useEffect(() => {
    const cargarConfiguracionProducto = async () => {
      if (!formData.producto) return;
      try {
        const ref = doc(db, "productosBase", formData.producto);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setSwitchesActivos(data.switches || {});
          setCamposOrden(data.orden_personalizado || data.orden_campos || []);
        }
      } catch (err) {
        console.error("Error al cargar configuración del producto:", err);
      }
    };
    cargarConfiguracionProducto();
  }, [formData.producto]);

  // 🔹 Calcular total de talles
  useEffect(() => {
    const total = Object.values(formData.talles || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );
    setTotalTalles(total);
  }, [formData.talles]);

  // 🔹 Manejo general
  const handleChange = (e) => {
    const { name, value } = e.target;
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

  // 🔹 Guardar producto
  const guardarProducto = async () => {
    if (!formData.producto) {
      setError("Debe seleccionar un producto configurado.");
      return;
    }

    const datosAGuardar = { ...formData, totalTalles };

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

  const zonas = {
    Frente: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"],
    Espalda: ["E1", "E2", "E3", "E4"],
    Mangas: ["M1", "M2"],
  };

  const talles = [
    "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL",
    "XL Mujer", "XXL Mujer",
    "T4", "T6", "T8", "T10", "T12", "T14", "T16"
  ];

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

      case "zonas":
        return (
          <div className="campo-form">
            <label>Zonas de impresión</label>
            {Object.entries(zonas).map(([titulo, items]) => (
              <div key={titulo} className="zona-grupo">
                <h4>{titulo}</h4>
                <div className="zona-campos">
                  {items.map((zona) => (
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

      case "talles":
        return (
          <div className="campo-form">
            <label>Talles disponibles</label>
            <div className="talles-grid">
              {talles.map((t) => (
                <div key={t} className="talle-item">
                  <label>{t}</label>
                  <input
                    type="number"
                    value={formData.talles?.[t] || ""}
                    onChange={(e) => handleTalleChange(t, e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Detalle por talle..."
                    value={formData.detallePorTalle?.[t] || ""}
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
                  className="btn-eliminar-img"
                  onClick={() => eliminarCampoImagen(index)}
                >
                  ✕
                </button>
              </div>
            ))}
            {(formData.imagenes || []).length < 10 && (
              <button className="btn-agregar-img" onClick={agregarCampoImagen}>
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
        <select
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
            ⚙️ Este producto no tiene campos configurados.<br />
            Editalo desde la sección <strong>Configuración de Productos</strong>.
          </div>
        )}

        {/* 🔹 Botones */}
        <div className="modal-buttons">
          <button className="cancelar" onClick={onClose}>
            Cancelar
          </button>
          <button onClick={guardarProducto} disabled={loading}>
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
