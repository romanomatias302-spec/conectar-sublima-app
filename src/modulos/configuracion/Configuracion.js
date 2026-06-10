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
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebase";
import ConfiguracionUsuarios from "./ConfiguracionUsuarios";

export default function Configuracion({ modoOscuro, setModoOscuro, perfil, onActualizarPerfil, }) {
  const [pestañaActiva, setPestañaActiva] = useState(
    localStorage.getItem("pestañaActivaConfig") || "general"
  );

  const [logoUrl, setLogoUrl] = useState("");
  const [nombreVisible, setNombreVisible] = useState("");
  const [cuentaSaas, setCuentaSaas] = useState(null);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensajeConfig, setMensajeConfig] = useState("");
  const [moneda, setMoneda] = useState(perfil?.moneda || "ARS");
  
  const [guardandoMoneda, setGuardandoMoneda] = useState(false);
  const [mensajeMoneda, setMensajeMoneda] = useState("");

  const [periodosCuenta, setPeriodosCuenta] = useState([]);
  const [periodoPagando, setPeriodoPagando] = useState(null);
  const URL_CREAR_PREFERENCIA_MP =
  "https://us-central1-conectarsublimados-7881e.cloudfunctions.net/crearPreferenciaMercadoPago";

  const MONEDAS_CONFIG = {
    ARS: { moneda: "ARS", localeMoneda: "es-AR", label: "ARS - Peso argentino" },
      COP: {
      moneda: "COP",
      localeMoneda: "es-CO",
      label: "COP - Peso colombiano"
    },
    PEN: { moneda: "PEN", localeMoneda: "es-PE", label: "PEN - Sol peruano" },
    CLP: { moneda: "CLP", localeMoneda: "es-CL", label: "CLP - Peso chileno" },
    MXN: { moneda: "MXN", localeMoneda: "es-MX", label: "MXN - Peso mexicano" },
    USD: { moneda: "USD", localeMoneda: "en-US", label: "USD - Dólar estadounidense" },
  };
  

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
          setCuentaSaas({
            planNombre: data.planNombre || data.plan || "Sin plan",
            estadoSuscripcion: data.estadoSuscripcion || data.estado || "activo",
            fechaVencimiento: data.fechaVencimiento || data.fechaProximoCargo || "",
            planPrecio: data.planPrecio || data.mantenimientoMensual || 0,
            saldoCuentaCorriente: data.saldoCuentaCorriente || 0,
            moneda: data.moneda || "ARS",
            ultimoPago: data.ultimoPago || "",
            pais: data.pais || "-",
            metodoCobro: data.metodoCobro || "manual",
            suspendidoPorSistema: data.suspendidoPorSistema || false,
            suspendidoManual: data.suspendidoManual || false,
          });

          const pagosRef = collection(db, "saas_pagos");
          const pagosQuery = query(
            pagosRef,
            where("clienteSaasId", "==", perfil.clienteId)
          );

          const pagosSnap = await getDocs(pagosQuery);

          const movimientos = pagosSnap.docs.map((docu) => ({
            id: docu.id,
            ...docu.data(),
          }));

          const periodos = Object.values(
            movimientos
              .filter((mov) => mov.anulado !== true && mov.periodoFacturado)
              .reduce((acc, mov) => {
                const periodo = mov.periodoFacturado;
                const monto = Number(mov.monto || 0);
                const tipo = mov.tipoMovimiento || "pago";

                if (!acc[periodo]) {
                  acc[periodo] = {
                    periodo,
                    cargos: 0,
                    pagos: 0,
                    saldo: 0,
                    fechaVencimiento: mov.fechaVencimiento || "",
                  };
                }

                if (tipo === "cargo" || tipo === "ajuste") {
                  acc[periodo].cargos += monto;
                  acc[periodo].fechaVencimiento =
                    mov.fechaVencimiento || acc[periodo].fechaVencimiento;
                }

                if (tipo === "pago" || tipo === "credito") {
                  acc[periodo].pagos += monto;
                }

                acc[periodo].saldo = acc[periodo].cargos - acc[periodo].pagos;

                return acc;
              }, {})
          ).sort((a, b) => (a.periodo < b.periodo ? 1 : -1));

          setPeriodosCuenta(periodos);

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

  const guardarConfiguracionMoneda = async () => {
    try {
      if (!perfil?.clienteId) {
        setMensajeMoneda("No se encontró clienteId del tenant.");
        return;
      }

      setGuardandoMoneda(true);
      setMensajeMoneda("");

      const configSeleccionada = MONEDAS_CONFIG[moneda] || MONEDAS_CONFIG.ARS;

      const ref = doc(db, "clientes-saas", perfil.clienteId);

      await updateDoc(ref, {
        moneda: configSeleccionada.moneda,
        localeMoneda: configSeleccionada.localeMoneda,
      });

      if (onActualizarPerfil) {
        onActualizarPerfil({
          moneda: configSeleccionada.moneda,
          localeMoneda: configSeleccionada.localeMoneda,
        });
      }

      setMensajeMoneda("Configuración de moneda guardada correctamente.");
    } catch (error) {
      console.error("Error guardando moneda:", error);
      setMensajeMoneda("No se pudo guardar la configuración de moneda.");
    } finally {
      setGuardandoMoneda(false);
    }
  };

  const formatearMonedaCuenta = (valor, monedaActual = "ARS") => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: monedaActual || "ARS",
    minimumFractionDigits: 0,
  }).format(Number(valor || 0));
};

const thCuenta = {
  textAlign: "left",
  padding: "12px",
  background: "#0796c9",
  color: "#fff",
};

const tdCuenta = {
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const pagarPeriodoMercadoPago = async (periodo) => {
  try {
    if (!periodo?.periodo || Number(periodo?.saldo || 0) <= 0) {
      alert("Este período no tiene saldo pendiente.");
      return;
    }

    if (periodoPagando === periodo.periodo) return;

    setPeriodoPagando(periodo.periodo);

    const response = await fetch(URL_CREAR_PREFERENCIA_MP, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clienteSaasId: perfil.clienteId,
        periodoFacturado: periodo.periodo,
        monto: Number(periodo.saldo || 0),
      }),
    });

    const data = await response.json();

    const urlPago = data.sandbox_init_point || data.init_point;

    if (!urlPago) {
      throw new Error("No se recibió URL de pago");
    }

    window.location.href = urlPago;
  } catch (error) {
    console.error(error);
    alert("No se pudo iniciar el pago.");
    setPeriodoPagando(null);
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
          className={`tab-btn ${pestañaActiva === "usuarios" ? "activo" : ""}`}
          onClick={() => setPestañaActiva("usuarios")}
        >
          <FaUserCog /> Usuarios
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

            <div className="container-secundaria" style={{ marginTop: "20px" }}>
              <h3>Moneda del sistema</h3>

              <div style={{ display: "grid", gap: "14px", maxWidth: "420px" }}>
                <div>
                  <label>Moneda</label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value)}
                  >
                    {Object.values(MONEDAS_CONFIG).map((item) => (
                      <option key={item.moneda} value={item.moneda}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={guardarConfiguracionMoneda}
                  disabled={guardandoMoneda}
                  style={{ width: "fit-content" }}
                >
                  {guardandoMoneda ? "Guardando..." : "Guardar moneda"}
                </button>

                <p style={{ margin: 0, color: "#666" }}>
                  El formato regional se ajusta automáticamente según la moneda elegida.
                </p>

                {mensajeMoneda && (
                  <p style={{ margin: 0, color: "#666" }}>{mensajeMoneda}</p>
                )}
              </div>
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

        {pestañaActiva === "usuarios" && (
        <section className="config-section">
          <h2>Usuarios</h2>
          <p className="config-note">
            Invitá y administrá los accesos del equipo.
          </p>
          <ConfiguracionUsuarios perfil={perfil} />
        </section>
      )}

      {pestañaActiva === "cuenta" && (
        <section className="config-section">
          <h2>Cuenta</h2>
          <p className="config-note">
            Consultá el estado de tu suscripción, períodos facturados y pagos registrados.
          </p>

          {!cuentaSaas ? (
            <p>Cargando información de cuenta...</p>
          ) : (
            <>
              <div
                className="container-secundaria"
                style={{
                  marginBottom: 20,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <strong>Plan actual</strong>
                  <p>{cuentaSaas.planNombre}</p>
                </div>

                <div>
                  <strong>Estado</strong>
                  <p>
                    {cuentaSaas.suspendidoManual || cuentaSaas.suspendidoPorSistema
                      ? "Suspendido"
                      : "Activo"}
                  </p>
                </div>





                <div>
                  <strong>Saldo total</strong>
                  <p
                    style={{
                      color:
                        Number(cuentaSaas.saldoCuentaCorriente || 0) > 0
                          ? "#dc2626"
                          : Number(cuentaSaas.saldoCuentaCorriente || 0) < 0
                          ? "#2563eb"
                          : "#16a34a",
                      fontWeight: 800,
                    }}
                  >
                    {Number(cuentaSaas.saldoCuentaCorriente || 0) > 0
                      ? `Debe ${formatearMonedaCuenta(
                          cuentaSaas.saldoCuentaCorriente,
                          cuentaSaas.moneda
                        )}`
                      : Number(cuentaSaas.saldoCuentaCorriente || 0) < 0
                      ? `A favor ${formatearMonedaCuenta(
                          Math.abs(cuentaSaas.saldoCuentaCorriente),
                          cuentaSaas.moneda
                        )}`
                      : "Al día"}
                  </p>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <h3>Períodos facturados</h3>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thCuenta}>Período</th>
                      <th style={thCuenta}>Cargo</th>
                      <th style={thCuenta}>Pagado</th>
                      <th style={thCuenta}>Saldo</th>
                      <th style={thCuenta}>Vencimiento</th>
                      <th style={thCuenta}>Estado</th>
                      <th style={thCuenta}>Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {periodosCuenta.map((p) => (
                      <tr key={p.periodo}>
                        <td style={tdCuenta}>{p.periodo}</td>
                        <td style={tdCuenta}>
                          {formatearMonedaCuenta(p.cargos, cuentaSaas.moneda)}
                        </td>
                        <td style={tdCuenta}>
                          {formatearMonedaCuenta(p.pagos, cuentaSaas.moneda)}
                        </td>
                        <td style={tdCuenta}>
                          {formatearMonedaCuenta(p.saldo, cuentaSaas.moneda)}
                        </td>
                        <td style={tdCuenta}>{p.fechaVencimiento || "-"}</td>
                        <td style={tdCuenta}>
                          <strong
                            style={{
                              color: p.saldo > 0 ? "#dc2626" : "#16a34a",
                            }}
                          >
                            {p.saldo > 0 ? "Pendiente" : "Pagado"}
                          </strong>
                        </td>
                        <td style={tdCuenta}>
                          {p.saldo > 0 ? (
                        <button
                          className="btn-primary"
                          disabled={periodoPagando === p.periodo}
                          onClick={() => {
                            if (Number(p.saldo || 0) <= 0) {
                              alert("Este período ya está pagado.");
                              return;
                            }

                            if (cuentaSaas.metodoCobro === "mercadopago") {
                              pagarPeriodoMercadoPago(p);
                              return;
                            }

                            alert(
                              "Para informar el pago, comunicate con el administrador indicando el período " +
                                p.periodo +
                                " y el importe " +
                                formatearMonedaCuenta(p.saldo, cuentaSaas.moneda)
                            );
                          }}
                        >
                          {periodoPagando === p.periodo
                            ? "Procesando..."
                            : cuentaSaas.metodoCobro === "mercadopago"
                            ? "Pagar con Mercado Pago"
                            : "Informar pago"}
                        </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}

                    {periodosCuenta.length === 0 && (
                      <tr>
                        <td style={tdCuenta} colSpan="7">
                          Todavía no hay períodos facturados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      </div>
    </div>
  );
}