import React, { useState, useEffect } from "react";
import "./Configuracion.css";
import { FaMoon, FaSun, FaSlidersH, FaBoxOpen, FaUserCog } from "react-icons/fa";
import ConfiguracionProductos from "./ConfiguracionProductos";

export default function Configuracion({ modoOscuro, setModoOscuro }) {
  // ✅ Leer última pestaña desde localStorage (o "general" por defecto)
  const [pestañaActiva, setPestañaActiva] = useState(
    localStorage.getItem("pestañaActivaConfig") || "general"
  );

  // ✅ Guardar la pestaña actual cada vez que cambia
  useEffect(() => {
    localStorage.setItem("pestañaActivaConfig", pestañaActiva);
  }, [pestañaActiva]);

  const toggleModoOscuro = () => {
    const nuevoModo = !modoOscuro;
    setModoOscuro(nuevoModo);
    document.body.classList.toggle("dark-mode", nuevoModo);
    localStorage.setItem("modoOscuro", nuevoModo ? "true" : "false");
  };

  return (
    <div className="config-container">
      {/* 🔹 CABECERA PRINCIPAL */}
      <header className="config-header">
        <FaSlidersH className="config-icon" />
        <h1>Configuración</h1>
      </header>

      {/* 🔹 PESTAÑAS DE NAVEGACIÓN */}
      <div className="config-tabs">
        <button
          className={`tab-btn ${pestañaActiva === "general" ? "activo" : ""}`}
          onClick={() => setPestañaActiva("general")}
        >
          <FaSlidersH /> General
        </button>
        <button
          className={`tab-btn ${pestañaActiva === "productos" ? "activo" : ""}`}
          onClick={() => setPestañaActiva("productos")}
        >
          <FaBoxOpen /> Productos
        </button>
        <button
          className={`tab-btn ${pestañaActiva === "cuenta" ? "activo" : ""}`}
          onClick={() => setPestañaActiva("cuenta")}
        >
          <FaUserCog /> Cuenta
        </button>
      </div>

      {/* 🔹 CONTENIDO DE CADA PESTAÑA */}
      <div className="config-contenido">
        {pestañaActiva === "general" && (
          <section className="config-section">
            <h2>Preferencias del sistema</h2>
            <div className="config-item">
              <span>Modo oscuro</span>
              <button
                className={`btn-modo ${modoOscuro ? "activo" : ""}`}
                onClick={toggleModoOscuro}
              >
                {modoOscuro ? <FaSun /> : <FaMoon />}
                <span>{modoOscuro ? "Modo claro" : "Modo oscuro"}</span>
              </button>
            </div>
          </section>
        )}

        {pestañaActiva === "productos" && (
          <section className="config-section">
            <h2>Configuración de productos</h2>
            <p className="config-note">
              Personalizá los productos base, sus áreas de impresión y atributos disponibles.
            </p>
            <ConfiguracionProductos />
          </section>
        )}

        {pestañaActiva === "cuenta" && (
          <section className="config-section">
            <h2>Cuenta y otros</h2>
            <p className="config-note">
              Próximamente podrás personalizar tu cuenta, idioma, notificaciones y más.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
