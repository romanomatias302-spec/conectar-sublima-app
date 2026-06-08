import React, { useEffect, useMemo, useState } from "react";
import "./Inicio.css";
import {
  FaUsers,
  FaClipboardList,
  FaCog,
  FaDollarSign,
  FaExclamationTriangle,
  FaIndustry,
  FaChartBar,
} from "react-icons/fa";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  
} from "firebase/firestore";
import { db } from "../../firebase";
import { puedeHacer } from "../../utils/permisos";
import { obtenerEstadoActualProduccion } from "../../firebase/informesProduccion";


export default function Inicio({ onNavigate, perfil }) {
const [stats, setStats] = useState({
  pedidosHoy: 0,
  clientesTotales: 0,
  pedidosPendientes: 0,
  pedidosTotales: 0,

  ingresosHoy: 0,
  produccionEnProceso: 0,
  pedidoMasAtrasado: null,
  terminadosHoy: 0,
  clientesNuevosHoy: 0,
  pedidosAtrasados30: 0,
  cuelloBotellaNombre: "-",
  cuelloBotellaCantidad: 0,
});

  const [nombreEmpresa, setNombreEmpresa] = useState("Mi Empresa");
  const [logoUrl, setLogoUrl] = useState("");
  const [pedidosSemana, setPedidosSemana] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);

  const hoy = useMemo(() => {
    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const ultimos7Dias = useMemo(() => {
  const dias = [];

  for (let i = 6; i >= 0; i--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);

    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");

    dias.push({
      fecha: `${yyyy}-${mm}-${dd}`,
      label: fecha.toLocaleDateString("es-AR", { weekday: "short" }),
      cantidad: 0,
    });
  }

  return dias;
}, []);

  const puedeVerClientes = puedeHacer(perfil, "clientes", "ver");
  const puedeVerPedidos = puedeHacer(perfil, "pedidos", "ver");
  const puedeVerConfiguracion = puedeHacer(perfil, "configuracion", "ver");
  const puedeVerInicioPedidos = puedeHacer(perfil, "inicio", "verPedidos");
  const puedeVerInicioClientes = puedeHacer(perfil, "inicio", "verClientes");
  const puedeVerInicioIngresos = puedeHacer(perfil, "inicio", "verIngresos");
  const puedeVerInicioProduccion = puedeHacer(perfil, "inicio", "verProduccion");
  const puedeVerInicioAtrasados = puedeHacer(perfil, "inicio", "verAtrasados");
  const puedeVerInicioGrafico = puedeHacer(perfil, "inicio", "verGrafico");
  const puedeVerInicioCuelloBotella = puedeHacer(perfil, "inicio", "verCuelloBotella");

  useEffect(() => {
    const cargarDashboard = async () => {
      try {
        if (!perfil) return;

        if (perfil.rol === "superadmin") {
          setNombreEmpresa("Panel Dueño SaaS");
          setLogoUrl("");
          return;
        }

        const clienteId = perfil.clienteId;
        console.log("DASHBOARD clienteId usado:", clienteId);
        if (!clienteId) return;

        const clienteSaasRef = doc(db, "clientes-saas", clienteId);
        const clienteSaasSnap = await getDoc(clienteSaasRef);

        if (clienteSaasSnap.exists()) {
          const data = clienteSaasSnap.data();
          setNombreEmpresa(data.nombreVisible || data.nombre || "Mi Empresa");
          setLogoUrl(data.logoUrl || "");
        }

        const pedidosRef = collection(db, "pedidos");
        const clientesRef = collection(db, "clientes");
        const ventasRef = collection(db, "ventas");

        const inicioHoy = new Date();
        inicioHoy.setHours(0, 0, 0, 0);

        const finHoy = new Date();
        finHoy.setHours(23, 59, 59, 999);

        const hace30Dias = new Date();
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        const hace30DiasStr = hace30Dias.toISOString().slice(0, 10);

        const inicioSemanaStr = ultimos7Dias[0]?.fecha;

        const pedidosSemanaQ = query(
          pedidosRef,
          where("clienteId", "==", clienteId),
          where("fechaPedido", ">=", inicioSemanaStr),
          where("fechaPedido", "<=", hoy)
        );

        const pedidosHoyQ = query(
          pedidosRef,
          where("clienteId", "==", clienteId),
          where("fechaPedido", "==", hoy)
        );

        const pedidosSinIniciarQ = query(
          pedidosRef,
          where("clienteId", "==", clienteId),
          where("estadoProduccion", "==", "pendiente")
        );

        const terminadosHoyQ = query(
          pedidosRef,
          where("clienteId", "==", clienteId),
          where("estadoProduccion", "==", "finalizado"),
          where("produccionActualizadoAt", ">=", inicioHoy),
          where("produccionActualizadoAt", "<=", finHoy)
        );

        const clientesNuevosHoyQ = query(
          clientesRef,
          where("clienteId", "==", clienteId),
          where("createdAt", ">=", inicioHoy),
          where("createdAt", "<=", finHoy)
        );

        const ingresosHoyQ = query(
          ventasRef,
          where("clienteId", "==", clienteId),
          where("fechaVenta", "==", hoy)
        );

        const pedidosAtrasados30Q = query(
          pedidosRef,
          where("clienteId", "==", clienteId),
          where("fechaEntrega", ">=", hace30DiasStr),
          where("fechaEntrega", "<", hoy)
        );

      const pedidosHoySnap = puedeVerInicioPedidos
        ? await getCountFromServer(pedidosHoyQ)
        : null;

      const pedidosSinIniciarSnap = puedeVerInicioProduccion
        ? await getCountFromServer(pedidosSinIniciarQ)
        : null;

      const terminadosHoySnap = puedeVerInicioProduccion
        ? await getCountFromServer(terminadosHoyQ)
        : null;

      const clientesNuevosHoySnap = puedeVerInicioClientes
        ? await getCountFromServer(clientesNuevosHoyQ)
        : null;

      const ingresosHoySnap = puedeVerInicioIngresos
        ? await getDocs(ingresosHoyQ)
        : null;

      const pedidosAtrasados30Snap = puedeVerInicioAtrasados
        ? await getDocs(pedidosAtrasados30Q)
        : null;

      const estadoActualProduccion = puedeVerInicioCuelloBotella
        ? await obtenerEstadoActualProduccion({ perfil })
        : [];

      const pedidosSemanaSnap = puedeVerInicioGrafico
        ? await getDocs(pedidosSemanaQ)
        : null;
        

      const ventasHoy = ingresosHoySnap
        ? ingresosHoySnap.docs
            .map((d) => ({
              firebaseId: d.id,
              ...d.data(),
            }))
            .filter((venta) => venta.estadoVenta !== "anulada")
        : [];

        const ingresosHoy = ventasHoy.reduce((acc, venta) => {
          return acc + Number(venta.totalPagado || 0);
        }, 0);

        const pedidosAtrasados30 = pedidosAtrasados30Snap
          ? pedidosAtrasados30Snap.docs
              .map((d) => ({
                firebaseId: d.id,
                ...d.data(),
              }))
              .filter((p) => p.estadoProduccion !== "finalizado")
          : [];

        const porEtapaActual = {};

        estadoActualProduccion.forEach((p) => {
          const etapa = p.columnaActualNombre || "Sin etapa";

          if (!porEtapaActual[etapa]) {
            porEtapaActual[etapa] = {
              etapa,
              cantidad: 0,
              totalMin: 0,
            };
          }

          porEtapaActual[etapa].cantidad += 1;
          porEtapaActual[etapa].totalMin += Number(p.minutosSinMover || 0);
        });

        const etapasActuales = Object.values(porEtapaActual)
          .map((e) => ({
            ...e,
            promedioMin: e.cantidad ? Math.round(e.totalMin / e.cantidad) : 0,
          }))
          .sort((a, b) => b.cantidad - a.cantidad);

        const cuelloBotella = etapasActuales[0] || null;

        const pedidoMasAtrasado =
          pedidosAtrasados30.sort((a, b) =>
            String(a.fechaEntrega || "").localeCompare(String(b.fechaEntrega || ""))
          )[0] || null;

          const pedidosSemanaMap = {};

          ultimos7Dias.forEach((d) => {
            pedidosSemanaMap[d.fecha] = { ...d };
          });

          if (pedidosSemanaSnap) {
            pedidosSemanaSnap.docs.forEach((docu) => {
              const pedido = docu.data();
              const fecha = pedido.fechaPedido;

              if (pedidosSemanaMap[fecha]) {
                pedidosSemanaMap[fecha].cantidad += 1;
              }
            });
          }

          setPedidosSemana(Object.values(pedidosSemanaMap));

      setStats({
        pedidosHoy: pedidosHoySnap?.data().count || 0,
        clientesTotales: 0,
        pedidosPendientes: pedidosSinIniciarSnap?.data().count || 0,
        pedidosTotales: 0,

        ingresosHoy,
        produccionEnProceso: 0,
        pedidoMasAtrasado,

        terminadosHoy: terminadosHoySnap?.data().count || 0,
        clientesNuevosHoy: clientesNuevosHoySnap?.data().count || 0,
        pedidosAtrasados30: pedidosAtrasados30.length,
        cuelloBotellaNombre: cuelloBotella?.etapa || "-",
        cuelloBotellaCantidad: cuelloBotella?.cantidad || 0,
      });
      } catch (error) {
        console.error("Error al cargar dashboard:", error);
      }
    };

    cargarDashboard();
  }, [perfil, hoy]);

  const maxPedidosSemana = Math.max(
    ...pedidosSemana.map((d) => d.cantidad),
    1
  );

  const puntosGrafico = pedidosSemana.map((d, index) => {
    const x = (700 / 6) * index;
    const y = 190 - (d.cantidad / maxPedidosSemana) * 130;

    return {
      ...d,
      x,
      y,
    };
  });

  const lineaGrafico = puntosGrafico
    .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaGrafico = `${lineaGrafico} L 700 220 L 0 220 Z`;

  const pedidoAtrasadoTexto = stats.pedidoMasAtrasado
  ? `#${stats.pedidoMasAtrasado.id || stats.pedidoMasAtrasado.numeroPedido || stats.pedidoMasAtrasado.firebaseId}`
  : "Sin atrasos";

const clientePedidoAtrasado =
  stats.pedidoMasAtrasado?.cliente ||
  stats.pedidoMasAtrasado?.clienteNombre ||
  "Todo al día";



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

          <div>
            <h1>{nombreEmpresa}</h1>
          </div>
        </div>
      </header>

      <section className="inicio-dashboard-grid">
        <div className="inicio-hero-card">
          <div>
            <span className="inicio-eyebrow">Dashboard</span>
            <h2>Resumen operativo</h2>

          </div>

          <div className="inicio-hero-glow">
            <FaChartBar />
          </div>
        </div>

        <div className="inicio-kpis">
          {puedeVerInicioPedidos && (
            <div className="inicio-kpi-card">
              <FaClipboardList className="inicio-kpi-icon" />
              <span>Pedidos hoy</span>
              <strong>{stats.pedidosHoy}</strong>
            </div>
          )}


          {puedeVerInicioProduccion && (    
            <div className="inicio-kpi-card">
              <FaClipboardList className="inicio-kpi-icon" />
              <span>Sin iniciar</span>
              <strong>{stats.pedidosPendientes}</strong>
            </div>
           )}


          {puedeVerInicioProduccion && (  
            <div className="inicio-kpi-card">
              <FaIndustry className="inicio-kpi-icon" />
            <span>Terminados hoy</span>
            <strong>{stats.terminadosHoy}</strong>
            </div>
          )}

          {puedeVerInicioClientes && (  
            <div className="inicio-kpi-card">
              <FaUsers className="inicio-kpi-icon" />
            <span>Clientes nuevos hoy</span>
            <strong>{stats.clientesNuevosHoy}</strong>
            </div>
          )}

          {puedeVerInicioIngresos && (
            <div className="inicio-kpi-card">
              <FaDollarSign className="inicio-kpi-icon" />
              <span>Ingresos hoy</span>
              <strong>${stats.ingresosHoy.toLocaleString("es-AR")}</strong>
            </div>
          )}  

          {puedeVerInicioAtrasados && (  
            <div className="inicio-kpi-card inicio-kpi-alerta">
              <FaExclamationTriangle className="inicio-kpi-icon" />
              <span>Atrasados 30 días</span>
              <strong>{stats.pedidosAtrasados30}</strong>
            </div>
          )}   
        </div>

        <div className="inicio-panel inicio-panel-chart">

        {puedeVerInicioGrafico && (
          <div className="inicio-panel-header">
            <div>
              <h3>Evolución semanal</h3>
              <p>Pedidos de los últimos días</p>
            </div>
          </div>
        )}  

<div className="inicio-line-chart">
  <svg viewBox="0 0 700 220" preserveAspectRatio="none">
    <defs>
      <linearGradient id="inicioChartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#00aeef" stopOpacity="0.32" />
        <stop offset="100%" stopColor="#00aeef" stopOpacity="0.02" />
      </linearGradient>

      <linearGradient id="inicioChartLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0096d1" />
        <stop offset="100%" stopColor="#36d6ff" />
      </linearGradient>
    </defs>

    <path
      className="inicio-chart-grid-line"
      d="M 0 40 H 700 M 0 90 H 700 M 0 140 H 700 M 0 190 H 700"
    />

      {lineaGrafico && (
        <>
          <path className="inicio-chart-area" d={areaGrafico} />
          <path className="inicio-chart-line" d={lineaGrafico} />
        </>
      )}

    {puntosGrafico.map((p) => (
      <g key={p.fecha}>
        <circle
          cx={p.x}
          cy={p.y}
          r="6"
          className="inicio-chart-point"
        />
        <title>{`${p.label}: ${p.cantidad} pedidos`}</title>
      </g>
    ))}
  </svg>
</div>

        <div className="inicio-chart-labels">
          {pedidosSemana.map((d, index) => (
            <span key={d.fecha}>
              {index === pedidosSemana.length - 1 ? "Hoy" : d.label}
            </span>
          ))}
        </div>
        </div>


        {puedeVerInicioCuelloBotella && (    
          <div className="inicio-panel">
            <div className="inicio-panel-header">
              <div>
                <h3>Cuello de botella</h3>
                <p>Últimos 30 días</p>
              </div>
            </div>

            <div className="inicio-production-list">
              <div className="inicio-production-row">
                <span>Etapa crítica</span>
                <strong>{stats.cuelloBotellaNombre}</strong>
              </div>

              <div className="inicio-progress">
                <div style={{ width: `${Math.min(stats.cuelloBotellaCantidad * 10, 100)}%` }} />
              </div>

              <div className="inicio-production-row">
                <span>Pedidos acumulados</span>
                <strong>{stats.cuelloBotellaCantidad}</strong>
              </div>
            </div>
          </div>
        )}


        {puedeVerInicioAtrasados && (
          <div className="inicio-panel inicio-panel-danger">
            <div className="inicio-panel-header">
              <div>
                <h3>Pedidos atrasados</h3>
                <p>Últimos 30 días</p>
              </div>
            </div>

            <div className="inicio-overdue-number">
              {stats.pedidosAtrasados30}
            </div>

            <span className="inicio-overdue-date">
              {stats.pedidosAtrasados30 > 0 ? "Revisar producción" : "Sin atrasos recientes"}
            </span>
          </div>
        )}  

        <div className="inicio-panel">
          <div className="inicio-panel-header">
            <div>
              <h3>Accesos rápidos</h3>
              <p>Módulos principales</p>
            </div>
          </div>

      

      <section className="accesos-rapidos">
        {puedeVerPedidos && (
          <div onClick={() => onNavigate("pedidos")} className="modulo">
            <FaClipboardList className="icon" />
            <span>Pedidos</span>
          </div>
        )}

        {puedeVerClientes && (
          <div onClick={() => onNavigate("listado")} className="modulo">
            <FaUsers className="icon" />
            <span>Clientes</span>
          </div>
        )}

        {puedeVerConfiguracion && (
          <div onClick={() => onNavigate("configuracion")} className="modulo">
            <FaCog className="icon" />
            <span>Configuración</span>
          </div>
        )}

        {/* Dejamos ocultos por ahora hasta tener módulo/permisos reales */}
        {/* <div className="modulo">
          <FaBox className="icon" />
          <span>Productos</span>
        </div>

        <div className="modulo">
          <FaChartBar className="icon" />
          <span>Estadísticas</span>
        </div> */}
      </section>

      </div> 

      </section> 

    </div> 
  );
}