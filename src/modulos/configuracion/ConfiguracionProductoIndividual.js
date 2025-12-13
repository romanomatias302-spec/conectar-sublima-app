// 🧩 ConfiguracionProductoIndividual.js
import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { FaCog, FaArrowLeft } from "react-icons/fa";
import "./ConfiguracionProductos.css";
import ZonasConfigEditor from "./ZonasConfigEditor";
import TallesConfigEditor from "./TallesConfigEditor";
import ColoresConfigEditor from "./ColoresConfigEditor";
import AtributosExtraConfigEditor from "./AtributosExtraConfigEditor";
import DetallesPorTalleConfigEditor from "./DetallesPorTalleConfigEditor";




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

        // ✅ Precarga de zonas base
        if (!data.zonas || data.zonas.length === 0) {
          if (data.nombre?.toLowerCase().includes("remera")) {
            data.zonas = [
              { grupo: "Frente", subzonas: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"] },
              { grupo: "Espalda", subzonas: ["E1", "E2", "E3", "E4"] },
              { grupo: "Mangas", subzonas: ["M1", "M2"] },
            ];
          } else if (data.nombre?.toLowerCase().includes("taza")) {
            data.zonas = [{ grupo: "Frente", subzonas: ["A1"] }];
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
          data.colores = ["Blanco", "Negro", "Rojo", "Azul", "Amarillo"];
        }

        // ✅ Precarga de switches
        if (!data.switches) {
          data.switches = {
            talles: true,
            colores: true,
            zonas: true,
            imagenes: true,
            atributosExtra: false,
          };
        }

        if (!data.imagenes) data.imagenes = [];
        if (!data.detallesPorTalle) data.detallesPorTalle = [];

        // 🔹 NUEVO: definir orden_campos si no existe
        const ordenBase = [
          "colores",
          "imagenes",
          "zonas",
          "talles",
          "detallesTalle",
          "atributosExtra",
        ];

        if (!data.orden_campos || data.orden_campos.length === 0) {
          try {
            await updateDoc(ref, { orden_campos: ordenBase });
            console.log("✅ orden_campos inicial guardado:", ordenBase);
            data.orden_campos = ordenBase;
          } catch (err) {
            console.error("Error guardando orden_campos:", err);
          }
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
  const toggleSwitch = async (campo) => {
    const nuevosSwitches = {
      ...producto.switches,
      [campo]: !producto.switches[campo],
    };
    setProducto({ ...producto, switches: nuevosSwitches });

    try {
      await updateDoc(doc(db, "productosBase", productoId), {
        switches: nuevosSwitches,
      });
    } catch (error) {
      console.error("Error al actualizar switches:", error);
    }
  };

  // 🔹 Abrir modal de configuración
  const abrirConfig = (campo) => {
    setCampoSeleccionado(campo);
    setMostrarModal(true);
  };

  // 🔹 Guardar imágenes
  const guardarImagenes = async () => {
    try {
      await updateDoc(doc(db, "productosBase", productoId), { imagenes });
      setProducto({ ...producto, imagenes });
      setMostrarModal(false);
    } catch (error) {
      console.error("Error al guardar imágenes:", error);
    }
  };

  // 🔹 Manejo de enlaces de imágenes
  const handleAddImage = () => setImagenes([...imagenes, ""]);
  const handleRemoveImage = (index) =>
    setImagenes(imagenes.filter((_, i) => i !== index));
  const handleChangeImage = (index, value) => {
    const nuevas = [...imagenes];
    nuevas[index] = value;
    setImagenes(nuevas);
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
        {Object.entries({
          talles: "Talles disponibles",
          detallesTalle: "Detalles por talle (recomendado para camisetas de futbol y egresados)",
          colores: "Colores del producto",
          zonas: "Zonas de impresión",
          imagenes: "Imágenes / Enlaces",
          atributosExtra: "Atributos adicionales",
        }).map(([key, label]) => (
          <div key={key} className="switch-fila">
            <span className="switch-label">{label}</span>
            <div className="switch-acciones">
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
        ))}
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
      onGuardar={async (nuevasZonas) => {
        try {
          await updateDoc(doc(db, "productosBase", productoId), {
            zonas: nuevasZonas,
          });
          setProducto({ ...producto, zonas: nuevasZonas });
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
    <h2>Editar imágenes / enlaces</h2>
    <p className="descripcion">
      Agregá los campos de enlaces de tus imágenes o recursos (Drive, URL directa, etc.).  
      Estas imágenes aparecerán en el formulario del pedido. Serian todas esas imagenes que tu cliente te envia y que estan relacionadas al producto.
    </p>

    {imagenes.map((img, i) => (
      <div key={i} className="imagen-item">
        <input
          type="text"
          value={img}
          placeholder="https://..."
          onChange={(e) => handleChangeImage(i, e.target.value)}
        />
        <button
          className="btn-mini-eliminar"
          onClick={() => handleRemoveImage(i)}
        >
          ✕
        </button>
      </div>
    ))}

    <button className="btn-mini-agregar" onClick={handleAddImage}>
      + Agregar imagen
    </button>

    {/* 💾 Acciones */}
    <div className="form-actions">
      <button className="cancelar" onClick={() => setMostrarModal(false)}>
        Cerrar
      </button>
      <button className="btn-guardar" onClick={guardarImagenes}>
        Guardar
      </button>
    </div>

    {/* 👁️ Vista previa */}
    <div className="preview-box">
      <h4>Vista previa (como se verá en el formulario)</h4>
      <div className="preview-imagenes">
        {imagenes.length === 0 ? (
          <p className="texto-secundario">No hay imágenes cargadas.</p>
        ) : (
          imagenes.map((img, i) => (
            <div key={i} className="preview-imagen-item">
              <img src={img} alt={`imagen-${i}`} className="preview-img" />
            </div>
          ))
        )}
      </div>
    </div>
  </>

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