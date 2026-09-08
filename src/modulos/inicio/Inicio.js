import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Inicio.css";
import {
  FaChartBar, FaClipboardList, FaCog, FaDollarSign,
  FaExclamationTriangle, FaIndustry, FaReceipt, FaShoppingCart, FaUsers,
} from "react-icons/fa";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { puedeHacer } from "../../utils/permisos";
import {
  desplazarFechaISO, fechaHoyNegocio, formatearFechaNegocio,
  obtenerRangoRapidoNegocio,
} from "../../utils/fechas";
import { obtenerEstadoActualProduccion } from "../../firebase/informesProduccion";
import {
  obtenerCantidadClientesNuevosPeriodo, obtenerCantidadFinalizadosPeriodo,
  obtenerCantidadPedidosPeriodo, obtenerCantidadSinIniciar,
  obtenerPedidosAtrasadosActuales, obtenerResumenVentasCobros,
  obtenerSeriePedidos,
} from "../../firebase/inicioDashboard";

const STATS_INICIALES = {
  pedidos: 0, ventas: 0, cobrado: 0, pedidosPendientes: 0,
  terminados: 0, clientesNuevos: 0, pedidosAtrasados: 0,
  pedidoMasAtrasado: null, cuelloBotellaNombre: "-", cuelloBotellaCantidad: 0,
};

const OPCIONES_PERIODO = [
  ["hoy", "Hoy"], ["ayer", "Ayer"], ["7dias", "Últimos 7 días"],
  ["30dias", "Últimos 30 días"], ["personalizado", "Personalizado"],
];

function crearDiasGrafico(hoy) {
  return Array.from({ length: 7 }, (_, index) => {
    const fecha = desplazarFechaISO(hoy, index - 6);
    const [year, month, day] = fecha.split("-").map(Number);
    return {
      fecha,
      label: new Intl.DateTimeFormat("es-AR", {
        weekday: "short", timeZone: "UTC",
      }).format(new Date(Date.UTC(year, month - 1, day, 12))),
      cantidad: 0,
    };
  });
}

export default function Inicio({ onNavigate, perfil }) {
  const hoy = fechaHoyNegocio(perfil);
  const [stats, setStats] = useState(STATS_INICIALES);
  const [nombreEmpresa, setNombreEmpresa] = useState("Mi Empresa");
  const [logoUrl, setLogoUrl] = useState("");
  const [periodo, setPeriodo] = useState("hoy");
  const [personalizadoDesde, setPersonalizadoDesde] = useState(hoy);
  const [personalizadoHasta, setPersonalizadoHasta] = useState(hoy);
  const [pedidosSemana, setPedidosSemana] = useState(() => crearDiasGrafico(hoy));
  const [cargando, setCargando] = useState(false);
  const [errorDashboard, setErrorDashboard] = useState("");
  const solicitudPeriodoRef = useRef(0);
  const solicitudEstadoRef = useRef(0);

  const rango = useMemo(
    () => obtenerRangoRapidoNegocio({
      periodo, perfil, personalizadoDesde, personalizadoHasta,
    }),
    [periodo, perfil, personalizadoDesde, personalizadoHasta]
  );
  const diasGrafico = useMemo(() => crearDiasGrafico(hoy), [hoy]);
  const rangoValido =
    /^\d{4}-\d{2}-\d{2}$/.test(rango.desde) &&
    /^\d{4}-\d{2}-\d{2}$/.test(rango.hasta) &&
    rango.desde <= rango.hasta;

  const puedeVerClientes = puedeHacer(perfil, "clientes", "ver");
  const puedeVerPedidos = puedeHacer(perfil, "pedidos", "ver");
  const puedeVerVentas = puedeHacer(perfil, "ventas", "ver");
  const puedeVerProduccion = puedeHacer(perfil, "produccion", "ver");
  const puedeVerGastos = puedeHacer(perfil, "gastos", "ver");
  const puedeVerConfiguracion = puedeHacer(perfil, "configuracion", "ver");
  const puedeVerInicioPedidos = puedeHacer(perfil, "inicio", "verPedidos");
  const puedeVerInicioClientes = puedeHacer(perfil, "inicio", "verClientes");
  const puedeVerInicioIngresos = puedeHacer(perfil, "inicio", "verIngresos");
  const puedeVerInicioProduccion = puedeHacer(perfil, "inicio", "verProduccion");
  const puedeVerInicioAtrasados = puedeHacer(perfil, "inicio", "verAtrasados");
  const puedeVerInicioGrafico = puedeHacer(perfil, "inicio", "verGrafico");
  const puedeVerInicioCuelloBotella = puedeHacer(
    perfil, "inicio", "verCuelloBotella"
  );

  const formatearMoneda = (valor) =>
    new Intl.NumberFormat(perfil?.localeMoneda || "es-AR", {
      style: "currency", currency: perfil?.moneda || "ARS",
      maximumFractionDigits: 2,
    }).format(Number(valor) || 0);

  useEffect(() => {
    let cancelado = false;
    async function cargarEmpresa() {
      if (!perfil?.clienteId || perfil.rol === "superadmin") return;
      try {
        const snapshot = await getDoc(doc(db, "clientes-saas", perfil.clienteId));
        if (cancelado || !snapshot.exists()) return;
        const data = snapshot.data();
        setNombreEmpresa(data.nombreVisible || data.nombre || "Mi Empresa");
        setLogoUrl(data.logoUrl || "");
      } catch (error) {
        console.error("Error al cargar la empresa de Inicio:", error);
      }
    }
    cargarEmpresa();
    return () => { cancelado = true; };
  }, [perfil?.clienteId, perfil?.rol]);

  useEffect(() => {
    if (!perfil?.clienteId || perfil.rol === "superadmin" || !rangoValido) {
      solicitudPeriodoRef.current += 1;
      setCargando(false);
      return;
    }
    const solicitudId = ++solicitudPeriodoRef.current;
    setCargando(true);
    setErrorDashboard("");

    async function cargarMetricasPeriodo() {
      try {
        const argsPeriodo = {
          perfil, fechaDesde: rango.desde, fechaHasta: rango.hasta,
        };
        const [pedidos, comercial, terminados, clientesNuevos] = await Promise.all([
          puedeVerInicioPedidos
            ? obtenerCantidadPedidosPeriodo(argsPeriodo) : Promise.resolve(0),
          puedeVerInicioIngresos
            ? obtenerResumenVentasCobros(argsPeriodo)
            : Promise.resolve({ ventas: 0, cobrado: 0 }),
          puedeVerInicioProduccion
            ? obtenerCantidadFinalizadosPeriodo(argsPeriodo) : Promise.resolve(0),
          puedeVerInicioClientes
            ? obtenerCantidadClientesNuevosPeriodo(argsPeriodo) : Promise.resolve(0),
        ]);

        if (solicitudId !== solicitudPeriodoRef.current) return;
        setStats((actuales) => ({
          ...actuales,
          pedidos, ventas: comercial.ventas, cobrado: comercial.cobrado,
          terminados, clientesNuevos,
        }));
      } catch (error) {
        if (solicitudId !== solicitudPeriodoRef.current) return;
        console.error("Error al cargar dashboard:", error);
        setErrorDashboard("No pudimos actualizar el resumen. Intentá nuevamente.");
      } finally {
        if (solicitudId === solicitudPeriodoRef.current) setCargando(false);
      }
    }

    cargarMetricasPeriodo();
    return () => {
      if (solicitudId === solicitudPeriodoRef.current) {
        solicitudPeriodoRef.current += 1;
      }
    };
  }, [
    perfil, rango.desde, rango.hasta, rangoValido,
    puedeVerInicioPedidos, puedeVerInicioIngresos, puedeVerInicioProduccion,
    puedeVerInicioClientes,
  ]);

  useEffect(() => {
    if (!perfil?.clienteId || perfil.rol === "superadmin") return;
    const solicitudId = ++solicitudEstadoRef.current;

    async function cargarEstadoActual() {
      try {
        const [pedidosPendientes, atrasados, estadoActualProduccion, serie] =
          await Promise.all([
            puedeVerInicioProduccion
              ? obtenerCantidadSinIniciar({ perfil }) : Promise.resolve(0),
            puedeVerInicioAtrasados
              ? obtenerPedidosAtrasadosActuales({ perfil, hoyNegocio: hoy })
              : Promise.resolve({ cantidad: 0, pedidoMasAtrasado: null }),
            puedeVerInicioCuelloBotella
              ? obtenerEstadoActualProduccion({ perfil }) : Promise.resolve([]),
            puedeVerInicioGrafico
              ? obtenerSeriePedidos({ perfil, dias: diasGrafico })
              : Promise.resolve(diasGrafico),
          ]);
        if (solicitudId !== solicitudEstadoRef.current) return;

        const porEtapa = estadoActualProduccion.reduce((acumulado, pedido) => {
          const etapa = pedido.columnaActualNombre || "Sin etapa";
          acumulado[etapa] = (acumulado[etapa] || 0) + 1;
          return acumulado;
        }, {});
        const cuelloBotella = Object.entries(porEtapa).sort(
          (a, b) => b[1] - a[1]
        )[0];
        setStats((actuales) => ({
          ...actuales,
          pedidosPendientes,
          pedidosAtrasados: atrasados.cantidad,
          pedidoMasAtrasado: atrasados.pedidoMasAtrasado,
          cuelloBotellaNombre: cuelloBotella?.[0] || "-",
          cuelloBotellaCantidad: cuelloBotella?.[1] || 0,
        }));
        setPedidosSemana(serie);
      } catch (error) {
        if (solicitudId !== solicitudEstadoRef.current) return;
        console.error("Error al cargar el estado actual de Inicio:", error);
        setErrorDashboard("No pudimos actualizar el resumen. Intentá nuevamente.");
      }
    }

    cargarEstadoActual();
    return () => {
      if (solicitudId === solicitudEstadoRef.current) {
        solicitudEstadoRef.current += 1;
      }
    };
  }, [
    perfil, hoy, diasGrafico, puedeVerInicioProduccion, puedeVerInicioAtrasados,
    puedeVerInicioCuelloBotella, puedeVerInicioGrafico,
  ]);

  const maxPedidosSemana = Math.max(...pedidosSemana.map((d) => d.cantidad), 1);
  const puntosGrafico = pedidosSemana.map((dia, index) => ({
    ...dia, x: (700 / 6) * index,
    y: 190 - (dia.cantidad / maxPedidosSemana) * 130,
  }));
  const lineaGrafico = puntosGrafico
    .map((punto, index) => `${index === 0 ? "M" : "L"} ${punto.x} ${punto.y}`)
    .join(" ");
  const areaGrafico = `${lineaGrafico} L 700 220 L 0 220 Z`;
  const pedidoAtrasadoTexto = stats.pedidoMasAtrasado
    ? `#${stats.pedidoMasAtrasado.id || stats.pedidoMasAtrasado.numeroPedido ||
        stats.pedidoMasAtrasado.firebaseId}`
    : "Sin atrasos";
  const clientePedidoAtrasado =
    stats.pedidoMasAtrasado?.cliente ||
    stats.pedidoMasAtrasado?.clienteNombre || "Todo al día";
  const ventasFormateadas = formatearMoneda(stats.ventas);
  const cobradoFormateado = formatearMoneda(stats.cobrado);
  const claseValorMonetario = (texto) =>
    `inicio-kpi-valor-monetario ${
      texto.length >= 14 ? "muy-largo" : texto.length >= 11 ? "largo" : ""
    }`;

  return (
    <div className="inicio-container">
      <header className="inicio-header">
        <div className="inicio-header-left">
          <div className="inicio-logo-wrap">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo cliente" className="inicio-logo" />
            ) : (
              <div className="inicio-logo inicio-logo-fallback">
                {nombreEmpresa?.charAt(0)?.toUpperCase() || "M"}
              </div>
            )}
          </div>
          <h1>{nombreEmpresa}</h1>
        </div>
      </header>

      <section className="inicio-dashboard-grid">
        <div className="inicio-hero-card">
          <div><span className="inicio-eyebrow">Dashboard</span><h2>Resumen operativo</h2></div>
          <div className="inicio-hero-glow"><FaChartBar /></div>
        </div>

        <div className="inicio-periodo" aria-label="Período del resumen">
          <div className="inicio-periodo-chips">
            {OPCIONES_PERIODO.map(([valor, etiqueta]) => (
              <button key={valor} type="button"
                className={periodo === valor ? "activo" : ""}
                onClick={() => setPeriodo(valor)}>{etiqueta}</button>
            ))}
          </div>
          {periodo === "personalizado" && (
            <div className="inicio-periodo-personalizado">
              <label>Desde<input aria-label="Desde" type="date" value={personalizadoDesde} onChange={(e) => setPersonalizadoDesde(e.target.value)} /></label>
              <label>Hasta<input aria-label="Hasta" type="date" value={personalizadoHasta} onChange={(e) => setPersonalizadoHasta(e.target.value)} /></label>
            </div>
          )}
          <span className="inicio-periodo-rango">
            {rangoValido
              ? `${formatearFechaNegocio(rango.desde)} al ${formatearFechaNegocio(rango.hasta)}`
              : "Revisá el rango seleccionado"}
          </span>
        </div>

        {errorDashboard && <div className="inicio-error">{errorDashboard}</div>}
        <div data-testid="inicio-kpis" aria-busy={cargando} className={`inicio-kpis ${cargando ? "cargando" : ""}`}>
          {puedeVerInicioPedidos && <div data-testid="kpi-pedidos" className="inicio-kpi-card"><FaClipboardList className="inicio-kpi-icon" /><span>Pedidos</span><strong>{stats.pedidos}</strong><small>En el período</small></div>}
          {puedeVerInicioIngresos && <div className="inicio-kpi-card"><FaShoppingCart className="inicio-kpi-icon" /><span>Ventas</span><strong className={claseValorMonetario(ventasFormateadas)} title={ventasFormateadas}>{ventasFormateadas}</strong><small>Total vendido</small></div>}
          {puedeVerInicioIngresos && <div className="inicio-kpi-card"><FaDollarSign className="inicio-kpi-icon" /><span>Cobrado</span><strong className={claseValorMonetario(cobradoFormateado)} title={cobradoFormateado}>{cobradoFormateado}</strong><small>Pagos recibidos</small></div>}
          {puedeVerInicioProduccion && <div className="inicio-kpi-card"><FaClipboardList className="inicio-kpi-icon" /><span>Sin iniciar</span><strong>{stats.pedidosPendientes}</strong><small>Estado actual</small></div>}
          {puedeVerInicioProduccion && <div className="inicio-kpi-card"><FaIndustry className="inicio-kpi-icon" /><span>Finalizados</span><strong>{stats.terminados}</strong><small>En el período</small></div>}
          {puedeVerInicioClientes && <div className="inicio-kpi-card"><FaUsers className="inicio-kpi-icon" /><span>Clientes nuevos</span><strong>{stats.clientesNuevos}</strong><small>En el período</small></div>}
          {puedeVerInicioAtrasados && <div className="inicio-kpi-card inicio-kpi-alerta"><FaExclamationTriangle className="inicio-kpi-icon" /><span>Pedidos atrasados</span><strong>{stats.pedidosAtrasados}</strong><small>Pendientes de entrega</small></div>}
        </div>

        {puedeVerInicioGrafico && (
          <div className="inicio-panel inicio-panel-chart">
            <div className="inicio-panel-header"><div><h3>Evolución semanal</h3><p>Pedidos de los últimos 7 días</p></div></div>
            <div className="inicio-line-chart">
              <svg viewBox="0 0 700 220" preserveAspectRatio="none">
                <defs><linearGradient id="inicioChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00aeef" stopOpacity="0.32" /><stop offset="100%" stopColor="#00aeef" stopOpacity="0.02" /></linearGradient><linearGradient id="inicioChartLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0096d1" /><stop offset="100%" stopColor="#36d6ff" /></linearGradient></defs>
                <path className="inicio-chart-grid-line" d="M 0 40 H 700 M 0 90 H 700 M 0 140 H 700 M 0 190 H 700" />
                {lineaGrafico && <><path className="inicio-chart-area" d={areaGrafico} /><path className="inicio-chart-line" d={lineaGrafico} /></>}
                {puntosGrafico.map((p) => <g key={p.fecha}><circle cx={p.x} cy={p.y} r="6" className="inicio-chart-point" /><title>{`${p.label}: ${p.cantidad} pedidos`}</title></g>)}
              </svg>
            </div>
            <div className="inicio-chart-labels">{pedidosSemana.map((d, index) => <span key={d.fecha}>{index === pedidosSemana.length - 1 ? "Hoy" : d.label}</span>)}</div>
          </div>
        )}

        {puedeVerInicioCuelloBotella && (
          <div className="inicio-panel">
            <div className="inicio-panel-header"><div><h3>Cuello de botella</h3><p>Estado actual</p></div></div>
            <div className="inicio-production-list"><div className="inicio-production-row"><span>Etapa crítica</span><strong>{stats.cuelloBotellaNombre}</strong></div><div className="inicio-progress"><div style={{ width: `${Math.min(stats.cuelloBotellaCantidad * 10, 100)}%` }} /></div><div className="inicio-production-row"><span>Pedidos acumulados</span><strong>{stats.cuelloBotellaCantidad}</strong></div></div>
          </div>
        )}

        {puedeVerInicioAtrasados && (
          <div className="inicio-panel inicio-panel-danger">
            <div className="inicio-panel-header"><div><h3>Pedido más atrasado</h3><p>Situación actual</p></div></div>
            <div className="inicio-overdue-number">{pedidoAtrasadoTexto}</div>
            <span className="inicio-overdue-date">{clientePedidoAtrasado}</span>
          </div>
        )}

        <div className="inicio-panel inicio-panel-accesos">
          <div className="inicio-panel-header"><div><h3>Accesos rápidos</h3><p>Módulos principales</p></div></div>
          <section className="accesos-rapidos">
            {puedeVerPedidos && <button type="button" onClick={() => onNavigate("pedidos")} className="modulo"><FaClipboardList className="icon" /><span>Pedidos</span></button>}
            {puedeVerVentas && <button type="button" onClick={() => onNavigate("ventas")} className="modulo"><FaReceipt className="icon" /><span>Ventas</span></button>}
            {puedeVerProduccion && <button type="button" onClick={() => onNavigate("produccion")} className="modulo"><FaIndustry className="icon" /><span>Producción</span></button>}
            {puedeVerClientes && <button type="button" onClick={() => onNavigate("clientes")} className="modulo"><FaUsers className="icon" /><span>Clientes</span></button>}
            {puedeVerGastos && <button type="button" onClick={() => onNavigate("gastos")} className="modulo"><FaDollarSign className="icon" /><span>Gastos</span></button>}
            {puedeVerConfiguracion && <button type="button" onClick={() => onNavigate("configuracion")} className="modulo"><FaCog className="icon" /><span>Configuración</span></button>}
          </section>
        </div>
      </section>
    </div>
  );
}
