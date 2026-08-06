import React, { useEffect, useMemo, useState } from "react";
import {
  abrirCaja,
  cerrarCaja,
  crearMovimientoManualCaja,
  crearCambioTurnoCaja,
  
  obtenerCajaDelDia,
  obtenerMovimientosCajaDia,
  obtenerUltimaCajaCerradaAnterior,
  obtenerUltimaCajaAnteriorConSaldo,
  reabrirCaja,
  obtenerHistorialCajas,
  corregirAperturaCaja,
  escucharCajaDelDia,
  escucharMovimientosCajaDia,

} from "../../firebase/cajas";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { puedeHacer } from "../../utils/permisos";
import { fechaHoyNegocio } from "../../utils/fechas";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";

function formatearFechaCaja(fechaISO) {
  if (!fechaISO) return "-";
  const [yyyy, mm, dd] = fechaISO.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

export default function CajaPage({ perfil, onVerVenta }) {
const fechaCaja = fechaHoyNegocio(perfil);

  const [caja, setCaja] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalSeleccionadaId, setSucursalSeleccionadaId] = useState("principal");
  const [cajaAnterior, setCajaAnterior] = useState(null);
  const [saldoAnteriorInfo, setSaldoAnteriorInfo] = useState({
    label: "Cierre anterior",
    saldo: 0,
    sinCierreAnterior: false,
  });
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const [saldoApertura, setSaldoApertura] = useState(0);
  const [corrigiendoApertura, setCorrigiendoApertura] = useState(false);
  const [saldoCierreReal, setSaldoCierreReal] = useState("");

  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalCambioTurno, setModalCambioTurno] = useState(false);
  const [efectivoTurno, setEfectivoTurno] = useState("");
  const [observacionTurno, setObservacionTurno] = useState("");
  const [historialSucursalId, setHistorialSucursalId] = useState("actual");

  const [tipoManual, setTipoManual] = useState("egreso");
  const [subtipoManual, setSubtipoManual] = useState("gasto_caja");
  const [montoManual, setMontoManual] = useState("");
  const [descripcionManual, setDescripcionManual] = useState("");
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

const [historialCajas, setHistorialCajas] = useState([]);

const [loadingHistorial, setLoadingHistorial] = useState(false);
const [historialDesde, setHistorialDesde] = useState("");
const [historialHasta, setHistorialHasta] = useState("");
const [cajaHistorialAbiertaId, setCajaHistorialAbiertaId] = useState(null);
const [movimientosHistorial, setMovimientosHistorial] = useState({});
  const [filtroTipoMovimiento, setFiltroTipoMovimiento] = useState("");

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);
  const puedeAbrirCerrarCaja =
  puedeHacer(perfil, "caja", "abrirCerrar");

const puedeCrearMovimientoCaja =
  puedeHacer(perfil, "caja", "crearMovimiento");

const puedeCorregirAperturaCaja =
  puedeHacer(perfil, "caja", "corregirApertura");

const puedeVerHistorialCaja =
  puedeHacer(perfil, "caja", "historial");
  
 
const movimientosFiltrados = useMemo(() => {
  if (!filtroTipoMovimiento) return movimientos;

  return movimientos.filter((m) => m.tipo === filtroTipoMovimiento);
}, [movimientos, filtroTipoMovimiento]);

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
  if (!perfil?.clienteId) return;

  const q = query(
    collection(db, "sucursales"),
    where("clienteId", "==", perfil.clienteId)
  );

  const unsub = onSnapshot(q, (snap) => {
    const lista = snap.docs
      .map((d) => ({
        firebaseId: d.id,
        ...d.data(),
      }))
      .filter((s) => s.activa !== false)
      .sort((a, b) => {
        if (a.esPrincipal) return -1;
        if (b.esPrincipal) return 1;
        return (a.nombre || "").localeCompare(b.nombre || "");
      });

     const listaNormalizada = lista.map((s) => {
      const esPrincipal =
        s.esPrincipal === true ||
        s.codigo === "principal" ||
        String(s.firebaseId || "").endsWith("_principal");

      return {
        ...s,
        firebaseId: esPrincipal ? "principal" : s.firebaseId,
        esPrincipal,
      };
    }); 

    const permitidasUsuario =
      perfil?.rol === "admin"
        ? null
        : Array.isArray(perfil?.sucursalesPermitidas) &&
          perfil.sucursalesPermitidas.length
        ? perfil.sucursalesPermitidas
        : ["principal"];

    const listaPermitida = permitidasUsuario
      ? listaNormalizada.filter((s) => permitidasUsuario.includes(s.firebaseId))
      : listaNormalizada;

    setSucursales(listaPermitida);

const defaultUsuario = perfil?.sucursalDefaultId || "principal";

if (!listaPermitida.some((s) => s.firebaseId === sucursalSeleccionadaId)) {
  const sucursalDefault =
    listaPermitida.find((s) => s.firebaseId === defaultUsuario) ||
    listaPermitida.find((s) => s.esPrincipal) ||
    listaPermitida[0];

  setSucursalSeleccionadaId(sucursalDefault?.firebaseId || "principal");
}
  });

  return () => unsub();
}, [
  perfil?.clienteId,
  perfil?.rol,
  perfil?.sucursalDefaultId,
  perfil?.sucursalesPermitidas,
  sucursalSeleccionadaId,
]);

const normalizarSucursalVista = (sucursal) => {
  const esPrincipal =
    sucursal?.esPrincipal === true ||
    sucursal?.codigo === "principal" ||
    String(sucursal?.firebaseId || "").endsWith("_principal");

  return {
    ...sucursal,
    firebaseId: esPrincipal ? "principal" : sucursal?.firebaseId,
    nombre: sucursal?.nombre || "Sucursal principal",
    esPrincipal,
  };
};

const sucursalSeleccionada = normalizarSucursalVista(
  sucursales.find((s) => {
    const idNormalizado =
      s.esPrincipal || s.codigo === "principal" || String(s.firebaseId || "").endsWith("_principal")
        ? "principal"
        : s.firebaseId;

    return idNormalizado === sucursalSeleccionadaId;
  }) ||
    sucursales.find((s) => s.esPrincipal || s.codigo === "principal") || {
      firebaseId: "principal",
      nombre: "Sucursal principal",
      esPrincipal: true,
      codigo: "principal",
    }
);

useEffect(() => {
  if (!perfil?.clienteId) return;

  setLoading(true);

obtenerUltimaCajaAnteriorConSaldo({
  perfil,
  fechaCaja,
  sucursal: sucursalSeleccionada,
})
  .then((info) => {
    setCajaAnterior(info.caja);
    setSaldoAnteriorInfo(info);
    setSaldoApertura(info.saldo);
  })
  .catch((err) => {
    console.error("Error cargando caja anterior:", err);
  });

  const unsubCaja = escucharCajaDelDia({
    perfil,
    fechaCaja,
    sucursal: sucursalSeleccionada,
    onData: (cajaData) => {
      setCaja(cajaData);
      setLoading(false);

      if (!cajaData) {
        setMovimientos([]);
      }
    },
    onError: (err) => {
      console.error("Error escuchando caja:", err);
      setError(err.message || "No se pudo escuchar la caja.");
      setLoading(false);
    },
  });

  const unsubMovimientos = escucharMovimientosCajaDia({
    perfil,
    fechaCaja,
    sucursal: sucursalSeleccionada,
    onData: (movs) => {
      setMovimientos(movs);
    },
    onError: (err) => {
      console.error("Error escuchando movimientos de caja:", err);
    },
  });

  return () => {
    unsubCaja();
    unsubMovimientos();
  };
}, [perfil?.clienteId, fechaCaja, sucursalSeleccionadaId]);

const movimientoEstaAnulado = (m) => {
  return (
    m?.estadoMovimiento === "anulado" ||
    m?.estado === "anulado" ||
    m?.activo === false ||
    m?.anulado === true
  );
};

  const resumen = useMemo(() => {
  const activos = movimientos.filter(
    (m) => !movimientoEstaAnulado(m) && m.impactaCaja === true
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
      .filter(
        (m) =>
          m.tipo === "egreso" &&
          (m.medioPago === "efectivo" || m.medioPago === "efectivo_caja")
      )
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
  caja?.saldoCierreAnteriorEfectivo ?? saldoAnteriorInfo.saldo ?? 0
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

      if (saldoApertura === "" || saldoApertura === null || isNaN(Number(saldoApertura))) {
        setError("Antes de abrir la caja tenés que ingresar el saldo inicial en efectivo.");
        return;
      }

      const ok = window.confirm(
        `Vas a abrir la caja con ${formatearMoneda(
          Number(saldoApertura || 0),
          configMoneda.moneda,
          configMoneda.localeMoneda
        )}. ¿Confirmás que el monto es correcto?`
      );

      if (!ok) return;

  await abrirCaja({
    perfil,
    fechaCaja,
    saldoAperturaEfectivo: Number(saldoApertura || 0),
    cajaAnterior,
    sucursal: sucursalSeleccionada,
    saldoReferenciaAnterior: aperturaReferencia,
  });

    setExito("Caja abierta correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo abrir la caja.");
    }
  };

  const handleCorregirApertura = async () => {
  try {
    const nuevoValor = window.prompt(
      "Ingresá el nuevo saldo de apertura:",
      caja?.saldoAperturaEfectivo || 0
    );

    if (nuevoValor === null) return;

    const ok = window.confirm(
      `¿Corregir apertura a ${formatearMoneda(
        Number(nuevoValor),
        configMoneda.moneda,
        configMoneda.localeMoneda
      )}?`
    );

    if (!ok) return;

    setCorrigiendoApertura(true);

    await corregirAperturaCaja({
      perfil,
      caja,
      nuevoSaldoAperturaEfectivo: Number(nuevoValor),
    });

setExito("Apertura corregida.");
  } catch (err) {
    setError(err.message);
  } finally {
    setCorrigiendoApertura(false);
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
      
      setExito("Movimiento cargado correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar el movimiento.");
    }
  };

  const handleCerrarCaja = async () => {
    try {

      if (saldoCierreReal === "" || saldoCierreReal === null || isNaN(Number(saldoCierreReal))) {
        setError("Antes de cerrar la caja tenés que ingresar el efectivo real contado.");
        return;
      }
      const ok = window.confirm(
        `Vas a cerrar la caja con efectivo real de ${formatearMoneda(
          Number(saldoCierreReal || 0),
          configMoneda.moneda,
          configMoneda.localeMoneda
        )}. ¿Confirmás el cierre?`
      );

      if (!ok) return;

      setError("");
      setExito("");


      await cerrarCaja({
        perfil,
        caja,
        saldoCierreRealEfectivo: Number(saldoCierreReal || 0),
      });

      setSaldoCierreReal("");
      
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

      
      setExito("Caja reabierta correctamente.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo reabrir la caja.");
    }
  };

const handleCambioTurno = async () => {
  try {
    setError("");
    setExito("");

    if (efectivoTurno === "" || isNaN(Number(efectivoTurno))) {
      setError("Ingresá el efectivo contado para registrar el cambio de turno.");
      return;
    }

    await crearCambioTurnoCaja({
      perfil,
      caja,
      efectivoContado: Number(efectivoTurno || 0),
      observacion: observacionTurno,
    });

    setModalCambioTurno(false);
    setEfectivoTurno("");
    setObservacionTurno("");
    setExito("Cambio de turno registrado correctamente.");
  } catch (err) {
    console.error(err);
    setError(err.message || "No se pudo registrar el cambio de turno.");
  }
};

const abrirHistorialCaja = async () => {
  try {
    setLoadingHistorial(true);
    setError("");

    const todasSucursales = historialSucursalId === "todas";

    const sucursalHistorial =
      historialSucursalId === "actual"
        ? sucursalSeleccionada
        : sucursales.find(
            (s) => s.firebaseId === historialSucursalId
          ) || sucursalSeleccionada;

    const cajas = await obtenerHistorialCajas({
      perfil,
      fechaDesde: historialDesde,
      fechaHasta: historialHasta,
      sucursal: sucursalHistorial,
      todasSucursales,
    });

    setHistorialCajas(cajas);
    setCajaHistorialAbiertaId(null);
    setMovimientosHistorial({});
    setMostrarHistorial(true);
  } catch (err) {
    console.error("Error cargando historial de caja:", err);
    setError(err.message || "No se pudo cargar el historial.");
  } finally {
    setLoadingHistorial(false);
  }
};
const toggleDetalleCajaHistorial = async (cajaHist) => {
  const abierta =
    cajaHistorialAbiertaId === cajaHist.firebaseId;

  if (abierta) {
    setCajaHistorialAbiertaId(null);
    return;
  }

  try {
    setCajaHistorialAbiertaId(cajaHist.firebaseId);

    const todasSucursales =
      historialSucursalId === "todas";

    const sucursalHistorial =
      historialSucursalId === "actual"
        ? sucursalSeleccionada
        : sucursales.find(
            (s) => s.firebaseId === historialSucursalId
          ) || sucursalSeleccionada;

    const movs = await obtenerMovimientosCajaDia({
      perfil,
      fechaCaja: cajaHist.fechaCaja,
      sucursal: sucursalHistorial,
      todasSucursales,
    });

    setMovimientosHistorial((prev) => ({
      ...prev,
      [cajaHist.firebaseId]: movs,
    }));
  } catch (err) {
    console.error(
      "Error cargando movimientos del historial:",
      err
    );

    setError(
      err.message ||
        "No se pudieron cargar los movimientos de la caja."
    );
  }
};

function MovimientoTabla({ movimientos, configMoneda, onVerVenta }) {
  return (
    <div style={tablaMovCard}>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Efectivo</th>
            <th>Transferencia</th>
            <th>Mercado Pago</th>
            <th>Débito</th>
            <th>Crédito</th>
            <th>Otros</th>
          </tr>
        </thead>

        <tbody>
          {movimientos.map((m) => {
            const esIngreso = m.tipo === "ingreso";
            const monto = Number(m.monto || 0);
            const esControl = m.tipo === "control";

            const anulado =
              m?.estadoMovimiento === "anulado" ||
              m?.estado === "anulado" ||
              m?.activo === false ||
              m?.anulado === true;

            const medioOriginal = m.medioPago || "otro";

            const medioNormalizado =
              medioOriginal === "efectivo_caja"
                ? "efectivo"
                : medioOriginal === "mp"
                ? "mercado_pago"
                : medioOriginal === "mercado_pago"
                ? "mercado_pago"
                : ["efectivo", "transferencia", "debito", "credito"].includes(
                    medioOriginal
                  )
                ? medioOriginal
                : "otro";

              const mostrarMontoMedio = (medio) => {
                if (esControl) return "-";
                if (medioNormalizado !== medio) return "-";

                return (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 7px",
                      borderRadius: 8,
                      fontWeight: 800,
                      background: esIngreso
                        ? "rgba(25, 135, 84, 0.10)"
                        : "rgba(220, 53, 69, 0.10)",
                      color: esIngreso ? "#198754" : "#dc3545",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {esIngreso ? "+" : "-"}{" "}
                    {formatearMoneda(
                      monto,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </span>
                );
              };

            return (
              <tr
                key={m.firebaseId}
                onClick={() => {
                  if (m.origen === "venta" && m.origenRefId && onVerVenta) {
                    onVerVenta(m.origenRefId);
                  }
                }}
                style={{
                  background: anulado
                    ? "#f1f5f9"
                    : esControl
                    ? "rgba(0,150,209,0.06)"
                    : esIngreso
                    ? "rgba(25,135,84,0.05)"
                    : "rgba(220,53,69,0.05)",
                  color: anulado ? "#64748b" : undefined,
                  opacity: anulado ? 0.65 : 1,
                  cursor: m.origen === "venta" ? "pointer" : "default",
                }}
              >
                <td>{formatearFechaCaja(m.fecha)}</td>

                <td>
                  <div style={{ fontWeight: 700 }}>
                    {m.descripcion || m.subtipo || "-"}

                    {anulado && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#64748b",
                        }}
                      >
                        ANULADO
                      </span>
                    )}
                  </div>

                  {m.tipo === "control" && (
                    <small style={{ color: "#64748b" }}>
                      Usuario: {m.creadoPorNombre || m.creadoPor || "-"}
                    </small>
                  )}
                </td>

                <td>{mostrarMontoMedio("efectivo")}</td>
                <td>{mostrarMontoMedio("transferencia")}</td>
                <td>{mostrarMontoMedio("mercado_pago")}</td>
                <td>{mostrarMontoMedio("debito")}</td>
                <td>{mostrarMontoMedio("credito")}</td>
                <td>{mostrarMontoMedio("otro")}</td>
              </tr>
            );
          })}

          {movimientos.length === 0 && (
            <tr>
              <td colSpan="8" style={{ textAlign: "center", padding: 14, color: "#777" }}>
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
  flexWrap: "wrap",
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