import React, { useEffect, useMemo, useState } from "react";
import "./Inicio.css";
import {
  FaBox,
  FaUsers,
  FaClipboardList,
  FaChartBar,
  FaCog,
} from "react-icons/fa";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { puedeHacer } from "../../utils/permisos";

export default function Inicio({ onNavigate, perfil }) {
  const [stats, setStats] = useState({
    pedidosHoy: 0,
    clientesTotales: 0,
    pedidosPendientes: 0,
    pedidosTotales: 0,
  });

  const [nombreEmpresa, setNombreEmpresa] = useState("Mi Empresa");
  const [logoUrl, setLogoUrl] = useState("");

  const hoy = useMemo(() => {
    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const puedeVerClientes = puedeHacer(perfil, "clientes", "ver");
  const puedeVerPedidos = puedeHacer(perfil, "pedidos", "ver");
  const puedeVerConfiguracion = puedeHacer(perfil, "configuracion", "ver");

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
        if (!clienteId) return;

        const clienteSaasRef = doc(db, "clientes-saas", clienteId);
        const clienteSaasSnap = await getDoc(clienteSaasRef);

        if (clienteSaasSnap.exists()) {
          const data = clienteSaasSnap.data();
          setNombreEmpresa(data.nombreVisible || data.nombre || "Mi Empresa");
          setLogoUrl(data.logoUrl || "");
        }

        const pedidosQ = query(
          collection(db, "pedidos"),
          where("clienteId", "==", clienteId)
        );
        const pedidosSnap = await getDocs(pedidosQ);
        const pedidos = pedidosSnap.docs.map((d) => d.data());

        const clientesQ = query(
          collection(db, "clientes"),
          where("clienteId", "==", clienteId)
        );
        const clientesSnap = await getDocs(clientesQ);

        const pedidosHoy = pedidos.filter((p) => p.fechaPedido === hoy).length;
        const pedidosPendientes = pedidos.filter(
          (p) => p.estado === "Pendiente"
        ).length;

        setStats({
          pedidosHoy,
          clientesTotales: clientesSnap.size,
          pedidosPendientes,
          pedidosTotales: pedidos.length,
        });
      } catch (error) {
        console.error("Error al cargar dashboard:", error);
      }
    };

    cargarDashboard();
  }, [perfil, hoy]);

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

      <section className="resumen-cards">
        <div className="card kpi-card">
          <p>Pedidos Hoy</p>
          <h2>{stats.pedidosHoy}</h2>
        </div>

        <div className="card kpi-card">
          <p>Clientes Totales</p>
          <h2>{stats.clientesTotales}</h2>
        </div>

        <div className="card kpi-card">
          <p>Pedidos Pendientes</p>
          <h2>{stats.pedidosPendientes}</h2>
        </div>

        <div className="card kpi-card">
          <p>Pedidos Totales</p>
          <h2>{stats.pedidosTotales}</h2>
        </div>
      </section>

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
  );
}