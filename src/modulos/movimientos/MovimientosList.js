import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  movimientoEstaAnulado,
  movimientoImpactaInforme,
  crearResumenMovimientosVacio,
  obtenerMovimientosCompletos,
  obtenerMovimientosPaginados,
  obtenerResumenMovimientosCompleto,
} from "../../firebase/movimientos";
import { obtenerDetalleMovimientoAuditoria } from "../../firebase/auditoriaMovimientos";
import {
  obtenerEstadoActualProduccion,
  obtenerHistorialProduccionGlobal,
  obtenerMetricasHistorialProduccion,
} from "../../firebase/informesProduccion";
import {
  obtenerSaldosPendientesClientes,
  obtenerSaldosPendientesProveedores,
} from "../../firebase/informesFinancieros";
import * as XLSX from "xlsx";
import { fechaHoyNegocio } from "../../utils/fechas";
import VentaDetalle from "../ventas/VentaDetalle";
import GastoDetalleInforme from "./GastoDetalleInforme";
import SaldoPendienteModal from "./SaldoPendienteModal";
import InformeComercial from "./InformeComercial";
import { obtenerVentaPorId } from "../../firebase/ventas";
import { obtenerGastoPorId } from "../../firebase/gastos";

export function crearControlSolicitudes() {
  let ultimaSolicitud = 0;

  return {
    iniciar() {
      ultimaSolicitud += 1;
      return ultimaSolicitud;
    },
    esActual(solicitudId) {
      return solicitudId === ultimaSolicitud;
    },
  };
}

export function tipoDetalleRealMovimiento(movimiento) {
  const origen = movimiento?.origen || "";
  const subtipo = movimiento?.subtipo || "";
  if (!movimiento?.origenRefId) return null;

  if (
    origen === "venta" ||
    origen === "venta_pago" ||
    subtipo === "venta" ||
    subtipo === "cobro_venta"
  ) return "venta";

  if (
    origen === "gasto" ||
    origen === "gasto_pago" ||
    subtipo === "gasto" ||
    subtipo === "gasto_caja"
  ) return "gasto";

  return null;
}

export async function resolverDetalleRealMovimiento({
  movimiento,
  perfil,
  cargarVenta = obtenerVentaPorId,
  cargarGasto = obtenerGastoPorId,
}) {
  const tipo = tipoDetalleRealMovimiento(movimiento);
  if (!tipo) return null;

  const detalle = tipo === "venta"
    ? await cargarVenta(movimiento.origenRefId)
    : await cargarGasto({ perfil, gastoId: movimiento.origenRefId });
  const perteneceAlTenant =
    perfil?.rol === "superadmin" ||
    detalle.clienteId === perfil?.clienteId;

  if (!perteneceAlTenant) throw new Error("La relación apunta a otro tenant.");
  return { tipo, id: movimiento.origenRefId, movimiento };
}

function formatearMoneda(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function moverFechaISO(fechaISO, cantidadDias) {
  if (!fechaISO) return "";

  const [anio, mes, dia] = fechaISO.split("-").map(Number);

  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));

  fechaUTC.setUTCDate(fechaUTC.getUTCDate() + cantidadDias);

  const nuevoAnio = fechaUTC.getUTCFullYear();
  const nuevoMes = String(fechaUTC.getUTCMonth() + 1).padStart(2, "0");
  const nuevoDia = String(fechaUTC.getUTCDate()).padStart(2, "0");

  return `${nuevoAnio}-${nuevoMes}-${nuevoDia}`;
}

function rangoHoy(fechaHoy) {
  return {
    desde: fechaHoy,
    hasta: fechaHoy,
  };
}

function rangoAyer(fechaHoy) {
  const ayer = moverFechaISO(fechaHoy, -1);

  return {
    desde: ayer,
    hasta: ayer,
  };
}

function rangoUltimosDias(fechaHoy, dias) {
  return {
    desde: moverFechaISO(fechaHoy, -(dias - 1)),
    hasta: fechaHoy,
  };
}

function formatearDuracion(minutos) {
  const total = Number(minutos) || 0;

  if (total < 60) return `${total} min`;

  const horas = Math.floor(total / 60);
  const mins = total % 60;

  if (horas < 24) return mins ? `${horas} h ${mins} min` : `${horas} h`;

  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;

  return horasRestantes ? `${dias} d ${horasRestantes} h` : `${dias} d`;
}

export default function MovimientosList({ perfil }) {
  const fechaHoySistema = fechaHoyNegocio(perfil);
  const [vistaActiva, setVistaActiva] = useState("resumen");
  const [movimientos, setMovimientos] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [historialProduccion, setHistorialProduccion] = useState([]);
  const [loadingProduccion, setLoadingProduccion] = useState(false);
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [filtroDesdeProduccion, setFiltroDesdeProduccion] = useState(() =>
    moverFechaISO(fechaHoySistema, -7)
  );

  const [filtroHastaProduccion, setFiltroHastaProduccion] = useState(
    fechaHoySistema
  );
  const [estadoActualProduccion, setEstadoActualProduccion] = useState([]);
const [loadingEstadoActual, setLoadingEstadoActual] = useState(false);
const [filtroUsuarioProduccion, setFiltroUsuarioProduccion] = useState("");
const hoyDefault = rangoHoy(fechaHoySistema);

const [rangoFinanzasActivo, setRangoFinanzasActivo] = useState("hoy");
const [fechaDesdeFinanzas, setFechaDesdeFinanzas] = useState(hoyDefault.desde);
const [fechaHastaFinanzas, setFechaHastaFinanzas] = useState(hoyDefault.hasta);

const [tipoMovimientoFiltro, setTipoMovimientoFiltro] = useState("");
const [vistaFinanzas, setVistaFinanzas] = useState("movimientos");
const [saldosClientes, setSaldosClientes] = useState([]);
const [saldosProveedores, setSaldosProveedores] = useState([]);
const [loadingSaldos, setLoadingSaldos] = useState(false);
const [loadingMetricasFinanzas, setLoadingMetricasFinanzas] = useState(false);
const [resumen, setResumen] = useState(crearResumenMovimientosVacio);
const [metricasProduccion, setMetricasProduccion] = useState({
  totalMovimientos: 0,
  pedidosFinalizados: 0,
  promedioGeneralMinutos: 0,
  productividadKpi: [],
  etapasKpi: [],
});
const solicitudMetricasFinanzasRef = useRef(crearControlSolicitudes());
const solicitudSaldosRef = useRef(crearControlSolicitudes());
const solicitudProduccionRef = useRef(crearControlSolicitudes());

const [saldoModal, setSaldoModal] = useState(null);
const [detalleReal, setDetalleReal] = useState(null);

const [exportandoExcel, setExportandoExcel] = useState(false);
const [mensajeExportacion, setMensajeExportacion] = useState("");
const [modalAuditoria, setModalAuditoria] = useState(null);
const [loadingAuditoria, setLoadingAuditoria] = useState(false);

const [esMobile, setEsMobile] = useState(window.innerWidth <= 768);

useEffect(() => {
  const handleResize = () => {
    setEsMobile(window.innerWidth <= 768);
  };

  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);

const estadoActualFiltrado = filtroUsuarioProduccion
  ? estadoActualProduccion.filter(
      (p) => p.usuarioAsignadoUid === filtroUsuarioProduccion
    )
  : estadoActualProduccion;

const historialFiltrado = filtroUsuarioProduccion
  ? historialProduccion.filter(
      (h) => h.usuarioAsignadoUid === filtroUsuarioProduccion
    )
  : historialProduccion;

const cargarEstadoActualProduccion = useCallback(async () => {
  try {
    setLoadingEstadoActual(true);
    const res = await obtenerEstadoActualProduccion({ perfil });
    setEstadoActualProduccion(res);
  } catch (error) {
    console.error("Error cargando estado actual producción:", error);
  } finally {
    setLoadingEstadoActual(false);
  }
}, [perfil]);

const cargarMovimientos = useCallback(async () => {
  try {
    setLoading(true);

    const res = await obtenerMovimientosPaginados({
      perfil,
      fechaDesde: fechaDesdeFinanzas,
      fechaHasta: fechaHastaFinanzas,
      tipo: tipoMovimientoFiltro,
    });

    setMovimientos(res.movimientos);
    setUltimoDoc(res.ultimoDoc);
    setHayMas(res.hayMas);
} catch (error) {
  console.error("Error al cargar movimientos:", error);
  setMovimientos([]);
  setUltimoDoc(null);
  setHayMas(false);
} finally {
    setLoading(false);
  }
}, [perfil, fechaDesdeFinanzas, fechaHastaFinanzas, tipoMovimientoFiltro]);

const cargarMas = async () => {
  try {
    if (!ultimoDoc || !hayMas) return;

    const res = await obtenerMovimientosPaginados({
      perfil,
      ultimoDoc,
      fechaDesde: fechaDesdeFinanzas,
      fechaHasta: fechaHastaFinanzas,
      tipo: tipoMovimientoFiltro,
    });

    setMovimientos((prev) => [...prev, ...res.movimientos]);
    setUltimoDoc(res.ultimoDoc);
    setHayMas(res.hayMas);
  } catch (error) {
    console.error("Error al cargar más movimientos:", error);
  }
};

const cargarSaldosPendientes = useCallback(async () => {
  const solicitudId = solicitudSaldosRef.current.iniciar();
  try {
    setLoadingSaldos(true);
    setSaldosClientes([]);
    setSaldosProveedores([]);

    const [clientes, proveedores] = await Promise.allSettled([
      obtenerSaldosPendientesClientes({ perfil }),
      obtenerSaldosPendientesProveedores({ perfil }),
    ]);

    if (!solicitudSaldosRef.current.esActual(solicitudId)) return;

    if (clientes.status === "fulfilled") {
      setSaldosClientes(clientes.value);
    } else {
      console.error("Error cargando saldos pendientes de clientes:", clientes.reason);
    }

    if (proveedores.status === "fulfilled") {
      setSaldosProveedores(proveedores.value);
    } else {
      console.error(
        "Error cargando saldos pendientes de proveedores:",
        proveedores.reason
      );
    }
  } finally {
    if (solicitudSaldosRef.current.esActual(solicitudId)) {
      setLoadingSaldos(false);
    }
  }
}, [perfil]);

const abrirAuditoriaMovimiento = async (movimiento) => {
  const origen = movimiento?.origen || "";
  const origenRefId = movimiento?.origenRefId || "";
  const tipoReal = tipoDetalleRealMovimiento(movimiento);

  if (tipoReal) {
    try {
      setLoadingAuditoria(true);
      const detalleResuelto = await resolverDetalleRealMovimiento({
        movimiento,
        perfil,
      });
      setDetalleReal(detalleResuelto);
      return;
    } catch (errorRelacion) {
      console.warn(
        "No se pudo resolver la relación real del movimiento; se usa fallback:",
        { movimientoId: movimiento?.firebaseId, origen, origenRefId },
        errorRelacion
      );
      setModalAuditoria({ movimiento, origen, detalle: null });
      return;
    } finally {
      setLoadingAuditoria(false);
    }
  }

  try {
    setLoadingAuditoria(true);

    const detalle = await obtenerDetalleMovimientoAuditoria(movimiento);

    setModalAuditoria(detalle);
  } catch (error) {
    console.error("Error abriendo auditoría:", error);
    alert("No se pudo abrir el comprobante del movimiento.");
  } finally {
    setLoadingAuditoria(false);
  }
};

const aplicarRangoRapidoFinanzas = (rango) => {
  setRangoFinanzasActivo(rango);

    if (rango === "hoy") {
      const r = rangoHoy(fechaHoySistema);
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }

  if (rango === "ayer") {
    const r = rangoAyer(fechaHoySistema);
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }

  if (rango === "7dias") {
    const r = rangoUltimosDias(fechaHoySistema, 7);
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }

  if (rango === "30dias") {
    const r = rangoUltimosDias(fechaHoySistema, 30);
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }
};

const exportarMovimientosCSV = async () => {
  try {
    setMensajeExportacion("");

    if (exportandoExcel) return;

    setExportandoExcel(true);
    setMensajeExportacion("Preparando descarga...");

    const movimientosExportables = await obtenerMovimientosCompletos({
      perfil,
      fechaDesde: fechaDesdeFinanzas,
      fechaHasta: fechaHastaFinanzas,
      tipo: tipoMovimientoFiltro,
    });

    if (!movimientosExportables.length) {
      setMensajeExportacion(
        "No hay movimientos para exportar en el período seleccionado."
      );
      return;
    }

    const datos = movimientosExportables.map((m) => ({
      Fecha: m.createdAt?.toDate
        ? m.createdAt.toDate().toLocaleDateString("es-AR")
        : m.fecha || "",
      Tipo: m.tipo || "",
      Subtipo: m.subtipo || "",
      Descripcion: m.descripcion || "",
      MedioPago: m.medioPago || "",
      Monto: Number(m.monto) || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Finanzas");
    XLSX.writeFile(wb, "movimientos_financieros.xlsx");

    setMensajeExportacion("Archivo descargado correctamente.");
  } catch (error) {
    console.error("Error exportando Excel:", error);
    setMensajeExportacion("No se pudo exportar el archivo.");
  } finally {
    setTimeout(() => {
      setExportandoExcel(false);
      setMensajeExportacion("");
    }, 1200);
  }
};

const cargarMetricasFinanzas = useCallback(async () => {
  const solicitudId = solicitudMetricasFinanzasRef.current.iniciar();

  try {
    setLoadingMetricasFinanzas(true);
    const nuevoResumen = await obtenerResumenMovimientosCompleto({
      perfil,
      fechaDesde: fechaDesdeFinanzas,
      fechaHasta: fechaHastaFinanzas,
      tipo: tipoMovimientoFiltro,
    });

    if (solicitudMetricasFinanzasRef.current.esActual(solicitudId)) {
      setResumen(nuevoResumen);
    }
  } catch (error) {
    console.error("Error cargando métricas financieras completas:", error);
    if (solicitudMetricasFinanzasRef.current.esActual(solicitudId)) {
      setResumen(crearResumenMovimientosVacio());
    }
  } finally {
    if (solicitudMetricasFinanzasRef.current.esActual(solicitudId)) {
      setLoadingMetricasFinanzas(false);
    }
  }
}, [perfil, fechaDesdeFinanzas, fechaHastaFinanzas, tipoMovimientoFiltro]);

const cargarHistorialProduccion = useCallback(async () => {
  const solicitudId = solicitudProduccionRef.current.iniciar();
  try {
    setLoadingProduccion(true);
    setMetricasProduccion({
      totalMovimientos: 0,
      pedidosFinalizados: 0,
      promedioGeneralMinutos: 0,
      productividadKpi: [],
      etapasKpi: [],
    });

    const [historial, metricas] = await Promise.allSettled([
      obtenerHistorialProduccionGlobal({
        perfil,
        fechaDesde: filtroDesdeProduccion,
        fechaHasta: filtroHastaProduccion,
      }),
      obtenerMetricasHistorialProduccion({
        perfil,
        fechaDesde: filtroDesdeProduccion,
        fechaHasta: filtroHastaProduccion,
        usuarioUid: filtroUsuarioProduccion,
      }),
    ]);

    if (!solicitudProduccionRef.current.esActual(solicitudId)) return;

    if (historial.status === "fulfilled") {
      setHistorialProduccion(historial.value);
    } else {
      console.error(
        "Error cargando detalle del historial de producción:",
        historial.reason
      );
    }

    if (metricas.status === "fulfilled") {
      setMetricasProduccion(metricas.value);
    } else {
      console.error(
        "Error cargando métricas históricas de producción:",
        metricas.reason
      );
    }
  } finally {
    if (solicitudProduccionRef.current.esActual(solicitudId)) {
      setLoadingProduccion(false);
    }
  }
}, [
  perfil,
  filtroDesdeProduccion,
  filtroHastaProduccion,
  filtroUsuarioProduccion,
]);

useEffect(() => {
  cargarMovimientos();
  cargarMetricasFinanzas();
}, [cargarMovimientos, cargarMetricasFinanzas]);

useEffect(() => {
  if (
    vistaActiva === "finanzas" &&
    (vistaFinanzas === "clientesPendientes" ||
      vistaFinanzas === "proveedoresPendientes")
  ) {
    cargarSaldosPendientes();
  }
}, [vistaActiva, vistaFinanzas, cargarSaldosPendientes]);

useEffect(() => {
  if (vistaActiva === "produccion") {
    cargarHistorialProduccion();
    cargarEstadoActualProduccion();
  }
}, [
  vistaActiva,
  cargarHistorialProduccion,
  cargarEstadoActualProduccion,
]);

  return (
    <div className="clientes-lista informes-page">
      <div className="encabezado-lista" style={{ marginBottom: 16 }}>
        <div>
          <h1>Informes</h1>
          <p style={{ margin: "6px 0 0", color: "#666" }}>
            Resumen general, finanzas y métricas operativas.
          </p>
        </div>
      </div>

      <div className="informes-tabs" style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <button
          onClick={() => setVistaActiva("resumen")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d9dee8",
            background: vistaActiva === "resumen" ? "#eaf2ff" : "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Resumen
        </button>

        <button
          onClick={() => setVistaActiva("finanzas")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d9dee8",
            background: vistaActiva === "finanzas" ? "#eaf2ff" : "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Finanzas
        </button>

        <button
          onClick={() => setVistaActiva("produccion")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d9dee8",
            background: vistaActiva === "produccion" ? "#eaf2ff" : "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Producción
        </button>

        <button
          onClick={() => setVistaActiva("comercial")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d9dee8",
            background: vistaActiva === "comercial" ? "#eaf2ff" : "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Comercial
        </button>
      </div>
    
     

{(vistaActiva === "resumen" ||
  vistaActiva === "finanzas" ||
  vistaActiva === "comercial") && (
  <div
    style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 16,
      marginBottom: 18,
      display: "grid",
      gap: 14,
    }}
  >
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {[
        ["hoy", "Hoy"],
        ["ayer", "Ayer"],
        ["7dias", "Últimos 7 días"],
        ["30dias", "Últimos 30 días"],
      ].map(([key, label]) => (
        <button
          key={key}
          onClick={() => aplicarRangoRapidoFinanzas(key)}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid #d9dee8",
            background: rangoFinanzasActivo === key ? "#eaf2ff" : "#fff",
            fontWeight: 700,
            cursor: "pointer",
            height: 38,
          }}
        >
          {label}
        </button>
      ))}
    </div>

    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "end",
        flexWrap: "wrap",
      }}
    >
      <div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Desde</label>
        <input
          type="date"
          value={fechaDesdeFinanzas}
          onChange={(e) => {
            setRangoFinanzasActivo("personalizado");
            setFechaDesdeFinanzas(e.target.value);
          }}
          style={{
            display: "block",
            padding: "9px 10px",
            marginTop: 4,
            height: 38,
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Hasta</label>
        <input
          type="date"
          value={fechaHastaFinanzas}
          onChange={(e) => {
            setRangoFinanzasActivo("personalizado");
            setFechaHastaFinanzas(e.target.value);
          }}
          style={{
            display: "block",
            padding: "9px 10px",
            marginTop: 4,
            height: 38,
          }}
        />
      </div>

      {vistaActiva === "finanzas" && (
        <>
          <div
            style={{
              padding: "8px 10px",
              border: "1px solid #0096d1",
              borderRadius: 12,
              background: "#eaf7ff",
            }}
          >
            <label style={{ fontSize: 13, fontWeight: 800, color: "#0096d1" }}>
              Mostrar
            </label>

            <select
              value={vistaFinanzas}
              onChange={(e) => {
                const valor = e.target.value;
                setVistaFinanzas(valor);

                if (valor === "ingresos") {
                  setTipoMovimientoFiltro("ingreso");
                } else if (valor === "egresos") {
                  setTipoMovimientoFiltro("egreso");
                } else {
                  setTipoMovimientoFiltro("");
                }

                if (
                  valor === "clientesPendientes" ||
                  valor === "proveedoresPendientes"
                ) {
                  setRangoFinanzasActivo("todos");
                  setFechaDesdeFinanzas("");
                  setFechaHastaFinanzas("");
                  setSaldoModal(null);
                }
              }}
              style={{
                display: "block",
                padding: "9px 10px",
                marginTop: 4,
                minWidth: 230,
                height: 38,
                border: "1px solid #0096d1",
                borderRadius: 10,
                background: "#fff",
                fontWeight: 700,
              }}
            >
              <option value="movimientos">Movimientos</option>
              <option value="ingresos">Ingresos</option>
              <option value="egresos">Egresos</option>
              <option value="clientesPendientes">Clientes con saldo pendiente</option>
              <option value="proveedoresPendientes">Proveedores con saldo pendiente</option>
            </select>
          </div>

          <button
            onClick={exportarMovimientosCSV}
            disabled={exportandoExcel}
            style={{
              padding: "9px 14px",
              borderRadius: 10,
              border: "1px solid #d9dee8",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              height: 38,
              opacity: exportandoExcel ? 0.6 : 1,
              pointerEvents: exportandoExcel ? "none" : "auto",
            }}
          >
            {exportandoExcel ? "Descargando..." : "Exportar Excel"}
          </button>

          {mensajeExportacion && (
            <span style={{ fontSize: 13, color: "#666" }}>
              {mensajeExportacion}
            </span>
          )}
        </>
      )}
    </div>
  </div>
)}

      {loading && <p>Cargando informes...</p>}
      {loadingAuditoria && <p>Abriendo detalle...</p>}
      {loadingMetricasFinanzas &&
        (vistaActiva === "resumen" || vistaActiva === "finanzas") && (
          <p>Cargando totales completos...</p>
        )}

      {!loading && !loadingMetricasFinanzas && vistaActiva === "resumen" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Ingresos</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{formatearMoneda(resumen.totalIngresos)}</div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Egresos</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{formatearMoneda(resumen.totalEgresos)}</div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Resultado</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{formatearMoneda(resumen.resultado)}</div>
          </div>

        
        </div>
      )}

      {!loading && vistaActiva === "finanzas" && (
        <>
        {(() => {
          const ingresos = resumen.totalIngresosFinanzas;
          const egresos = resumen.totalEgresosFinanzas;
          const resultado = resumen.resultadoFinanzas;

          const totalClientesPendiente = saldosClientes.reduce(
            (acc, c) => acc + Number(c.totalPendiente || 0),
            0
          );

          const totalProveedoresPendiente = saldosProveedores.reduce(
            (acc, p) => acc + Number(p.totalPendiente || 0),
            0
          );

          const mayorCliente = [...saldosClientes].sort(
            (a, b) => Number(b.totalPendiente || 0) - Number(a.totalPendiente || 0)
          )[0];

          const mayorProveedor = [...saldosProveedores].sort(
            (a, b) => Number(b.totalPendiente || 0) - Number(a.totalPendiente || 0)
          )[0];

          const cardStyle = {
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
          };

          const labelStyle = {
            fontSize: 13,
            color: "#666",
            marginBottom: 6,
          };

          const valueStyle = {
            fontSize: 24,
            fontWeight: 800,
          };

          if (vistaFinanzas === "clientesPendientes") {
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <div style={cardStyle}>
                  <div style={labelStyle}>Clientes con saldo</div>
                  <div style={valueStyle}>{saldosClientes.length}</div>
                </div>

                <div style={cardStyle}>
                  <div style={labelStyle}>Total pendiente de cobro</div>
                  <div style={valueStyle}>{formatearMoneda(totalClientesPendiente)}</div>
                </div>

                <div style={cardStyle}>
                  <div style={labelStyle}>Mayor saldo cliente</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {mayorCliente?.clienteNombre || "-"}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {mayorCliente ? formatearMoneda(mayorCliente.totalPendiente) : ""}
                  </div>
                </div>
              </div>
            );
          }

          if (vistaFinanzas === "proveedoresPendientes") {
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <div style={cardStyle}>
                  <div style={labelStyle}>Proveedores con saldo</div>
                  <div style={valueStyle}>{saldosProveedores.length}</div>
                </div>

                <div style={cardStyle}>
                  <div style={labelStyle}>Total a pagar</div>
                  <div style={valueStyle}>{formatearMoneda(totalProveedoresPendiente)}</div>
                </div>

                <div style={cardStyle}>
                  <div style={labelStyle}>Mayor saldo proveedor</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {mayorProveedor?.proveedorNombre || "-"}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {mayorProveedor ? formatearMoneda(mayorProveedor.totalPendiente) : ""}
                  </div>
                </div>
              </div>
            );
          }

          if (loadingMetricasFinanzas) return null;

          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <div style={cardStyle}>
                <div style={labelStyle}>Ingresos</div>
                <div style={valueStyle}>{formatearMoneda(ingresos)}</div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                  Ingresos operativos registrados.
                </div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>Egresos del período</div>
                <div style={valueStyle}>{formatearMoneda(egresos)}</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>Resultado neto</div>
                <div style={valueStyle}>{formatearMoneda(resultado)}</div>
              </div>
            </div>
          );
        })()}
      {vistaFinanzas === "clientesPendientes" && (
        <div style={{ marginBottom: 18 }}>
          {loadingSaldos ? (
            <p>Cargando saldos...</p>
          ) : (
            <table style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Cliente</th>
                  <th>Ventas pendientes</th>
                  <th>Total pendiente</th>
                  <th>Última venta</th>
                </tr>
              </thead>

              <tbody>
                {saldosClientes.map((c) => (
                  <tr key={c.clienteId || c.clienteNombre}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSaldoModal({ tipo: "cliente", resumen: c })}
                      >
                        Ver
                      </button>
                    </td>
                    <td>{c.clienteNombre}</td>
                    <td>{c.cantidad}</td>
                    <td>{formatearMoneda(c.totalPendiente)}</td>
                    <td>{c.ultimaVenta ? `#${c.ultimaVenta}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

        {vistaFinanzas === "proveedoresPendientes" && (
          <div style={{ marginBottom: 18 }}>
            {loadingSaldos ? (
              <p>Cargando saldos...</p>
            ) : (
              <table style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th></th>
                    <th>Proveedor</th>
                    <th>Gastos pendientes</th>
                    <th>Total a pagar</th>
                    <th>Último gasto</th>
                  </tr>
                </thead>

                <tbody>
                  {saldosProveedores.map((p) => (
                    <tr key={p.proveedorId || p.proveedorNombre}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setSaldoModal({ tipo: "proveedor", resumen: p })}
                        >
                          Ver
                        </button>
                      </td>
                      <td>{p.proveedorNombre}</td>
                      <td>{p.cantidad}</td>
                      <td>{formatearMoneda(p.totalPendiente)}</td>
                      <td>{p.ultimoGasto ? `#${p.ultimoGasto}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        
          {!["clientesPendientes", "proveedoresPendientes"].includes(vistaFinanzas) && (
          <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Subtipo</th>
                <th>Descripción</th>
                <th>Medio de pago</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.filter((m) => movimientoImpactaInforme(m)).map((m) => (
                <tr
                  key={m.firebaseId}
                  onClick={() => abrirAuditoriaMovimiento(m)}
                 style={{
                    cursor: "pointer",
                    opacity: movimientoEstaAnulado(m) ? 0.62 : 1,
                    background: movimientoEstaAnulado(m) ? "#f1f5f9" : undefined,
                    color: movimientoEstaAnulado(m) ? "#64748b" : undefined,
                  }}
                >
                  <td>{m.fecha}</td>
                  <td>{m.tipo}</td>
                  <td>{m.subtipo}</td>
                  <td>
                    {m.descripcion}

                    {movimientoEstaAnulado(m) && (
                      <span className="badge-anulado" style={{ marginLeft: 8 }}>
                        ANULADO
                      </span>
                    )}
                  </td>
                  <td>{m.medioPago}</td>
                  <td>{formatearMoneda(m.monto)}</td>
                  <td>
                    {movimientoEstaAnulado(m) ? (
                      <span className="badge-anulado">ANULADO</span>
                    ) : (
                      "Activo"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
          
         {!["clientesPendientes", "proveedoresPendientes"].includes(vistaFinanzas) &&
            !loading &&
            hayMas && (
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button onClick={cargarMas}>Cargar más</button>
              </div>
          )}
        </>
      )}

      {vistaActiva === "comercial" && (
        <InformeComercial
          perfil={perfil}
          fechaDesde={fechaDesdeFinanzas}
          fechaHasta={fechaHastaFinanzas}
        />
      )}

{!loading && vistaActiva === "produccion" && (
  <div>

    {!loadingEstadoActual && (
  (() => {
    const totalActivos = estadoActualFiltrado.length;

    const porEtapaActual = {};
    const porUsuarioActual = {};

    estadoActualFiltrado.forEach((p) => {
      const etapa = p.columnaActualNombre || "Sin etapa";
      const usuario = p.usuarioAsignadoNombre || "Sin asignar";

      if (!porEtapaActual[etapa]) {
        porEtapaActual[etapa] = { etapa, cantidad: 0, totalMin: 0 };
      }

      if (!porUsuarioActual[usuario]) {
        porUsuarioActual[usuario] = { usuario, cantidad: 0 };
      }

      porEtapaActual[etapa].cantidad += 1;
      porEtapaActual[etapa].totalMin += p.minutosSinMover;

      porUsuarioActual[usuario].cantidad += 1;
    });

    const etapasActuales = Object.values(porEtapaActual)
      .map((e) => ({
        ...e,
        promedioMin: e.cantidad ? Math.round(e.totalMin / e.cantidad) : 0,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const usuariosActuales = Object.values(porUsuarioActual)
      .sort((a, b) => b.cantidad - a.cantidad);

    const etapaMasCargada = etapasActuales[0];
    const usuarioMasCargado = usuariosActuales[0];

    const pedidoMasDemorado = [...estadoActualFiltrado]
      .sort((a, b) => b.minutosSinMover - a.minutosSinMover)[0];

    const promedioActual = totalActivos
      ? Math.round(
          estadoActualFiltrado.reduce((acc, p) => acc + p.minutosSinMover, 0) /
            totalActivos
        )
      : 0;

      const pedidosMasDemorados = [...estadoActualFiltrado]
  .sort((a, b) => b.minutosSinMover - a.minutosSinMover)
  .slice(0, 8);

const cargaPorUsuario = Object.values(
  estadoActualFiltrado.reduce((acc, p) => {
    const key = p.usuarioAsignadoUid || p.usuarioAsignadoNombre || "sin_asignar";

    if (!acc[key]) {
      acc[key] = {
        usuario: p.usuarioAsignadoNombre || "Sin asignar",
        cantidad: 0,
        totalMinutos: 0,
      };
    }

    acc[key].cantidad += 1;
    acc[key].totalMinutos += Number(p.minutosSinMover) || 0;

    return acc;
  }, {})
)
  .map((u) => ({
    ...u,
    promedioMinutos: u.cantidad
      ? Math.round(u.totalMinutos / u.cantidad)
      : 0,
  }))
  .sort((a, b) => b.cantidad - a.cantidad);

return (
  <>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
        marginBottom: 18,
      }}
    >
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
        <div style={{ fontSize:13, color:"#666" }}>Pedidos activos ahora</div>
        <div style={{ fontSize:24, fontWeight:800 }}>{totalActivos}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
        <div style={{ fontSize:13, color:"#666" }}>Etapa más cargada</div>
        <div style={{ fontSize:20, fontWeight:800 }}>{etapaMasCargada?.etapa || "-"}</div>
        <div style={{ fontSize:13, color:"#666" }}>{etapaMasCargada?.cantidad || 0} pedidos</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
        <div style={{ fontSize:13, color:"#666" }}>Pedido más demorado</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          {pedidoMasDemorado?.pedidoVisibleId ? `N° ${pedidoMasDemorado.pedidoVisibleId}` : "-"}
        </div>
        <div style={{ fontSize:13, color:"#666" }}>{formatearDuracion(pedidoMasDemorado?.minutosSinMover || 0)}</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
        <div style={{ fontSize:13, color:"#666" }}>Usuario más cargado</div>
        <div style={{ fontSize:20, fontWeight:800 }}>{usuarioMasCargado?.usuario || "-"}</div>
        <div style={{ fontSize:13, color:"#666" }}>{usuarioMasCargado?.cantidad || 0} pedidos</div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
        <div style={{ fontSize:13, color:"#666" }}>Promedio actual sin mover</div>
        <div style={{ fontSize:24, fontWeight:800 }}>{formatearDuracion(promedioActual)}</div>
      </div>
    </div>

    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        marginBottom: 18,
        display: esMobile ? "grid" : "flex",
        gridTemplateColumns: esMobile ? "1fr" : "repeat(5, auto)",
        gap: 10,
        alignItems: "end",
        width: "100%",
      }}
    >
      <div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Desde</label>
        <input
          type="date"
          value={filtroDesdeProduccion}
          onChange={(e) => setFiltroDesdeProduccion(e.target.value)}
          style={{ display: "block", padding: 8, marginTop: 4 }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Hasta</label>
        <input
          type="date"
          value={filtroHastaProduccion}
          onChange={(e) => setFiltroHastaProduccion(e.target.value)}
          style={{ display: "block", padding: 8, marginTop: 4 }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Usuario</label>
        <select
          value={filtroUsuarioProduccion}
          onChange={(e) => setFiltroUsuarioProduccion(e.target.value)}
          style={{ display: "block", padding: 8, marginTop: 4 }}
        >
          <option value="">Todos</option>
          {Array.from(
            new Map(
              estadoActualProduccion
                .filter((p) => p.usuarioAsignadoUid)
                .map((p) => [
                  p.usuarioAsignadoUid,
                  p.usuarioAsignadoNombre || "Sin nombre",
                ])
            )
          ).map(([uid, nombre]) => (
            <option key={uid} value={uid}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={cargarHistorialProduccion}
        style={{
          width: "100%",
          height: 38,
          borderRadius: 10,
        }}
      >
        Aplicar filtros
      </button>

      <button
        onClick={() => setModalHistorialAbierto(true)}
        style={{
          width: "100%",
          height: 38,
          borderRadius: 10,
          gridColumn: esMobile ? "1 / -1" : undefined,
        }}
      >
        Ver historial detallado
      </button>
    </div>

  

    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          window.innerWidth <= 768
            ? "1fr"
            : "1.3fr 0.9fr",

        gap: 18,
        marginBottom: 18,
        alignItems: "start",
      }}
    >
      <div
        style={{
          background:"#fff",
          border:"1px solid #e5e7eb",
          borderRadius:12,
          padding:16,
          minWidth:0,
          width:"100%",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Pedidos más demorados</h3>

        

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Etapa</th>
              <th>Asignado</th>
              <th>Sin moverse</th>
            </tr>
          </thead>
          <tbody>
            {pedidosMasDemorados.map((p) => (
              <tr key={p.firebaseId}>
                <td>{p.pedidoVisibleId ? `N°${p.pedidoVisibleId}` : "-"}</td>
                <td>{p.clienteNombre || "-"}</td>
                <td>{p.columnaActualNombre || "-"}</td>
                <td>{p.usuarioAsignadoNombre || "-"}</td>
                <td>{formatearDuracion(p.minutosSinMover)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {pedidosMasDemorados.length === 0 && (
          <p style={{ color: "#666" }}>No hay pedidos activos para mostrar.</p>
        )}
      </div>

      <div
        style={{
          background:"#fff",
          border:"1px solid #e5e7eb",
          borderRadius:12,
          padding:16,
          minWidth:0,
          width:"100%",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Carga operativa por usuario</h3>
        <p style={{ marginTop: -6, color: "#666", fontSize: 13 }}>
          Cantidad de pedidos activos que tiene asignados cada usuario.
        </p>

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Cant. pedidos asignados</th>
              <th>Prom. sin mover</th>
            </tr>
          </thead>
          <tbody>
            {cargaPorUsuario.map((u) => (
              <tr key={u.usuario}>
                <td>{u.usuario}</td>
                <td>{u.cantidad}</td>
                <td>{formatearDuracion(u.promedioMinutos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        {cargaPorUsuario.length === 0 && (
          <p style={{ color: "#666" }}>No hay usuarios con pedidos asignados.</p>
        )}
      </div>
    </div>
  </>

  
);
  })()
)}

    

    {loadingProduccion && <p>Cargando informe de producción...</p>}

    {!loadingProduccion && (
      <>
        {(() => {
          const {
            pedidosFinalizados,
            promedioGeneralMinutos,
            productividadKpi,
            etapasKpi,
          } = metricasProduccion;
          const etapaMasLenta = etapasKpi[0];

          return (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                 
              
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Pedidos finalizados</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{pedidosFinalizados}</div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Tiempo promedio por etapa</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{formatearDuracion(promedioGeneralMinutos)}</div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Etapa más lenta</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>
                    {etapaMasLenta?.etapa || "-"}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {etapaMasLenta ? formatearDuracion(etapaMasLenta.promedioMinutos) : ""}
                  </div>
                  </div>
              </div>    
                
               
              

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: esMobile ? "1fr" : "1fr 1fr",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    background:"#fff",
                    border:"1px solid #e5e7eb",
                    borderRadius:12,
                    padding:16,
                    minWidth:0,
                    width:"100%",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Productividad por usuario y etapa</h3>
                  <p style={{ marginTop: -6, color: "#666", fontSize: 13 }}>
                    Mide cuánto tarda cada usuario en sacar una tarjeta de cada etapa donde intervino.
                  </p>

                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <table style={{ minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Etapa</th>
                        <th>Tarjetas resueltas</th>
                        <th>Tiempo promedio</th>
                        
                      </tr>
                    </thead>
                    <tbody>
                      {productividadKpi.map((u) => (
                        <tr key={`${u.usuario}_${u.etapa}`}>
                          <td>{u.usuario}</td>
                          <td>{u.etapa}</td>
                          <td>{u.intervenciones}</td>
                          <td>{formatearDuracion(u.promedioMinutos)}</td>
                          
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>

                  {productividadKpi.length === 0 && (
                    <p style={{ color: "#666" }}>
                      Todavía no hay intervenciones con tiempo suficiente para calcular productividad.
                    </p>
                  )}
                </div>

                <div
                  style={{
                    background:"#fff",
                    border:"1px solid #e5e7eb",
                    borderRadius:12,
                    padding:16,
                    minWidth:0,
                    width:"100%",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Cuellos de botella históricos</h3>
                  <p style={{ marginTop: -6, color: "#666", fontSize: 13 }}>
                    Etapas donde las tarjetas tardaron más tiempo antes de avanzar.
                  </p>
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <table style={{ minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th>Tiempo promedio</th>
                        
                      </tr>
                    </thead>
                    <tbody>
                      {etapasKpi.map((e) => (
                        <tr key={e.etapa}>
                          <td>{e.etapa}</td>
                          <td>{formatearDuracion(e.promedioMinutos)}</td>
                          
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              {historialFiltrado.length === 0 && (
                <p style={{ color: "#666", marginTop: 16 }}>
                  No hay movimientos de producción para el período seleccionado.
                </p>
              )}

              {modalHistorialAbierto && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.45)",
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 14,
                      padding: 20,
                      width: "95%",
                      maxWidth: 1200,
                      maxHeight: "85vh",
                      overflow: "auto",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <h2 style={{ marginTop: 0 }}>Historial detallado</h2>
                        <p style={{ color: "#666", marginTop: -6 }}>
                          Movimientos de tarjetas dentro del período seleccionado.
                        </p>
                      </div>

                      <button onClick={() => setModalHistorialAbierto(false)}>
                        Cerrar
                      </button>
                    </div>
                    <div style={{ width: "100%", overflowX: "auto" }}>
                      <table style={{ minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>N° Pedido</th>
                          <th>Cliente</th>
                          <th>Etapa origen</th>
                          <th>Etapa destino</th>
                          <th>Movido por</th>
                          <th>Asignado a</th>
                          <th>Tiempo en etapa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialFiltrado.map((h) => (
                          <tr key={h.firebaseId}>
                            <td>{h.fechaDate ? h.fechaDate.toLocaleString("es-AR") : "-"}</td>
                            <td>{h.pedidoVisibleId || h.pedidoNumero || h.pedidoId || "-"}</td>
                            <td>{h.clienteNombre || "-"}</td>
                            <td>{h.columnaOrigenNombre || "-"}</td>
                            <td>{h.columnaDestinoNombre || "-"}</td>
                            <td>{h.usuarioActorNombre || "-"}</td>
                            <td>{h.usuarioAsignadoNombre || "-"}</td>
                            <td>{formatearDuracion(h.duracionEnOrigenMinutos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </>
    )}
  </div>
)}

        {saldoModal && (
          <SaldoPendienteModal
            perfil={perfil}
            tipo={saldoModal.tipo}
            resumen={saldoModal.resumen}
            onCerrar={() => setSaldoModal(null)}
            onAbrirVenta={(ventaId) => {
              setSaldoModal(null);
              setDetalleReal({ tipo: "venta", id: ventaId });
            }}
            onAbrirGasto={(gastoId) => {
              setSaldoModal(null);
              setDetalleReal({ tipo: "gasto", id: gastoId });
            }}
          />
        )}

        {detalleReal?.tipo === "venta" && (
          <div className="modal-overlay" onClick={() => setDetalleReal(null)}>
            <div
              className="modal-content"
              style={{ maxWidth: 1400, maxHeight: "92vh", overflow: "auto" }}
              onClick={(event) => event.stopPropagation()}
            >
              <VentaDetalle
                perfil={perfil}
                ventaId={detalleReal.id}
                soloLectura
                onVolver={() => setDetalleReal(null)}
              />
            </div>
          </div>
        )}

        {detalleReal?.tipo === "gasto" && (
          <GastoDetalleInforme
            perfil={perfil}
            gastoId={detalleReal.id}
            onCerrar={() => setDetalleReal(null)}
          />
        )}

        {modalAuditoria && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setModalAuditoria(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 20,
              width: "95%",
              maxWidth: 780,
              maxHeight: "85vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 style={{ marginTop: 0 }}>Comprobante / auditoría</h2>
                <p style={{ color: "#666", marginTop: -6 }}>
                  Origen: {modalAuditoria.origen || "movimiento"}
                </p>
                {movimientoEstaAnulado(modalAuditoria.movimiento) && (
                  <span className="badge-anulado">ANULADO</span>
                )}
              </div>

              <button onClick={() => setModalAuditoria(null)}>
                Cerrar
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <p><b>Fecha:</b> {modalAuditoria.movimiento?.fecha || "-"}</p>
              <p><b>Tipo:</b> {modalAuditoria.movimiento?.tipo || "-"}</p>
              <p><b>Subtipo:</b> {modalAuditoria.movimiento?.subtipo || "-"}</p>
              <p><b>Descripción:</b> {modalAuditoria.movimiento?.descripcion || "-"}</p>
              <p><b>Medio:</b> {modalAuditoria.movimiento?.medioPago || "-"}</p>
              <p><b>Monto:</b> {formatearMoneda(modalAuditoria.movimiento?.monto || 0)}</p>
              <p>
              <b>Creado por:</b>{" "}
              {modalAuditoria.movimiento?.creadoPorNombre ||
                modalAuditoria.detalle?.creadoPorNombre ||
                modalAuditoria.movimiento?.creadoPor ||
                modalAuditoria.detalle?.creadoPor ||
                "-"}
            </p>

           {movimientoEstaAnulado(modalAuditoria.movimiento) && (
              <>
                <p>
                  <b>Anulado por:</b>{" "}
                  {modalAuditoria.movimiento?.anuladoPorNombre ||
                    modalAuditoria.detalle?.anuladoPorNombre ||
                    modalAuditoria.movimiento?.anuladoPor ||
                    modalAuditoria.detalle?.anuladoPor ||
                    "-"}
                </p>

                <p>
                  <b>Fecha anulación:</b>{" "}
                  {modalAuditoria.movimiento?.anuladoAt?.toDate
                    ? modalAuditoria.movimiento.anuladoAt
                        .toDate()
                        .toLocaleString("es-AR")
                    : modalAuditoria.detalle?.anuladoAt?.toDate
                    ? modalAuditoria.detalle.anuladoAt
                        .toDate()
                        .toLocaleString("es-AR")
                    : modalAuditoria.detalle?.anuladaAt?.toDate
                    ? modalAuditoria.detalle.anuladaAt
                        .toDate()
                        .toLocaleString("es-AR")
                    : "-"}
                </p>
              </>
            )}

              {movimientoEstaAnulado(modalAuditoria.movimiento) && (
                <p>
                  <span className="badge-anulado">ANULADO</span>
                </p>
              )}

              {modalAuditoria.detalle && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Detalle origen</h3>

                  <p><b>Número:</b> {modalAuditoria.detalle.numeroGasto || modalAuditoria.detalle.numeroVenta || "-"}</p>
                  <p><b>Proveedor / Cliente:</b> {modalAuditoria.detalle.proveedorNombre || modalAuditoria.detalle.proveedor || modalAuditoria.detalle.clienteNombre || "-"}</p>
                  <p><b>Total:</b> {formatearMoneda(modalAuditoria.detalle.total || modalAuditoria.detalle.monto || 0)}</p>

                  {(modalAuditoria.detalle.comprobantes || []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <b>Comprobantes:</b>

                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        {modalAuditoria.detalle.comprobantes.map((comp) => (
                          <button
                            key={comp.id || comp.url}
                            type="button"
                            onClick={() => window.open(comp.url, "_blank")}
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #d9dee8",
                              background: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            {comp.nombre || "Ver comprobante"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
