import React, { useEffect, useState } from "react";
import "./Configuracion.css";
import {
  FaMoon,
  FaSun,
  FaSlidersH,
  FaBoxOpen,
  FaUserCog,
} from "react-icons/fa";
import ConfiguracionProductos from "./ConfiguracionProductos";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

export default function Configuracion({ modoOscuro, setModoOscuro, perfil }) {
  const [pestañaActiva, setPestañaActiva] = useState(
    localStorage.getItem("pestañaActivaConfig") || "general"
  );

  const [logoUrl, setLogoUrl] = useState("");
  const [nombreVisible, setNombreVisible] = useState("");
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState("");

  useEffect(() => {
    localStorage.setItem("pestañaActivaConfig", pestañaActiva);
  }, [pestañaActiva]);

  useEffect(() => {
    const cargarConfigCliente = async () => {
      try {
        if (!perfil?.clienteId || perfil?.rol === "superadmin") return;

        const ref = doc(db, "clientes-saas", perfil.clienteId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setLogoUrl(data.logoUrl || "");
          setNombreVisible(data.nombreVisible || data.nombre || "");
        }
      } catch (error) {
        console.error("Error al cargar configuración del cliente:", error);
      }
    };

    cargarConfigCliente();
  }, [perfil]);

  const toggleModoOscuro = () => {
    const nuevoModo = !modoOscuro;
    setModoOscuro(nuevoModo);
    document.body.classList.toggle("dark-mode", nuevoModo);
    localStorage.setItem("modoOscuro", nuevoModo ? "true" : "false");
  };

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMensajeConfig("Seleccioná un archivo de imagen válido.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const guardarConfigCliente = async () => {
    try {
      if (!perfil?.clienteId) return;

      setGuardandoConfig(true);
      setMensajeConfig("");

      const ref = doc(db, "clientes-saas", perfil.clienteId);
      await updateDoc(ref, {
        logoUrl,
        nombreVisible,
      });

      setMensajeConfig("Configuración guardada correctamente.");
    } catch (error) {
      console.error("Error al guardar configuración:", error);
      setMensajeConfig("No se pudo guardar la configuración.");
    } finally {
      setGuardandoConfig(false);
    }
  };

  return (
    <div className="config-container">
      <header className="config-header">
        <FaSlidersH className="config-icon" />
        <h1>Configuración</h1>
      </header>

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

            {perfil?.rol !== "superadmin" && (
              <div
                className="config-item"
                style={{
                  marginTop: "24px",
                  alignItems: "flex-start",
                  flexDirection: "column",
                }}
              >
                <span style={{ marginBottom: "10px", fontWeight: 600 }}>
                  Nombre visible del cliente
                </span>

                <input
                  type="text"
                  placeholder="Ej: El Gol Camisetas"
                  value={nombreVisible}
                  onChange={(e) => setNombreVisible(e.target.value)}
                />

                <span style={{ marginBottom: "10px", fontWeight: 600 }}>
                  Logo del cliente
                </span>

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFile}
                />

                {logoUrl && (
                  <div style={{ margin: "12px 0" }}>
                    <img
                      src={logoUrl}
                      alt="Preview logo"
                      style={{
                        width: "80px",
                        height: "80px",
                        objectFit: "cover",
                        borderRadius: "12px",
                        border: "1px solid #ddd",
                      }}
                    />
                  </div>
                )}

                <button
                  className="btn-primary"
                  onClick={guardarConfigCliente}
                  disabled={guardandoConfig}
                >
                  {guardandoConfig ? "Guardando..." : "Guardar cambios"}
                </button>

                {mensajeConfig && (
                  <p style={{ marginTop: "10px", color: "#64748b" }}>
                    {mensajeConfig}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {pestañaActiva === "productos" && (
          <section className="config-section">
            <h2>Configuración de productos</h2>
            <p className="config-note">
              Personalizá los productos base, sus áreas de impresión y atributos disponibles.
            </p>
            <ConfiguracionProductos perfil={perfil} />
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