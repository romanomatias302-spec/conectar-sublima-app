import React, { useEffect, useMemo, useState } from "react";
import { obtenerMovimientosPaginados } from "../../firebase/movimientos";
import { obtenerHistorialProduccionGlobal } from "../../firebase/informesProduccion";
import { obtenerEstadoActualProduccion } from "../../firebase/informesProduccion";
import * as XLSX from "xlsx";

function formatearMoneda(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function fechaInput(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function rangoHoy() {
  const hoy = new Date();
  return { desde: fechaInput(hoy), hasta: fechaInput(hoy) };
}

function rangoAyer() {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  return { desde: fechaInput(ayer), hasta: fechaInput(ayer) };
}

function rangoUltimosDias(dias) {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(hasta.getDate() - dias + 1);
  return { desde: fechaInput(desde), hasta: fechaInput(hasta) };
}

function obtenerFechaHaceDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
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
  const [vistaActiva, setVistaActiva] = useState("resumen");
  const [movimientos, setMovimientos] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [historialProduccion, setHistorialProduccion] = useState([]);
  const [loadingProduccion, setLoadingProduccion] = useState(false);
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [filtroDesdeProduccion, setFiltroDesdeProduccion] = useState(
    obtenerFechaHaceDias(7).toISOString().slice(0, 10)
  );
  const [filtroHastaProduccion, setFiltroHastaProduccion] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [estadoActualProduccion, setEstadoActualProduccion] = useState([]);
const [loadingEstadoActual, setLoadingEstadoActual] = useState(false);
const [filtroUsuarioProduccion, setFiltroUsuarioProduccion] = useState("");
const hoyDefault = rangoHoy();

const [rangoFinanzasActivo, setRangoFinanzasActivo] = useState("hoy");
const [fechaDesdeFinanzas, setFechaDesdeFinanzas] = useState(hoyDefault.desde);
const [fechaHastaFinanzas, setFechaHastaFinanzas] = useState(hoyDefault.hasta);
const [tipoMovimientoFiltro, setTipoMovimientoFiltro] = useState("");
const [exportandoExcel, setExportandoExcel] = useState(false);
const [mensajeExportacion, setMensajeExportacion] = useState("");
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

const cargarEstadoActualProduccion = async () => {
  try {
    setLoadingEstadoActual(true);
    const res = await obtenerEstadoActualProduccion({ perfil });
    setEstadoActualProduccion(res);
  } catch (error) {
    console.error("Error cargando estado actual producción:", error);
  } finally {
    setLoadingEstadoActual(false);
  }
};

const cargarMovimientos = async () => {
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
};

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

const aplicarRangoRapidoFinanzas = (rango) => {
  setRangoFinanzasActivo(rango);

  if (rango === "hoy") {
    const r = rangoHoy();
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }

  if (rango === "ayer") {
    const r = rangoAyer();
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }

  if (rango === "7dias") {
    const r = rangoUltimosDias(7);
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }

  if (rango === "30dias") {
    const r = rangoUltimosDias(30);
    setFechaDesdeFinanzas(r.desde);
    setFechaHastaFinanzas(r.hasta);
  }
};

const exportarMovimientosCSV = async () => {
  try {
    setMensajeExportacion("");

    if (exportandoExcel) return;

    if (!movimientos.length) {
      setMensajeExportacion("No hay movimientos para exportar en el período seleccionado.");
      return;
    }

    setExportandoExcel(true);
    setMensajeExportacion("Preparando descarga...");

    await new Promise((resolve) => setTimeout(resolve, 300));

    const datos = movimientos.map((m) => ({
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

const cargarHistorialProduccion = async () => {
  try {
    setLoadingProduccion(true);

    const historial = await obtenerHistorialProduccionGlobal({
      perfil,
      fechaDesde: filtroDesdeProduccion,
      fechaHasta: filtroHastaProduccion,
    });

    setHistorialProduccion(historial);
  } catch (error) {
    console.error("Error cargando historial global de producción:", error);
  } finally {
    setLoadingProduccion(false);
  }
};

useEffect(() => {
  cargarMovimientos();
}, [perfil, fechaDesdeFinanzas, fechaHastaFinanzas, tipoMovimientoFiltro]);

  const resumen = useMemo(() => {
    const ingresos = movimientos.filter((m) => m.tipo === "ingreso");
    const egresos = movimientos.filter((m) => m.tipo === "egreso");

    const totalIngresos = ingresos.reduce((acc, m) => acc + (Number(m.monto) || 0), 0);
    const totalEgresos = egresos.reduce((acc, m) => acc + (Number(m.monto) || 0), 0);

    return {
      totalIngresos,
      totalEgresos,
      resultado: totalIngresos - totalEgresos,
      cantidadIngresos: ingresos.length,
      cantidadEgresos: egresos.length,
      cantidadMovimientos: movimientos.length,
    };
  }, [movimientos]);

useEffect(() => {
  if (vistaActiva === "produccion") {
    cargarHistorialProduccion();
    cargarEstadoActualProduccion();
  }
}, [vistaActiva, perfil]);

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
      </div>
    
     

      {(vistaActiva === "resumen" || vistaActiva === "finanzas") && (
  <div
    style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 16,
      marginBottom: 18,
      display: "flex",
      gap: 10,
      alignItems: "end",
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
    <div>
      <label style={{ fontSize: 13, fontWeight: 700 }}>Tipo</label>
      <select
        value={tipoMovimientoFiltro}
        onChange={(e) => setTipoMovimientoFiltro(e.target.value)}
        style={{
          display: "block",
          padding: "9px 10px",
          marginTop: 4,
          minWidth: 140,
          height: 38,
        }}
      >
        <option value="">Todos</option>
        <option value="ingreso">Ingresos</option>
        <option value="egreso">Egresos</option>
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
)}

      {loading && <p>Cargando informes...</p>}

      {!loading && vistaActiva === "resumen" && (
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

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Movimientos cargados</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{resumen.cantidadMovimientos}</div>
          </div>
        </div>
      )}

      {!loading && vistaActiva === "finanzas" && (
        <>
          {(() => {
            const ingresos = movimientos
              .filter((m) => (m.tipo || "").toLowerCase() === "ingreso")
              .reduce((acc, m) => acc + (Number(m.monto) || 0), 0);

            const egresos = movimientos
              .filter((m) => (m.tipo || "").toLowerCase() === "egreso")
              .reduce((acc, m) => acc + (Number(m.monto) || 0), 0);

            const resultado = ingresos - egresos;

            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:13, color:"#666", marginBottom:6 }}>Ingresos del período</div>
                  <div style={{ fontSize:24, fontWeight:800 }}>{formatearMoneda(ingresos)}</div>
                </div>

                <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:13, color:"#666", marginBottom:6 }}>Egresos del período</div>
                  <div style={{ fontSize:24, fontWeight:800 }}>{formatearMoneda(egresos)}</div>
                </div>

                <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:13, color:"#666", marginBottom:6 }}>Resultado neto</div>
                  <div style={{ fontSize:24, fontWeight:800 }}>{formatearMoneda(resultado)}</div>
                </div>

                <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:13, color:"#666", marginBottom:6 }}>Cantidad movimientos</div>
                  <div style={{ fontSize:24, fontWeight:800 }}>{movimientos.length}</div>
                </div>
              </div>
            );
          })()}
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
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.firebaseId}>
                  <td>{m.fecha}</td>
                  <td>{m.tipo}</td>
                  <td>{m.subtipo}</td>
                  <td>{m.descripcion}</td>
                  <td>{m.medioPago}</td>
                  <td>{formatearMoneda(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {!loading && hayMas && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button onClick={cargarMas}>Cargar más</button>
            </div>
          )}
        </>
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
          const movimientosValidos = historialFiltrado.filter(
            (h) => Number(h.duracionEnOrigenMinutos) > 0
          );

          const totalMovimientos = historialFiltrado.length;

          const pedidosFinalizados = historialFiltrado.filter(
            (h) => h.pedidoFinalizado === true
          ).length;

          const promedioGeneralMinutos = movimientosValidos.length
            ? Math.round(
                movimientosValidos.reduce(
                  (acc, h) => acc + (Number(h.duracionEnOrigenMinutos) || 0),
                  0
                ) / movimientosValidos.length
              )
            : 0;

     const productividadPorUsuarioEtapa = {};

movimientosValidos.forEach((h) => {
  const usuarioKey =
    h.usuarioAsignadoUid ||
    h.usuarioAsignadoNombre ||
    "sin_asignar";

  const usuarioNombre = h.usuarioAsignadoNombre || "Sin asignar";
  const etapa = h.columnaOrigenNombre || "Sin etapa";
  const key = `${usuarioKey}_${etapa}`;

  if (!productividadPorUsuarioEtapa[key]) {
    productividadPorUsuarioEtapa[key] = {
      usuario: usuarioNombre,
      etapa,
      intervenciones: 0,
      totalMinutos: 0,
      peorCasoMinutos: 0,
    };
  }

  productividadPorUsuarioEtapa[key].intervenciones += 1;
  productividadPorUsuarioEtapa[key].totalMinutos +=
    Number(h.duracionEnOrigenMinutos) || 0;

  productividadPorUsuarioEtapa[key].peorCasoMinutos = Math.max(
    productividadPorUsuarioEtapa[key].peorCasoMinutos,
    Number(h.duracionEnOrigenMinutos) || 0
  );
});

const productividadKpi = Object.values(productividadPorUsuarioEtapa)
  .map((item) => ({
    ...item,
    promedioMinutos: item.intervenciones
      ? Math.round(item.totalMinutos / item.intervenciones)
      : 0,
  }))
  .sort((a, b) => b.promedioMinutos - a.promedioMinutos);

    const porEtapa = {};

    movimientosValidos.forEach((h) => {
      const etapa = h.columnaOrigenNombre || "Sin etapa";

      if (!porEtapa[etapa]) {
        porEtapa[etapa] = {
          etapa,
          totalMinutos: 0,
          peorCasoMinutos: 0,
          intervenciones: 0,
        };
      }

      porEtapa[etapa].intervenciones += 1;
      porEtapa[etapa].totalMinutos += Number(h.duracionEnOrigenMinutos) || 0;
      porEtapa[etapa].peorCasoMinutos = Math.max(
        porEtapa[etapa].peorCasoMinutos,
        Number(h.duracionEnOrigenMinutos) || 0
      );
    });

    const etapasKpi = Object.values(porEtapa)
      .map((e) => ({
        ...e,
        promedioMinutos: e.intervenciones
          ? Math.round(e.totalMinutos / e.intervenciones)
          : 0,
      }))
      .sort((a, b) => b.promedioMinutos - a.promedioMinutos);

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
    </div>
  );
}