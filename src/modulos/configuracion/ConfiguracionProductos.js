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
  query,
  where,
} from "firebase/firestore";
import { FaTrashAlt, FaCog, FaPlus } from "react-icons/fa";
import "./ConfiguracionProductos.css";
import ConfiguracionProductoIndividual from "./ConfiguracionProductoIndividual";
import ActionMenu from "../../comunes/componentes/ActionMenu";

export default function ConfiguracionProductos({ perfil }) {
  const [productos, setProductos] = useState([]);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  // 🔹 Cargar productos y crear base si no existen
  const cargarProductos = async () => {
    try {
      if (!perfil) return;

      const ref = collection(db, "productosBase");

      const q =
        perfil.rol === "superadmin"
          ? query(ref)
          : query(ref, where("clienteId", "==", perfil.clienteId));

      const snapshot = await getDocs(q);
      let lista = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (perfil.rol !== "superadmin" && lista.length === 0) {
        await crearProductosBase();

        const snapshotRecargado = await getDocs(
          query(ref, where("clienteId", "==", perfil.clienteId))
        );

        lista = snapshotRecargado.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        if (lista.length > 0) {
          setMostrarOnboarding(true);
        }
      }

      setProductos(lista);
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  };

  // 🧩 Crear productos por defecto (Remera y Taza)
  const crearProductosBase = async () => {
    try {
      if (!perfil?.clienteId) return;

      const ref = collection(db, "productosBase");

      const existentesSnap = await getDocs(
        query(ref, where("clienteId", "==", perfil.clienteId))
      );

      const nombresExistentes = existentesSnap.docs.map((d) =>
        (d.data().nombre || "").trim().toLowerCase()
      );

      const productosBase = [
        {
          nombre: "Remera",
          tipo: "textil",
          clienteId: perfil.clienteId,
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
          clienteId: perfil.clienteId,
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
        const nombreNormalizado = p.nombre.trim().toLowerCase();

        if (!nombresExistentes.includes(nombreNormalizado)) {
          await addDoc(ref, p);
        }
      }

      localStorage.setItem(`productosBaseCreados_${perfil.clienteId}`, "true");
    } catch (error) {
      console.error("Error al crear productos base:", error);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, [perfil]);

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

    if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
      alert("No se encontró el clienteId del usuario.");
      return;
    }

    const ref = collection(db, "productosBase");

    await addDoc(ref, {
      nombre,
      tipo: "personalizado",
      clienteId: perfil?.clienteId || "",
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
  const mostrarMensajeInicial = mostrarOnboarding;

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
                <th style={{textAlign:"right"}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>

                  <td style={{textAlign:"right"}}>
                    <ActionMenu
                      onEditar={() => abrirConfiguracionProducto(p.id)}
                      onEliminar={() => eliminarProducto(p.id)}
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
