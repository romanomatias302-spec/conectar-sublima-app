// 🧩 ConfiguracionProductos.js
import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { FaTrashAlt, FaCog, FaPlus } from "react-icons/fa";
import "./ConfiguracionProductos.css";
import ConfiguracionProductoIndividual from "./ConfiguracionProductoIndividual";

export default function ConfiguracionProductos() {
  const [productos, setProductos] = useState([]);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  // 🔹 Cargar productos y crear base si no existen
  const cargarProductos = async () => {
    const ref = collection(db, "productosBase");
    const snapshot = await getDocs(ref);
    const lista = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (lista.length === 0) {
      await crearProductosBase();
      setMostrarOnboarding(true);
    }

    setProductos(lista);
  };

  // 🧩 Crear productos por defecto (Remera y Taza)
  const crearProductosBase = async () => {
    const ref = collection(db, "productosBase");

    const productosBase = [
      {
        nombre: "Remera",
        tipo: "textil",
        switches: {
          talles: true,
          colores: true,
          zonas: true,
          imagenes: true,
          atributosExtra: false,
        },
        zonas: {
          Frente: ["F1", "F2", "F3", "F4"],
          Espalda: ["E1", "E2"],
          Mangas: ["M1", "M2"],
        },
        talles: ["XS", "S", "M", "L", "XL", "XXL"],
      },
      {
        nombre: "Taza",
        tipo: "merchandising",
        switches: {
          talles: false,
          colores: true,
          zonas: true,
          imagenes: true,
          atributosExtra: false,
        },
        zonas: {
          General: ["Zona única de impresión"],
        },
      },
    ];

    for (const p of productosBase) {
      await addDoc(ref, p);
    }

    localStorage.setItem("productosBaseCreados", "true");
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  // 🔹 Eliminar producto
  const eliminarProducto = async (id) => {
    if (window.confirm("¿Seguro que querés eliminar este producto?")) {
      await deleteDoc(doc(db, "productosBase", id));
      cargarProductos();
    }
  };

  // 🔹 Crear nuevo producto
  const crearNuevoProducto = async () => {
    const nombre = prompt("Nombre del nuevo producto:");
    if (!nombre) return;
    const ref = collection(db, "productosBase");
    await addDoc(ref, {
      nombre,
      tipo: "personalizado",
      switches: {
        talles: false,
        colores: false,
        zonas: false,
        imagenes: false,
        atributosExtra: false,
      },
    });
    cargarProductos();
  };

  // 🔹 Abrir configuración individual
  const abrirConfiguracionProducto = (id) => {
    setProductoSeleccionado(id);
  };

  // 🔹 Volver al listado
  const volverAlListado = () => {
    setProductoSeleccionado(null);
    cargarProductos();
  };

  // 🩵 Mostrar onboarding solo si es la primera vez
  const mostrarMensajeInicial =
    mostrarOnboarding &&
    !localStorage.getItem("productosBaseCreados");

  return (
    <div className="config-productos">
      {!productoSeleccionado ? (
        <>
          <h1>Configuración de Productos</h1>

          {mostrarMensajeInicial && (
            <div className="onboarding-banner">
              <strong>💡 ¡Productos base creados!</strong>
              <p>
                Creamos automáticamente <b>Remera</b> y <b>Taza</b> para que empieces
                más rápido. Podés editarlos o agregar nuevos cuando quieras.
              </p>
            </div>
          )}

          <button className="btn-nuevo" onClick={crearNuevoProducto}>
            <FaPlus /> Nuevo producto
          </button>

          <table className="tabla-config">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Zonas</th>
                <th>Talles</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr
                  key={p.id}
                  className="fila-clickable"
                  onClick={() => abrirConfiguracionProducto(p.id)}
                >
                  <td>{p.nombre}</td>
                  <td>{p.tipo}</td>
                  <td>{Object.keys(p.zonas || {}).length}</td>
                  <td>{(p.talles || []).length}</td>
                  <td className="acciones">
                    <FaCog
                      className="icono-accion"
                      title="Configurar"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirConfiguracionProducto(p.id);
                      }}
                    />
                    <FaTrashAlt
                      className="icono-accion eliminar"
                      title="Eliminar"
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarProducto(p.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <ConfiguracionProductoIndividual
          productoId={productoSeleccionado}
          onVolver={volverAlListado}
        />
      )}
    </div>
  );
}
