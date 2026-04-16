import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import "./ProductoFormModal.css";
import { puedeHacer } from "../../utils/permisos";

export default function ProductoFormModal({
  pedidoId,
  productoEditando,
  onClose,
  onProductoGuardado,
  perfil,
  soloVer,
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
  atributosExtra: {},
  detallesCostura: {},
  imagenes: [{ url: "", tipo: "link", portada: false }],
});

  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [switchesActivos, setSwitchesActivos] = useState({});
  const [camposOrden, setCamposOrden] = useState([]);
  const [totalTalles, setTotalTalles] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipoAreaConfig, setTipoAreaConfig] = useState(""); // multiple | unica | personalizada




  // ✅ colores configurados
  const [coloresDisponibles, setColoresDisponibles] = useState([]);

  // ✅ Config dinámica
  const [zonasConfig, setZonasConfig] = useState(null);
  const [tallesConfig, setTallesConfig] = useState(null);

  const [atributosExtraConfig, setAtributosExtraConfig] = useState([]);

  const [detallesCosturaConfig, setDetallesCosturaConfig] = useState([]);

  // ✅ NUEVO: tipo de área para mostrar referencia (multiple | unica | personalizada)
  const [tipoArea, setTipoArea] = useState("");

  const [imagenReferenciaPersonalizada, setImagenReferenciaPersonalizada] = useState("");

  const [modoEdicionLocal, setModoEdicionLocal] = useState(!soloVer);
  const [mostrarReferenciaZonas, setMostrarReferenciaZonas] = useState(false);


  const puedeEditarPedidos = puedeHacer(perfil, "pedidos", "editar");
  const habilitarUploadImagenes = true; // después esto puede venir del plan


const modoVistaEstatica = !!productoEditando && soloVer && !modoEdicionLocal;
const modoSoloLecturaReal = !modoEdicionLocal && soloVer;

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

  // ✅ Inferir tipoArea desde zonas si falta o viene mal
  const inferTipoAreaFromZonas = (zonas) => {
    if (!zonas) return "";

    // zonas como array [{grupo, subzonas}]
    if (Array.isArray(zonas)) {
      if (zonas.length <= 1) return "unica";
      return "multiple";
    }

    // zonas como objeto { Frente:[...], Espalda:[...], ... }
    if (typeof zonas === "object") {
      const keys = Object.keys(zonas);
      if (keys.length <= 1) return "unica";
      return "multiple";
    }

    return "";
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
          if (!perfil || (perfil.rol !== "superadmin" && !perfil.clienteId)) {
            setProductosDisponibles([]);
            setLoadingProductos(false);
            return;
          }

          setLoadingProductos(true);

          const productosRef = collection(db, "productosBase");

          const q =
            perfil.rol === "superadmin"
              ? query(productosRef)
              : query(productosRef, where("clienteId", "==", perfil.clienteId));

          const snapshot = await getDocs(q);

          const lista = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

          setProductosDisponibles(lista);
        } catch (err) {
          console.error("Error al cargar productosBase:", err);
          setProductosDisponibles([]);
        } finally {
          setLoadingProductos(false);
        }
      };

      cargarProductos();
    }, [perfil?.rol, perfil?.clienteId]);

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
        atributosExtra: productoEditando.atributosExtra || {},
        detallesCostura: productoEditando.detallesCostura || {},
        imagenes:
          (productoEditando.imagenes || []).map((img) => {
            if (typeof img === "string") {
              return { url: img, tipo: "link", portada: false };
            }
            return {
              ...img,
              portada: img?.tipo === "storage" ? !!img?.portada : false,
            };
          }).length > 0
            ? (productoEditando.imagenes || []).map((img) => {
                if (typeof img === "string") {
                  return { url: img, tipo: "link", portada: false };
                }
                return {
                  ...img,
                  portada: img?.tipo === "storage" ? !!img?.portada : false,
                };
              })
            : [{ url: "", tipo: "link", portada: false }],
      });
    }

    // si entro a ver un producto ya cargado, arranco en modo vista
    setModoEdicionLocal(!soloVer);
  }, [productoEditando, soloVer]);

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

       // ✅ zonas / talles / atributos
        setZonasConfig(data.zonas ?? null);
        setTallesConfig(data.talles ?? null);
        setAtributosExtraConfig(Array.isArray(data.atributosExtra) ? data.atributosExtra : []);

        setDetallesCosturaConfig(Array.isArray(data.detallesCostura) ? data.detallesCostura : []);

        // ✅ colores
        setColoresDisponibles(Array.isArray(data.colores) ? data.colores : []);

        // ✅ tipoArea: lee Firestore o lo infiere desde zonas
        const tipoDirecto = data.tipoArea || data.tipo_area || "";
        const tipoInferido = inferTipoAreaFromZonas(data.zonas);
        const tipoFinal = (tipoDirecto || tipoInferido || "").toLowerCase();

        // normalizamos solo valores válidos
        const tipoNormalizado =
          tipoFinal === "multiple" || tipoFinal === "unica" || tipoFinal === "personalizada"
            ? tipoFinal
            : "";

        setTipoArea(tipoNormalizado);

        setImagenReferenciaPersonalizada(data.imagenReferenciaPersonalizada || "");

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
        // ✅ asegurar keys atributos extra
        if (Array.isArray(data.atributosExtra)) {
          const atributosKeys = data.atributosExtra
            .map((a) => a?.nombre)
            .filter(Boolean);

          setFormData((prev) => ({
            ...prev,
            atributosExtra: mergeKeepExisting(atributosKeys, prev.atributosExtra, ""),
          }));
        }

        if (Array.isArray(data.detallesCostura)) {
          const costuraKeys = data.detallesCostura
            .map((a) => a?.nombre)
            .filter(Boolean);

          setFormData((prev) => ({
            ...prev,
            detallesCostura: mergeKeepExisting(costuraKeys, prev.detallesCostura, ""),
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
      atributosExtra: {},
      detallesCostura: {},
      imagenes: [{ url: "", tipo: "link", portada: false }],
    }));

      // importante: reseteamos referencia hasta cargar el doc nuevo
      setTipoArea("");
      setImagenReferenciaPersonalizada("");
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

  const handleAtributoExtraChange = (nombre, value) => {
    setFormData((prev) => ({
      ...prev,
      atributosExtra: {
        ...prev.atributosExtra,
        [nombre]: value,
      },
    }));
  };

  const handleDetalleCosturaChange = (nombre, value) => {
  setFormData((prev) => ({
    ...prev,
    detallesCostura: {
      ...prev.detallesCostura,
      [nombre]: value,
    },
  }));
};

const subirImagenProducto = async (file) => {
  try {
    if (!file) return;

    const path = `pedidos/${pedidoId}/productos/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    setFormData((prev) => {
      const imagenesPrevias = (prev.imagenes || []).filter((img) => {
        if (typeof img === "string") return String(img).trim() !== "";
        return String(img?.url || "").trim() !== "";
      });

      const yaHayPortadaStorage = imagenesPrevias.some((img) => {
        if (typeof img === "string") return false;
        return img?.tipo === "storage" && img?.portada === true;
      });

      return {
        ...prev,
        imagenes: [
          ...imagenesPrevias,
          {
            url,
            tipo: "storage",
            nombre: file.name,
            portada: !yaHayPortadaStorage,
          },
        ],
      };
    });
  } catch (error) {
    console.error("Error subiendo imagen del producto:", error);
    setError("No se pudo subir la imagen.");
  }
};

const handleImagenChange = (index, value) => {
  const nuevas = [...(formData.imagenes || [{ url: "", tipo: "link", portada: false }])];
  nuevas[index] = {
    ...nuevas[index],
    url: value,
    tipo: "link",
    portada: nuevas[index]?.portada || false,
  };

  setFormData((prev) => ({ ...prev, imagenes: nuevas }));
};

const agregarCampoImagen = () => {
  const nuevas = [...(formData.imagenes || [{ url: "", tipo: "link", portada: false }])];
  if (nuevas.length < 10) nuevas.push({ url: "", tipo: "link", portada: false });
  setFormData((prev) => ({ ...prev, imagenes: nuevas }));
};

const eliminarCampoImagen = (index) => {
  const nuevas = [...(formData.imagenes || [])];
  nuevas.splice(index, 1);

  const nuevasConContenido = nuevas.filter((img) => {
    if (typeof img === "string") return String(img).trim() !== "";
    return String(img?.url || "").trim() !== "";
  });

  const hayPortadaStorage = nuevasConContenido.some((img) => {
    if (typeof img === "string") return false;
    return img?.tipo === "storage" && img?.portada === true;
  });

  let primeraStorageAsignada = false;

  const normalizadas = nuevasConContenido.map((img) => {
    const normalizada =
      typeof img === "string" ? { url: img, tipo: "link", portada: false } : img;

    if (normalizada.tipo !== "storage") {
      return {
        ...normalizada,
        portada: false,
      };
    }

    if (hayPortadaStorage) {
      return {
        ...normalizada,
        portada: !!normalizada.portada,
      };
    }

    if (!primeraStorageAsignada) {
      primeraStorageAsignada = true;
      return {
        ...normalizada,
        portada: true,
      };
    }

    return {
      ...normalizada,
      portada: false,
    };
  });

  setFormData((prev) => ({
    ...prev,
    imagenes: normalizadas.length
      ? normalizadas
      : [{ url: "", tipo: "link", portada: false }],
  }));
};

const marcarImagenComoPortada = (index) => {
  const nuevas = (formData.imagenes || []).map((img, i) => {
    const normalizada =
      typeof img === "string" ? { url: img, tipo: "link", portada: false } : img;

    return {
      ...normalizada,
      portada: normalizada.tipo === "storage" ? i === index : false,
    };
  });

  setFormData((prev) => ({
    ...prev,
    imagenes: nuevas,
  }));
};

  // =========================
  // 🔹 Guardar
  // =========================
  const guardarProducto = async () => {
    if (!puedeEditarPedidos || modoSoloLecturaReal) {
      setError("No tenés permisos para editar productos del pedido.");
      return;
    }
    if (!formData.producto) {
      setError("Debe seleccionar un producto configurado.");
      return;
    }

    if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
      setError("No se encontró el clienteId del usuario.");
      return;
    }

    const productoNombreFinal =
      formData.productoNombre || getProductoNombreById(formData.producto) || "";

    const datosAGuardar = {
      ...formData,
      productoNombre: productoNombreFinal,
      totalTalles,
      clienteId: perfil?.clienteId || "",
    };

    setLoading(true);
    setError("");

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
      setError(`Error al guardar producto: ${err.message}`);
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

  // ✅ Referencia (derecha)
  const renderReferencia = () => {
    // si todavía no sabemos, no mostramos nada (para evitar “A1” incorrecto)
    if (!tipoArea) return null;

    if (tipoArea === "multiple") {
      return (
        <div className="pfm-ref-card">
          <div className="pfm-ref-title">Referencia zonas múltiples</div>
          <img
            src="/imagenes/remera_vectorial.png"
            alt="Referencia de zonas"
            className="pfm-ref-img"
          />
          <div className="pfm-ref-sub">
            Ejemplo de esquema de impresión para productos con múltiples áreas (Frente, Espalda, Mangas).
          </div>
        </div>
      );
    }

    if (tipoArea === "unica") {
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

if (tipoArea === "personalizada") {
  return (
    <div className="pfm-ref-card">
      <div className="pfm-ref-title">Referencia personalizada</div>

      {imagenReferenciaPersonalizada ? (
        <>
          <img
            src={imagenReferenciaPersonalizada}
            alt="Referencia personalizada"
            className="pfm-ref-img"
          />
          <div className="pfm-ref-sub">
            Guía visual personalizada para este producto.
          </div>
        </>
      ) : (
        <div className="pfm-ref-sub">
          Las zonas son personalizadas para este producto.
        </div>
      )}
    </div>
  );
}

    return null;
  };

  

const imagenesConContenido = (formData.imagenes || []).filter((img) => {
  if (typeof img === "string") return String(img).trim() !== "";
  return String(img?.url || "").trim() !== "";
});

const imagenPortada = imagenesConContenido.find((img) =>
  typeof img === "string" ? false : img?.tipo === "storage" && img?.portada === true
);

  const tallesUsados = Object.entries(formData.talles || {}).filter(([talle, cantidad]) => {
    const qty = Number(cantidad) || 0;
    const detalle = String(formData.detallePorTalle?.[talle] || "").trim();
    return qty > 0 || detalle !== "";
  });

  const zonasUsadas = Object.entries(formData.zonas || {}).filter(([zona, valor]) => {
    return String(valor || "").trim() !== "";
  });

    const buildZonasAgrupadas = () => {
    const usadasMap = Object.entries(formData.zonas || {}).reduce((acc, [zona, valor]) => {
      if (String(valor || "").trim() !== "") {
        acc[zona] = valor;
      }
      return acc;
    }, {});

    const grupos = [];

    if (zonasConfig && typeof zonasConfig === "object" && !Array.isArray(zonasConfig)) {
      Object.entries(zonasConfig).forEach(([grupo, codigos]) => {
        const items = (codigos || [])
          .filter((codigo) => usadasMap[codigo] !== undefined)
          .map((codigo) => ({
            codigo,
            valor: usadasMap[codigo],
          }));

        if (items.length > 0) {
          grupos.push({ grupo, items });
        }
      });

      return grupos;
    }

    // fallback si no hay config clara
    const frente = [];
    const espalda = [];
    const mangas = [];
    const otros = [];

    Object.entries(usadasMap).forEach(([codigo, valor]) => {
      if (codigo.startsWith("F")) frente.push({ codigo, valor });
      else if (codigo.startsWith("E")) espalda.push({ codigo, valor });
      else if (codigo.startsWith("M")) mangas.push({ codigo, valor });
      else otros.push({ codigo, valor });
    });

    const sortByCodigo = (a, b) =>
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: "base" });

    frente.sort(sortByCodigo);
    espalda.sort(sortByCodigo);
    mangas.sort(sortByCodigo);
    otros.sort(sortByCodigo);

    if (frente.length) grupos.push({ grupo: "Frente", items: frente });
    if (espalda.length) grupos.push({ grupo: "Espalda", items: espalda });
    if (mangas.length) grupos.push({ grupo: "Mangas", items: mangas });
    if (otros.length) grupos.push({ grupo: "Otras", items: otros });

    return grupos;
  };

  const zonasAgrupadas = buildZonasAgrupadas();

  const atributosUsados = Object.entries(formData.atributosExtra || {}).filter(([k, valor]) => {
    return String(valor || "").trim() !== "";
  });

  const detallesCosturaUsados = Object.entries(formData.detallesCostura || {}).filter(
  ([k, valor]) => String(valor || "").trim() !== ""
);

    const renderCampoEstatico = (campo) => {
    switch (campo) {
      case "color":
      case "colores":
        return formData.color ? (
          <div className="pfm-static-card" key="color">
            <div className="pfm-static-card-title">Color</div>
            <div className="pfm-static-badge">
              <span className="pfm-static-badge-dot" />
              {formData.color}
            </div>
          </div>
        ) : null;

      case "zonas":
        return zonasAgrupadas.length > 0 ? (
          <div className="pfm-static-card" key="zonas">
            <div className="pfm-static-card-title">Zonas de impresión</div>

            <div className="pfm-static-zonas-layout">
              <div className="pfm-static-zonas-ref">
                {renderReferencia()}
              </div>

              <div className="pfm-static-zonas-data">
                {zonasAgrupadas.map(({ grupo, items }) => (
                  <div key={grupo} className="pfm-static-zona-group">
                    <div className="pfm-static-zona-group-title">{grupo}</div>

                    <div className="pfm-static-zonas-grid">
                      {items.map(({ codigo, valor }) => (
                        <div key={codigo} className="pfm-static-zona-item">
                          <div className="pfm-static-zona-top">
                            <div className="pfm-static-zona-code">{codigo}</div>
                          </div>
                          <div className="pfm-static-zona-text">{valor}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null;

      case "talles":
        return tallesUsados.length > 0 ? (
          <div className="pfm-static-card" key="talles">
            <div className="pfm-static-card-head">
              <div className="pfm-static-card-title">Talles cargados</div>
              <div className="pfm-static-total-badge">
                Total: <strong>{totalTalles}</strong>
              </div>
            </div>

            <div className="pfm-static-talles-grid">
              {tallesUsados.map(([talle, cantidad]) => (
                <div key={talle} className="pfm-static-talle-chip">
                  <div className="pfm-static-talle-top">
                    <span className="pfm-static-talle-name">{talle}</span>
                    <span className="pfm-static-talle-qty">
                      {Number(cantidad) || 0}
                      <span className="pfm-static-talle-qty-unit"> uni.</span>
                    </span>
                  </div>

                  {formData.detallePorTalle?.[talle] ? (
                    <div className="pfm-static-talle-detail">
                      {formData.detallePorTalle[talle]}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null;

      case "atributosExtra":
        return atributosUsados.length > 0 ? (
          <div className="pfm-static-card" key="atributosExtra">
            <div className="pfm-static-card-title">Atributos adicionales</div>

            <div className="pfm-static-table">
              {atributosUsados.map(([nombre, valor]) => (
                <div key={nombre} className="pfm-static-table-row">
                  <div className="pfm-static-table-key">{nombre}</div>
                  <div className="pfm-static-table-value">{valor}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null;

      case "detallesCostura":
        return detallesCosturaUsados.length > 0 ? (
          <div className="pfm-static-card" key="detallesCostura">
            <div className="pfm-static-card-title">Detalles de costura</div>

            <div className="pfm-static-table">
              {detallesCosturaUsados.map(([nombre, valor]) => (
                <div key={nombre} className="pfm-static-table-row">
                  <div className="pfm-static-table-key">{nombre}</div>
                  <div className="pfm-static-table-value">{valor}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null;

      case "imagenes":
        return imagenesConContenido.length > 0 ? (
          <div className="pfm-static-card" key="imagenes">
            <div className="pfm-static-card-title">Imágenes</div>

            <div className="pfm-static-imagenes-grid">
              {imagenesConContenido.map((img, index) => {
                const normalizada =
                  typeof img === "string"
                    ? { url: img, tipo: "link", portada: false }
                    : img;

                const url = normalizada?.url || "";
                const portada = !!normalizada?.portada;
                const tipo = normalizada?.tipo || "link";

                return (
                  <div
                    key={`${url}-${index}`}
                    className={`pfm-static-imagen-card ${portada ? "is-portada" : ""}`}
                  >
                    <img
                      src={url}
                      alt={`imagen-${index}`}
                      className="pfm-static-imagen-preview"
                    />

                    <div className="pfm-static-imagen-meta">
                      {portada ? (
                        <span className="pfm-static-imagen-badge">Portada</span>
                      ) : tipo === "storage" ? (
                        <span className="pfm-static-imagen-badge soft">Imagen</span>
                      ) : (
                        <span className="pfm-static-imagen-badge soft">Link</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  const renderVistaEstatica = () => {
    const productoTitulo =
      formData.productoNombre || getProductoNombreById(formData.producto) || "Producto";

    const bloquesDinamicos = (camposOrden || [])
      .map((campo) => renderCampoEstatico(campo))
      .filter(Boolean);

    return (
      <div className="pfm-static">
        <div className="pfm-static-hero">
          <div>
            <div className="pfm-static-eyebrow pfm-static-eyebrow-strong">
              Detalle del producto
            </div>
            <div className="pfm-static-producto pfm-static-producto-soft">
              {productoTitulo}
            </div>
          </div>
        </div>

        {formData.detalle ? (
          <div className="pfm-static-card">
            <div className="pfm-static-card-title">Detalle general</div>
            <div className="pfm-static-card-text">{formData.detalle}</div>
          </div>
        ) : null}

        {bloquesDinamicos}

        {!formData.detalle && bloquesDinamicos.length === 0 ? (
          <div className="pfm-empty">Este producto no tiene datos cargados.</div>
        ) : null}
      </div>
    );
  };

  const renderCampo = (campo) => {
    if (!switchesActivos[campo]) return null;

    switch (campo) {
      case "color":
      case "colores":
        // =========================
// ✅ Helper: resumen de zonas (para referencia "personalizada")
// =========================
const countZonas = (z) => {
  if (!z) return { grupos: 0, subzonas: 0, resumen: [] };

  // Formato array: [{grupo, subzonas}]
  if (Array.isArray(z)) {
    const resumen = z.map((x) => ({
      grupo: x?.grupo || "Zona",
      cant: Array.isArray(x?.subzonas) ? x.subzonas.length : 0,
    }));
    return {
      grupos: resumen.length,
      subzonas: resumen.reduce((a, b) => a + b.cant, 0),
      resumen,
    };
  }

  // Formato objeto: { Frente:[...], Espalda:[...] }
  if (typeof z === "object") {
    const entries = Object.entries(z);
    const resumen = entries.map(([grupo, arr]) => ({
      grupo,
      cant: Array.isArray(arr) ? arr.length : 0,
    }));
    return {
      grupos: resumen.length,
      subzonas: resumen.reduce((a, b) => a + b.cant, 0),
      resumen,
    };
  }

  return { grupos: 0, subzonas: 0, resumen: [] };
};
     

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
                {coloresDisponibles.map((c, i) => {
                  const nombreColor = typeof c === "string" ? c : c?.nombre || "";
                  const codigoColor = typeof c === "string" ? "" : c?.codigo || "";

                  return (
                    <option key={`${nombreColor}-${i}`} value={nombreColor}>
                      {codigoColor ? `${nombreColor}` : nombreColor}
                    </option>
                  );
                })}
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
          <div
            className="pfm-field pfm-field-zonas"
            onMouseEnter={() => setMostrarReferenciaZonas(true)}
            onMouseLeave={() => setMostrarReferenciaZonas(false)}
          >
            <div className="pfm-label-row">
              <div className="pfm-label">Zonas de impresión</div>

              <div
                className="pfm-zonas-ref-trigger"
                onMouseEnter={() => setMostrarReferenciaZonas(true)}
                onMouseLeave={() => setMostrarReferenciaZonas(false)}
              >
                <div className="pfm-zonas-ref-trigger-box">
                  <span className="pfm-zonas-ref-trigger-text">Ver</span>

                  {tipoArea === "multiple" ? (
                    <img
                      src="/imagenes/remera_vectorial.png"
                      alt="Referencia"
                      className="pfm-zonas-ref-trigger-thumb"
                    />
                  ) : imagenReferenciaPersonalizada ? (
                    <img
                      src={imagenReferenciaPersonalizada}
                      alt="Referencia"
                      className="pfm-zonas-ref-trigger-thumb"
                    />
                  ) : (
                    <div className="pfm-zonas-ref-trigger-thumb pfm-zonas-ref-trigger-thumb-empty">
                      Ref
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="pfm-zonas pfm-zonas-with-ref"
              onMouseEnter={() => setMostrarReferenciaZonas(true)}
              onMouseLeave={() => setMostrarReferenciaZonas(false)}
            >
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

            case "atributosExtra":
        return (
          <div className="pfm-field">
            <div className="pfm-label">Atributos adicionales</div>

            <div className="pfm-atributos-extra">
              {(atributosExtraConfig || []).map((attr, i) => {
                const nombreAttr = attr?.nombre || `Campo ${i + 1}`;

                return (
                  <div key={`${nombreAttr}-${i}`} className="pfm-atributo-row">
                    <div className="pfm-atributo-name">{nombreAttr}</div>
                    <input
                      className="pfm-control"
                      type="text"
                      placeholder={`Ingresar ${nombreAttr.toLowerCase()}...`}
                      value={formData.atributosExtra?.[nombreAttr] || ""}
                      onChange={(e) =>
                        handleAtributoExtraChange(nombreAttr, e.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "detallesCostura":
        return (
          <div className="pfm-field">
            <div className="pfm-label">Detalles de costura</div>

            <div className="pfm-costura-grid">
              {(detallesCosturaConfig || []).map((attr, i) => {
                const nombreAttr = attr?.nombre || `Campo ${i + 1}`;

                return (
                  <div key={`${nombreAttr}-${i}`} className="pfm-costura-item">
                    <div className="pfm-costura-name">{nombreAttr}</div>
                    <input
                      className="pfm-control"
                      type="text"
                      placeholder={`Ingresar ${nombreAttr.toLowerCase()}...`}
                      value={formData.detallesCostura?.[nombreAttr] || ""}
                      onChange={(e) =>
                        handleDetalleCosturaChange(nombreAttr, e.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );

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
                    value={typeof img === "string" ? img : img?.url || ""}
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
            {productoEditando
              ? modoVistaEstatica
                ? "Detalle del Producto"
                : "Editar Producto"
              : "Agregar Producto"}
          </h2>
          <button className="pfm-close" onClick={onClose} type="button" title="Cerrar">
            ✕
          </button>
        </div>

        {error && <div className="pfm-error">{error}</div>}

        {/* ✅ TOP GRID: izq campos base + der referencia */}
        {modoVistaEstatica ? (
          renderVistaEstatica()
        ) : (
          <>
            {/* ✅ TOP GRID: izq campos base + der referencia */}
            <div className="pfm-top-grid">
              <div className="pfm-top-left">
                {/* Producto */}
                <div className="pfm-field">
                  <div className="pfm-label">Producto</div>
                  <select
                    className="pfm-control"
                    name="producto"
                    value={loadingProductos ? "" : formData.producto}
                    onChange={handleChange}
                    disabled={loadingProductos || soloVer}
                  >
                    <option value="">
                      {loadingProductos ? "Cargando productos..." : "Seleccionar producto..."}
                    </option>
                    {productosDisponibles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  {!loadingProductos && productosDisponibles.length === 0 && (
                    <div className="pfm-empty" style={{ marginTop: "8px" }}>
                      No hay productos configurados disponibles.
                    </div>
                  )}
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

                {/* Links */}
                <div className="pfm-field">
                  <div className="pfm-label">Imágenes</div>

                  <div className="pfm-imagenes-toolbar">
                    {habilitarUploadImagenes && (
                      <label className="pfm-link-add" style={{ display: "inline-block", cursor: "pointer" }}>
                        + Subir imagen
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) subirImagenProducto(file);
                          }}
                        />
                      </label>
                    )}

                    {(formData.imagenes || []).length < 10 && (
                      <button
                        type="button"
                        className="pfm-link-add"
                        onClick={agregarCampoImagen}
                      >
                        + Agregar enlace manual
                      </button>
                    )}
                  </div>

                  {imagenesConContenido.length > 0 ? (
                    <div className="pfm-imagenes-grid">
                      {(formData.imagenes || []).map((img, index) => {
                        const normalizada =
                          typeof img === "string"
                            ? { url: img, tipo: "link", portada: false }
                            : img;

                        const url = normalizada?.url || "";
                        const tipo = normalizada?.tipo || "link";
                        const portada = !!normalizada?.portada;
                        const tieneContenido = String(url).trim() !== "";

                        return (
                          <div key={index} className={`pfm-imagen-card ${portada ? "is-portada" : ""}`}>
                            <button
                              type="button"
                              className="pfm-imagen-delete"
                              onClick={() => eliminarCampoImagen(index)}
                              title="Eliminar imagen"
                            >
                              ✕
                            </button>

                            <div className="pfm-imagen-preview-wrap">
                              {tieneContenido ? (
                                <img
                                  src={url}
                                  alt={`imagen-${index}`}
                                  className="pfm-imagen-preview"
                                />
                              ) : (
                                <div className="pfm-imagen-empty">Sin imagen</div>
                              )}
                            </div>

                            <div className="pfm-imagen-footer">
                              {tipo === "storage" ? (
                                <button
                                  type="button"
                                  className={`pfm-portada-btn ${portada ? "is-active" : ""}`}
                                  onClick={() => marcarImagenComoPortada(index)}
                                  title="Usar como portada"
                                >
                                  {portada ? "Portada" : "Elegir portada"}
                                </button>
                              ) : (
                                <div className="pfm-portada-placeholder">Link manual</div>
                              )}
                            </div>

                            {tipo === "link" && (
                              <div className="pfm-imagen-link-edit">
                                <input
                                  className="pfm-control"
                                  type="text"
                                  placeholder="https://..."
                                  value={url}
                                  onChange={(e) => handleImagenChange(index, e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="pfm-empty">No hay imágenes cargadas.</div>
                  )}


                </div>
              </div>

              <div className="pfm-top-right" />
            </div>

            
            {/* Campos dinámicos */}
            {Object.values(switchesActivos).some((v) => v) ? (
              <>
                <div className="pfm-dynamic">
                  {camposOrden.map((campo) => (
                    <React.Fragment key={campo}>
                      {campo === "imagenes" ? null : renderCampo(campo)}
                    </React.Fragment>
                  ))}
                </div>

                {switchesActivos.zonas && mostrarReferenciaZonas ? (
                  <div className="pfm-zonas-ref-floating">
                    {renderReferencia()}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="pfm-empty">
                ⚙️ Este producto no tiene campos configurados.
                <br />
                Editalo desde <strong>Configuración de Productos</strong>.
              </div>
            )}
          </>
        )}

        {/* Botones */}
        <div className="pfm-actions">
          <button className="pfm-btn pfm-btn-secondary" onClick={onClose} type="button">
            {modoVistaEstatica ? "Cerrar" : "Cancelar"}
          </button>

          {modoVistaEstatica ? (
            puedeEditarPedidos ? (
              <button
                className="pfm-btn pfm-btn-primary"
                type="button"
                onClick={() => setModoEdicionLocal(true)}
              >
                Editar
              </button>
            ) : null
          ) : (
            <button
              className="pfm-btn pfm-btn-primary"
              onClick={guardarProducto}
              disabled={loading || !modoEdicionLocal || !puedeEditarPedidos}
              type="button"
            >
              {loading
                ? "Guardando..."
                : productoEditando
                ? "Guardar Cambios"
                : "Guardar Producto"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
