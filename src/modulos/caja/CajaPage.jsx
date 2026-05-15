import React, { useEffect, useMemo, useState } from "react";
import {
  abrirCaja,
  cerrarCaja,
  crearMovimientoManualCaja,
  fechaHoyInput,
  obtenerCajaDelDia,
  obtenerMovimientosCajaDia,
  obtenerUltimaCajaCerradaAnterior,
  reabrirCaja,
} from "../../firebase/cajas";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";

function formatearFechaCaja(fechaISO) {
  if (!fechaISO) return "-";
  const [yyyy, mm, dd] = fechaISO.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

export default function CajaPage({ perfil }) {
  const fechaCaja = fechaHoyInput();

  const [caja, setCaja] = useState(null);
  const [cajaAnterior, setCajaAnterior] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const [saldoApertura, setSaldoApertura] = useState(0);
  const [saldoCierreReal, setSaldoCierreReal] = useState("");

  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [tipoManual, setTipoManual] = useState("egreso");
  const [subtipoManual, setSubtipoManual] = useState("gasto_caja");
  const [montoManual, setMontoManual] = useState("");
  const [descripcionManual, setDescripcionManual] = useState("");
  const [mostrarResumen, setMostrarResumen] = useState(false);

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);


  const cargarCaja = async () => {
    try {
      setLoading(true);
      setError("");

      const [cajaData, anteriorData] = await Promise.all([
        obtenerCajaDelDia({ perfil, fechaCaja }),
        obtenerUltimaCajaCerradaAnterior({ perfil, fechaCaja }),
      ]);

      setCaja(cajaData);
      setCajaAnterior(anteriorData);

      if (cajaData) {
        const movs = await obtenerMovimientosCajaDia({ perfil, fechaCaja });
        setMovimientos(movs);
      } else {
        setMovimientos([]);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar la caja.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!perfil) return;
    cargarCaja();
  }, [perfil]);

  const resumen = useMemo(() => {
    const activos = movimientos.filter(
      (m) => (m.estadoMovimiento || "activo") === "activo"
    );

    const totalPorMedio = {
      efectivo: 0,
      transferencia: 0,
      mp: 0,
      debito: 0,
      credito: 0,
      otro: 0,
    };

    activos.forEach((m) => {
      const medio = totalPorMedio[m.medioPago] !== undefined ? m.medioPago : "otro";
      const monto = Number(m.monto || 0);

      if (m.tipo === "ingreso") totalPorMedio[medio] += monto;
      if (m.tipo === "egreso") totalPorMedio[medio] -= monto;
    });

    const ingresosEfectivo = activos
      .filter((m) => m.tipo === "ingreso" && m.medioPago === "efectivo")
      .reduce((acc, m) => acc + Number(m.monto || 0), 0);

    const egresosEfectivo = activos
      .filter((m) => m.tipo === "egreso" && m.medioPago === "efectivo")
      .reduce((acc, m) => acc + Number(m.monto || 0), 0);

    const efectivoEsperado =
      Number(caja?.saldoAperturaEfectivo || 0) + ingresosEfectivo - egresosEfectivo;

    return {
      activos,
      totalPorMedio,
      ingresosEfectivo,
      egresosEfectivo,
      efectivoEsperado,
    };
  }, [movimientos, caja]);

  const aperturaReferencia = Number(
    caja?.saldoCierreAnteriorEfectivo ??
      cajaAnterior?.saldoCierreRealEfectivo ??
      0
  );

  const aperturaActual = caja
    ? Number(caja.saldoAperturaEfectivo || 0)
    : Number(saldoApertura || 0);

  const diferenciaApertura = caja
    ? Number(caja.diferenciaAperturaEfectivo || 0)
    : aperturaActual - aperturaReferencia;

  const estaAbierta = caja?.estado === "abierta";
  const estaCerrada = caja?.estado === "cerrada";

  const handleAbrirCaja = async () => {
    try {
      setError("");
      setExito("");

      await abrirCaja({
        perfil,
        fechaCaja,
        saldoAperturaEfectivo: Number(saldoApertura || 0),
        cajaAnterior,
      });

      await cargarCaja();
      setExito("Caja abierta correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo abrir la caja.");
    }
  };

  const handleCrearMovimientoManual = async () => {
    try {
      setError("");
      setExito("");

      await crearMovimientoManualCaja({
        perfil,
        caja,
        tipo: tipoManual,
        subtipo: subtipoManual,
        medioPago: "efectivo",
        monto: Number(montoManual || 0),
        descripcion: descripcionManual,
      });

      setModalMovimiento(false);
      setMontoManual("");
      setDescripcionManual("");
      await cargarCaja();
      setExito("Movimiento cargado correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar el movimiento.");
    }
  };

  const handleCerrarCaja = async () => {
    try {
      const ok = window.confirm("¿Seguro que querés cerrar la caja?");
      if (!ok) return;

      setError("");
      setExito("");

      await cerrarCaja({
        perfil,
        caja,
        saldoCierreRealEfectivo: Number(saldoCierreReal || 0),
      });

      setSaldoCierreReal("");
      await cargarCaja();
      setExito("Caja cerrada correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cerrar la caja.");
    }
  };

  const handleReabrirCaja = async () => {
    try {
      const motivo = window.prompt("Motivo para reabrir la caja:", "");
      if (motivo === null) return;

      const ok = window.confirm("¿Seguro que querés reabrir esta caja?");
      if (!ok) return;

      setError("");
      setExito("");

      await reabrirCaja({
        perfil,
        caja,
        motivoReapertura: motivo,
      });

      await cargarCaja();
      setExito("Caja reabierta correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo reabrir la caja.");
    }
  };

  const opcionesSubtipoManual =
  tipoManual === "ingreso"
    ? [
        { value: "ingreso_capital", label: "Ingreso de capital" },
        { value: "ajuste_positivo", label: "Ajuste positivo" },
        { value: "otro_ingreso", label: "Otro ingreso" },
      ]
    : [
        { value: "gasto_caja", label: "Gasto de caja" },
        { value: "descuento_efectivo", label: "Descuento efectivo" },
        { value: "egreso_capital", label: "Egreso de capital" },
        { value: "ajuste_negativo", label: "Ajuste negativo" },
        { value: "otro_egreso", label: "Otro egreso" },
      ];

  const resumenPorMedios = useMemo(() => {
  const resumen = {};

  movimientos.forEach((mov) => {
    const medio = mov.medioPago || "Sin medio";

    if (!resumen[medio]) {
      resumen[medio] = {
        ingresos: 0,
        egresos: 0,
      };
    }

    if (mov.tipo === "ingreso") {
      resumen[medio].ingresos += Number(mov.monto || 0);
    }

    if (mov.tipo === "egreso") {
      resumen[medio].egresos += Number(mov.monto || 0);
    }
  });

  return resumen;
}, [movimientos]);

  return (
    <div className="clientes-lista">
      <div className="encabezado-lista" style={{ marginBottom: 14 }}>
        <div>
          <h1>Caja</h1>
          <p style={{ margin: "6px 0 0", color: "#666" }}>
            Control diario.
          </p>
        </div>
      </div>

      {error && <div style={alertError}>{error}</div>}
      {exito && <div style={alertOk}>{exito}</div>}

      <section style={card}>
        <div style={headerCaja}>
          <div>
            <div style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
              Caja del día
            </div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>
              {formatearFechaCaja(fechaCaja)}
            </div>
          </div>

          <span
            style={{
              ...badge,
              background: estaAbierta ? "#e9f7ef" : estaCerrada ? "#eef2f7" : "#fff4e5",
              color: estaAbierta ? "#146c43" : estaCerrada ? "#495057" : "#a15c00",
            }}
          >
            {estaAbierta ? "Abierta" : estaCerrada ? "Cerrada" : "Sin abrir"}
          </span>
        </div>

        <div style={kpiGrid}>
          <Kpi label="Cierre anterior" value={formatearMoneda(aperturaReferencia, configMoneda.moneda, configMoneda.localeMoneda)} />
          <Kpi label="Apertura" value={formatearMoneda(aperturaActual, configMoneda.moneda, configMoneda.localeMoneda)} />
          <Kpi
            label="Diferencia apertura"
            value={formatearMoneda(diferenciaApertura, configMoneda.moneda, configMoneda.localeMoneda)}
            color={diferenciaApertura === 0 ? "#146c43" : "#b02a37"}
          />
          <Kpi label="Efectivo esperado" value={formatearMoneda(resumen.efectivoEsperado, configMoneda.moneda, configMoneda.localeMoneda)} />
        </div>

        {!caja && (
          <div style={barraAcciones}>
            <input
              type="number"
              placeholder="Saldo apertura efectivo"
              value={saldoApertura}
              onChange={(e) => setSaldoApertura(e.target.value)}
              style={input}
            />

            <button onClick={handleAbrirCaja} style={btnPrimary}>
              Abrir caja
            </button>
          </div>
        )}

        {estaAbierta && (
          <div style={barraAccionesCompacta}>
            <button onClick={() => setModalMovimiento(true)} style={btnSecondarySmall}>
              + Movimiento
            </button>

            <input
              type="number"
              placeholder="Efectivo cierre"
              value={saldoCierreReal}
              onChange={(e) => setSaldoCierreReal(e.target.value)}
              style={inputSmall}
            />

            <button onClick={handleCerrarCaja} style={btnDangerSmall}>
              Cerrar
            </button>
          </div>
        )}

        {estaCerrada && (
          <div style={barraAcciones}>
            <Kpi
              label="Cierre real"
              value={formatearMoneda(caja.saldoCierreRealEfectivo, configMoneda.moneda, configMoneda.localeMoneda)}
            />
            <Kpi
              label="Diferencia cierre"
              value={formatearMoneda(caja.diferenciaCierreEfectivo, configMoneda.moneda, configMoneda.localeMoneda)}
              color={Number(caja.diferenciaCierreEfectivo || 0) === 0 ? "#146c43" : "#b02a37"}
            />

            <button onClick={handleReabrirCaja} style={btnSecondary}>
              Reabrir caja
            </button>
          </div>
        )}
      </section>



      {caja && (
        <section style={card}>
          <div style={sectionHeader}>
            <h2 style={{ margin: 0 }}>Movimientos del día</h2>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#6b7280", fontSize: 13 }}>
                  {movimientos.length} movimientos
                </span>

                <button
                  style={btnSecondarySmall}
                  onClick={() => setMostrarResumen(true)}
                >
                  Resumen
                </button>
              </div>
          </div>

          <div style={movimientosGrid}>
            <MovimientoTabla
              titulo="Ingresos"
              color="#198754"
              fondo="rgba(25, 135, 84, 0.05)"
              movimientos={movimientos.filter((m) => m.tipo === "ingreso")}
              configMoneda={configMoneda}
            />

            <MovimientoTabla
              titulo="Egresos"
              color="#dc3545"
              fondo="rgba(220, 53, 69, 0.05)"
              movimientos={movimientos.filter((m) => m.tipo === "egreso")}
              configMoneda={configMoneda}
            />
          </div>
        </section>
      )}

      {modalMovimiento && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div style={sectionHeader}>
              <h2 style={{ margin: 0 }}>Nuevo movimiento de caja</h2>
              <button onClick={() => setModalMovimiento(false)} style={btnGhost}>
                Cerrar
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <select
                value={tipoManual}
                onChange={(e) => {
                  const nuevoTipo = e.target.value;
                  setTipoManual(nuevoTipo);

                  if (nuevoTipo === "ingreso") {
                    setSubtipoManual("ingreso_capital");
                  } else {
                    setSubtipoManual("gasto_caja");
                  }
                }}
                style={input}
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>

                <select
                  value={subtipoManual}
                  onChange={(e) => setSubtipoManual(e.target.value)}
                  style={input}
                >
                  {opcionesSubtipoManual.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>
                      {opcion.label}
                    </option>
                  ))}
                </select>

              <input
                type="number"
                placeholder="Monto"
                value={montoManual}
                onChange={(e) => setMontoManual(e.target.value)}
                style={input}
              />

              <input
                placeholder="Descripción"
                value={descripcionManual}
                onChange={(e) => setDescripcionManual(e.target.value)}
                style={input}
              />

              <button onClick={handleCrearMovimientoManual} style={btnPrimary}>
                Guardar movimiento
              </button>
            </div>
          </div>
        </div>
      )}
      {mostrarResumen && (
  <div style={modalOverlay}>
    <div style={modalCaja}>
      <div style={modalHeader}>
        <h3 style={{ margin: 0 }}>Resumen por medios</h3>

        <button
          style={modalCloseBtn}
          onClick={() => setMostrarResumen(false)}
        >
          ✕
        </button>
      </div>

      <div style={modalResumenGrid}>
        {Object.entries(resumenPorMedios).map(([medio, valores]) => (
          <div key={medio} style={modalResumenCard}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {medio}
            </span>

            <strong style={{ fontSize: 18 }}>
              {formatearMoneda(
                valores.ingresos - valores.egresos,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
            </strong>

            <small style={{ color: "#6b7280" }}>
              Ing.{" "}
              {formatearMoneda(
                valores.ingresos,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
              {" / "}
              Egr.{" "}
              {formatearMoneda(
                valores.egresos,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
            </small>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
    </div>
    
  );
}

function MovimientoTabla({
  titulo,
  movimientos,
  configMoneda,
  color = "#111827",
  fondo = "#f8fafc",
}) {
  const total = movimientos.reduce(
    (acc, m) => acc + Number(m.monto || 0),
    0
  );



  return (
    <div style={tablaMovCard}>
      <div
        style={{
          ...tablaMovHeader,
          background: fondo,
          borderBottom: `1px solid ${color}20`,
        }}
      >
        <h3 style={{ margin: 0, color }}>{titulo}</h3>
        <strong style={{ color }}>
          {formatearMoneda(total, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
      </div>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Medio</th>
            <th>Descripción</th>
            <th>Monto</th>
          </tr>
        </thead>

        <tbody>
          {movimientos.map((m) => (
            <tr key={m.firebaseId}>
              <td>{formatearFechaCaja(m.fecha)}</td>
              <td>{m.medioPago || "-"}</td>
              <td>{m.descripcion || m.subtipo || "-"}</td>
              <td>{formatearMoneda(m.monto, configMoneda.moneda, configMoneda.localeMoneda)}</td>
            </tr>
          ))}

          {movimientos.length === 0 && (
            <tr>
              <td colSpan="4" style={{ textAlign: "center", padding: 14, color: "#777" }}>
                Sin movimientos
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    
  );
}

function Kpi({ label, value, color = "#111827" }) {
  return (
    <div style={kpiCard}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  marginBottom: 16,
};

const headerCaja = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
};

const badge = {
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 800,
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const kpiCard = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const barraAcciones = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  alignItems: "center",
};

const mediosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};

const medioCard = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
};

const input = {
  height: 38,
  padding: "8px 10px",
  border: "1px solid #d9dee8",
  borderRadius: 10,
};

const btnPrimary = {
  height: 38,
  border: "none",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  background: "#0d6efd",
  color: "#fff",
};

const btnSecondary = {
  height: 38,
  border: "1px solid #d9dee8",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  background: "#fff",
};

const btnDanger = {
  height: 38,
  border: "none",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  background: "#dc3545",
  color: "#fff",
};

const btnGhost = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  cursor: "pointer",
};


const modalCard = {
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  width: "100%",
  maxWidth: 460,
};

const alertError = {
  background: "#fdecea",
  color: "#b02a37",
  padding: 12,
  borderRadius: 10,
  marginBottom: 12,
};

const alertOk = {
  background: "#e9f7ef",
  color: "#146c43",
  padding: 12,
  borderRadius: 10,
  marginBottom: 12,
};

const cardCompacto = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  marginBottom: 14,
};

const sectionHeaderCompacto = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const mediosGridCompacto = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))",
  gap: 8,
};

const medioCardCompacto = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const barraAccionesCompacta = {
  marginTop: 14,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const inputSmall = {
  height: 34,
  width: 170,
  padding: "7px 9px",
  border: "1px solid #d9dee8",
  borderRadius: 9,
};

const btnSecondarySmall = {
  height: 34,
  border: "1px solid #d9dee8",
  borderRadius: 9,
  fontWeight: 800,
  cursor: "pointer",
  background: "#fff",
  padding: "0 12px",
};

const btnDangerSmall = {
  height: 42,
  border: "none",
  borderRadius: 9,
  fontWeight: 800,
  cursor: "pointer",
  background: "#dc3545",
  color: "#fff",
  padding: "0 22px",
};

const movimientosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 14,
};

const tablaMovCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const tablaMovHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
};



const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};







const modalResumenGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const modalResumenCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "#f9fafb",
};

const modalCaja = {
  width: "min(700px, 92vw)",
  background: "#fff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
};

const modalHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 18,
};

const modalCloseBtn = {
  border: "none",
  background: "transparent",
  fontSize: 18,
  cursor: "pointer",
};