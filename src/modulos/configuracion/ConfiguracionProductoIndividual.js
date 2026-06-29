// 🧩 ConfiguracionProductoIndividual.js
import React, { useState, useEffect } from "react";
import { db, storage } from "../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { FaCog, FaArrowLeft, FaArrowUp, FaArrowDown } from "react-icons/fa";
import "./ConfiguracionProductos.css";
import ZonasConfigEditor from "./ZonasConfigEditor";
import TallesConfigEditor from "./TallesConfigEditor";
import ColoresConfigEditor from "./ColoresConfigEditor";
import AtributosExtraConfigEditor from "./AtributosExtraConfigEditor";
import DetallesPorTalleConfigEditor from "./DetallesPorTalleConfigEditor";
import DetallesCosturaConfigEditor from "./DetallesCosturaConfigEditor";





export default function ConfiguracionProductoIndividual({ productoId, onVolver }) {
  const [producto, setProducto] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [campoSeleccionado, setCampoSeleccionado] = useState(null);
  const [imagenes, setImagenes] = useState([]);
  const [tipoArea, setTipoArea] = useState("multiple"); // 🆕 tipo de área

  // 🔹 Cargar configuración del producto
  // 🔹 Cargar configuración del producto
useEffect(() => {
  const cargarProducto = async () => {
    try {
      const ref = doc(db, "productosBase", productoId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        let data = snap.data();

        // ✅ Precarga de zonas base (FORMATO OBJETO)
const zonasVacias =
  !data.zonas ||
  (Array.isArray(data.zonas) && data.zonas.length === 0) ||
  (typeof data.zonas === "object" && !Array.isArray(data.zonas) && Object.keys(data.zonas).length === 0);

if (zonasVacias) {
  const nombre = (data.nombre || "").toLowerCase();

  if (nombre.includes("remera")) {
    data.zonas = {
      Frente: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"],
      Espalda: ["E1", "E2", "E3", "E4"],
      Mangas: ["M1", "M2"],
    };
  } else if (nombre.includes("taza")) {
    data.zonas = {
      General: ["Zona única"],
    };
  }
}


        // ✅ Precarga de talles base
        if (!data.talles || data.talles.length === 0) {
          data.talles = [
            "XS", "S", "M", "L", "XL", "XXL",
            "S Mujer", "M Mujer", "L Mujer", "XL Mujer", "XXL Mujer",
            "T4", "T6", "T8", "T10", "T12", "T14", "T16"
          ];
        }

        // ✅ Precarga de colores base
        if (!data.colores || data.colores.length === 0) {
          data.colores = [
            { nombre: "Blanco", codigo: "#FFFFFF" },
            { nombre: "Negro", codigo: "#000000" },
            { nombre: "Rojo", codigo: "#FF0000" },
            { nombre: "Azul", codigo: "#0000FF" },
            { nombre: "Amarillo", codigo: "#FFFF00" },
          ];
        }

       
        // ✅ Precarga / merge de switches
        data.switches = {
          talles: true,
          colores: true,
          zonas: true,
          imagenes: true,
          atributosExtra: false,
          detallesCostura: false,
          ...(data.switches || {}),
        };

        if (!data.imagenes) data.imagenes = [];

          // 🔹 Normalizar formato viejo → nuevo
          data.imagenes = data.imagenes.map((img) => {
            if (typeof img === "string") {
              return { url: img, tipo: "link" };
            }
            return img;
          });
        if (!data.detallesPorTalle) data.detallesPorTalle = [];

        // 🔹 NUEVO: definir orden_campos si no existe
        const ordenBase = [
          "colores",
          "imagenes",
          "zonas",
          "talles",
          "detallesTalle",
          "detallesCostura",
          "atributosExtra",
        ];

        if (!data.detallesCostura) data.detallesCostura = [];

        const ordenActual = Array.isArray(data.orden_campos) ? data.orden_campos : [];
        const ordenCompleto = [
          ...ordenActual,
          ...ordenBase.filter((campo) => !ordenActual.includes(campo)),
        ];

        if (
          !data.orden_campos ||
          data.orden_campos.length === 0 ||
          ordenCompleto.length !== ordenActual.length
        ) {
          try {
            await updateDoc(ref, { orden_campos: ordenCompleto });
            console.log("✅ orden_campos actualizado:", ordenCompleto);
            data.orden_campos = ordenCompleto;
          } catch (err) {
            console.error("Error guardando orden_campos:", err);
          }
        } else {
          data.orden_campos = ordenActual;
        }

        // 🔹 Seteamos el estado del producto
        setProducto({ ...data });
        setImagenes(data.imagenes);
        setTipoArea(data.tipoArea || "multiple");
      }
    } catch (error) {
      console.error("Error al cargar producto:", error);
    }
  };
  cargarProducto();
}, [productoId]);

if (!producto) return <p>Cargando producto...</p>;


  // 🔹 Alternar switches
 const getZonasDefaultProducto = (nombre = "") => {
  const nombreLower = (nombre || "").toLowerCase();

  if (nombreLower.includes("taza") || nombreLower.includes("gorra")) {
    return {
      General: ["Zona única"],
    };
  }

  return {
    Frente: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"],
    Espalda: ["E1", "E2", "E3", "E4"],
    Mangas: ["M1", "M2"],
  };
};

const hayValorConfig = (valor) => {
  if (!valor) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === "object") return Object.keys(valor).length > 0;
  return true;
};

const toggleSwitch = async (campo) => {
  const estabaActivo = !!producto.switches?.[campo];
  const nuevoActivo = !estabaActivo;

  const nuevosSwitches = {
    ...producto.switches,
    [campo]: nuevoActivo,
  };

  const payload = {
    switches: nuevosSwitches,
  };

  const productoActualizado = {
    ...producto,
    switches: nuevosSwitches,
  };

  if (nuevoActivo) {
    if (campo === "zonas" && !hayValorConfig(producto.zonas)) {
      const zonasDefault = getZonasDefaultProducto(producto.nombre);

      payload.zonas = zonasDefault;
      payload.tipoArea =
        Object.keys(zonasDefault).length === 1 ? "unica" : "multiple";

      productoActualizado.zonas = zonasDefault;
      productoActualizado.tipoArea = payload.tipoArea;
    }

    if (campo === "talles" && !hayValorConfig(producto.talles)) {
      const tallesDefault = [
        "XS", "S", "M", "L", "XL", "XXL",
        "S Mujer", "M Mujer", "L Mujer", "XL Mujer", "XXL Mujer",
        "T4", "T6", "T8", "T10", "T12", "T14", "T16",
      ];

      payload.talles = tallesDefault;
      productoActualizado.talles = tallesDefault;
    }

    if (campo === "colores") {
      const coloresDefault = [
        { nombre: "Blanco", codigo: "#FFFFFF" },
        { nombre: "Negro", codigo: "#000000" },
        { nombre: "Rojo", codigo: "#FF0000" },
        { nombre: "Azul", codigo: "#0000FF" },
        { nombre: "Amarillo", codigo: "#FFFF00" },
      ];

      if (!hayValorConfig(producto.colores)) {
        payload.colores = coloresDefault;
        productoActualizado.colores = coloresDefault;
      } else {
        payload.colores = producto.colores;
        productoActualizado.colores = producto.colores;
      }
    }

    if (campo === "detallesCostura" && !hayValorConfig(producto.detallesCostura)) {
      const detallesDefault = [
        { nombre: "Cuello" },
        { nombre: "Mangas" },
        { nombre: "Hilos" },
      ];

      payload.detallesCostura = detallesDefault;
      productoActualizado.detallesCostura = detallesDefault;
    }

if (campo === "atributosExtra" && !hayValorConfig(producto.atributosExtra)) {
  const atributosDefault = [
    {
      id: crypto.randomUUID(),
      nombre: "Nuevo atributo",
      tipo: "texto",
      obligatorio: false,
      opciones: [],
    },
  ];

  payload.atributosExtra = atributosDefault;
  productoActualizado.atributosExtra = atributosDefault;
}
  }

  setProducto(productoActualizado);

  try {
    await updateDoc(doc(db, "productosBase", productoId), payload);
  } catch (error) {
    console.error("Error al actualizar switches:", error);
  }
};

  // 🔹 Abrir modal de configuración
  const abrirConfig = (campo) => {
    setCampoSeleccionado(campo);
    setMostrarModal(true);
  };

 


  const CAMPOS_CONFIG = {
  talles: "Talles disponibles",
  detallesTalle: "Detalles por talle (recomendado para camisetas de futbol y egresados)",
  colores: "Colores del producto",
  zonas: "Zonas de impresión",
  imagenes: "Imágenes / Enlaces",
  detallesCostura: "Detalles de costura",
  atributosExtra: "Atributos adicionales",
};

const camposOrdenados = (producto.orden_campos || Object.keys(CAMPOS_CONFIG))
  .filter((key) => CAMPOS_CONFIG[key]);

const moverCampo = async (index, direccion) => {
  const nuevoIndex = index + direccion;
  if (nuevoIndex < 0 || nuevoIndex >= camposOrdenados.length) return;

  const nuevoOrden = [...camposOrdenados];
  const [movido] = nuevoOrden.splice(index, 1);
  nuevoOrden.splice(nuevoIndex, 0, movido);

  setProducto((prev) => ({
    ...prev,
    orden_campos: nuevoOrden,
  }));

  try {
    await updateDoc(doc(db, "productosBase", productoId), {
      orden_campos: nuevoOrden,
    });
  } catch (error) {
    console.error("Error guardando orden de campos:", error);
  }
};


  // ===================================================
  //   🧠 RENDER
  // ===================================================
  return (
    <div className="config-productos">
      <button className="btn-volver" onClick={onVolver}>
        <FaArrowLeft /> Volver
      </button>

      <h1>Configuración de {producto.nombre}</h1>
      <p className="descripcion">
        Activá o desactivá los campos disponibles para este producto y editá su contenido individual.
      </p>

      

       
        

      {/* 🔹 Lista de switches */}
      <div className="switch-lista">
        {camposOrdenados.map((key, index) => {
          const label = CAMPOS_CONFIG[key];

          return (
          <div key={key} className="switch-fila">
            <span className="switch-label">{label}</span>
            <div className="switch-acciones">
              <div className="switch-orden-group">
              <button
                type="button"
                className="btn-switch-orden"
                onClick={() => moverCampo(index, -1)}
                disabled={index === 0}
                title="Subir"
              >
                <FaArrowUp />
              </button>

              <button
                type="button"
                className="btn-switch-orden"
                onClick={() => moverCampo(index, 1)}
                disabled={index === camposOrdenados.length - 1}
                title="Bajar"
              >
                <FaArrowDown />
              </button>
                </div>
              <FaCog
                className="icono-config"
                title="Configurar"
                onClick={() => abrirConfig(key)}
              />
              <label className="switch">
                <input
                  type="checkbox"
                  checked={producto.switches?.[key] || false}
                  onChange={() => toggleSwitch(key)}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
          );
        })}
      </div>

      {/* 🔹 Modal de configuración */}
      {mostrarModal && (
        <div className="modal-overlay" onClick={() => setMostrarModal(false)}>
          <div
            className="modal-content modal-config scrollable-modal"
            onClick={(e) => e.stopPropagation()}
          >
           {campoSeleccionado === "zonas" ? (
  <>
    

<ZonasConfigEditor
  zonasIniciales={producto.zonas}
  productoNombre={producto.nombre}
  tipoAreaInicial={producto.tipoArea || ""}
  imagenReferenciaPersonalizadaInicial={producto.imagenReferenciaPersonalizada || ""}
  onGuardar={async ({ zonas, tipoArea, imagenReferenciaPersonalizada }) => {
    try {
      await updateDoc(doc(db, "productosBase", productoId), {
        zonas,
        tipoArea,
        imagenReferenciaPersonalizada: imagenReferenciaPersonalizada || "",
      });

      setProducto((prev) => ({
        ...prev,
        zonas,
        tipoArea,
        imagenReferenciaPersonalizada: imagenReferenciaPersonalizada || "",
      }));

      setTipoArea(tipoArea);
    } catch (error) {
      console.error("Error al guardar zonas:", error);
    }
  }}
  onCerrar={() => setMostrarModal(false)}
/>

  </>
    ) : campoSeleccionado === "talles" ? (
              <TallesConfigEditor
                tallesIniciales={producto.talles || []}
                onGuardar={async (nuevosTalles) => {
                  try {
                    await updateDoc(doc(db, "productosBase", productoId), {
                      talles: nuevosTalles,
                    });
                    setProducto({ ...producto, talles: nuevosTalles });
                  } catch (error) {
                    console.error("Error al guardar talles:", error);
                  }
                }}
                onCerrar={() => setMostrarModal(false)}
              />
              ) : campoSeleccionado === "detallesTalle" ? (
                       <DetallesPorTalleConfigEditor
                        talles={producto.talles || []}
                         detallesIniciales={producto.detallesTalle || []}
                         onGuardar={async (nuevosDetalles) => {
                   try {
                     await updateDoc(doc(db, "productosBase", productoId), {
                     detallesTalle: nuevosDetalles,
                    });
                    setProducto({ ...producto, detallesTalle: nuevosDetalles });
                   } catch (error) {
                   console.error("Error al guardar detalles por talle:", error);
                   }
                  }}
                  onCerrar={() => setMostrarModal(false)}
                />

            ) : campoSeleccionado === "colores" ? (
              <ColoresConfigEditor
                coloresIniciales={producto.colores || []}
                onGuardar={async (nuevosColores) => {
                  try {
                    await updateDoc(doc(db, "productosBase", productoId), {
                      colores: nuevosColores,
                    });
                    setProducto({ ...producto, colores: nuevosColores });
                  } catch (error) {
                    console.error("Error al guardar colores:", error);
                  }
                }}
                onCerrar={() => setMostrarModal(false)}
              />
) : campoSeleccionado === "imagenes" ? (
  <>
    <h2>Imágenes del producto</h2>
    <p className="descripcion">
      Este switch habilita la carga de imágenes desde el formulario del producto dentro del pedido.
      No se configuran imágenes acá.
    </p>

    <div className="preview-box">
      <h4>Cómo funciona</h4>
      <p className="texto-secundario" style={{ marginBottom: "10px" }}>
        Cuando este campo esté habilitado, al cargar o editar un producto dentro del pedido
        se mostrará la sección para adjuntar imágenes.
      </p>


    </div>

    <div className="form-actions">
      <button className="cancelar" onClick={() => setMostrarModal(false)}>
        Cerrar
      </button>
    </div>
  </>

  ) : campoSeleccionado === "detallesCostura" ? (
  <DetallesCosturaConfigEditor
    detallesIniciales={producto.detallesCostura || []}
    onGuardar={async (nuevosDetalles) => {
      try {
        await updateDoc(doc(db, "productosBase", productoId), {
          detallesCostura: nuevosDetalles,
        });
        setProducto({ ...producto, detallesCostura: nuevosDetalles });
      } catch (error) {
        console.error("Error al guardar detalles de costura:", error);
      }
    }}
    onCerrar={() => setMostrarModal(false)}
  />

   ): campoSeleccionado === "atributosExtra" ? (
  <AtributosExtraConfigEditor
    atributosIniciales={producto.atributosExtra || []}
    onGuardar={async (nuevosAtributos) => {
      try {
        await updateDoc(doc(db, "productosBase", productoId), {
          atributosExtra: nuevosAtributos,
        });
        setProducto({ ...producto, atributosExtra: nuevosAtributos });
      } catch (error) {
        console.error("Error al guardar atributos:", error);
      }
    }}
    onCerrar={() => setMostrarModal(false)}
              />
            ) : (
              <>
                <h2>Configurar {campoSeleccionado}</h2>
                <p>Acá podrás editar las listas o valores asociados.</p>
                <div className="form-actions">
                  <button className="cancelar" onClick={() => setMostrarModal(false)}>
                    Cerrar
                  </button>
                  <button className="btn-guardar">Guardar Cambios</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}