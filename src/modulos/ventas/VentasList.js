
import React, { useEffect, useMemo, useRef, useState } from "react";

import { db } from "../../firebase";
import {
  obtenerVentasPaginadas,
  escucharVentasRecientes,
  buscarVentasGlobales,
} from "../../firebase/ventas";
import "./VentasPage.css";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { fusionarDocumentosPaginados } from "../../utils/paginacionRealtime";

export default function VentasList({ perfil, onVer = () => {}, onEditar = () => {} }) {
  const [ventas, setVentas] = useState([]);
  const [busquedaRemota, setBusquedaRemota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMas, setLoadingMas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const listenerInicializadoRef = useRef(false);
  const versionListadoRef = useRef(0);
  
  

  const PAGE_SIZE = 100;

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  

  function normalizarTexto(texto) {
    return (texto || "").toString().trim().toLowerCase();
  }

  async function cargarVentasIniciales() {
    try {
      setLoading(true);

      const res = await obtenerVentasPaginadas({
        perfil,
        pageSize: PAGE_SIZE,
      });

      console.log("VENTAS INICIALES:", res.ventas);
      console.log("PERFIL LISTADO VENTAS:", perfil);

      setVentas(res.ventas);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (e) {
      console.error("Error al cargar ventas:", e);
    } finally {
      setLoading(false);
    }
  }

  async function cargarMasVentas() {
    try {
      if (!ultimoDoc || !hayMas) return;

      setLoadingMas(true);
      const versionListado = versionListadoRef.current;

      const res = await obtenerVentasPaginadas({
        perfil,
        ultimoDoc,
        pageSize: PAGE_SIZE,
      });

      if (versionListado !== versionListadoRef.current) return;
      setVentas((actuales) =>
        fusionarDocumentosPaginados({ actuales, entrantes: res.ventas })
      );
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (e) {
      console.error("Error al cargar más ventas:", e);
    } finally {
      setLoadingMas(false);
    }
  }





useEffect(() => {
  if (!perfil) return;

  listenerInicializadoRef.current = false;
  versionListadoRef.current += 1;
  setLoading(true);

  const unsubscribe = escucharVentasRecientes({
    perfil,
    pageSize: PAGE_SIZE,
    onData: (res) => {
      if (!listenerInicializadoRef.current) {
        setVentas(res.ventas);
        setUltimoDoc(res.ultimoDoc);
        setHayMas(res.hayMas);
        listenerInicializadoRef.current = true;
      } else {
        setVentas((actuales) =>
          fusionarDocumentosPaginados({ actuales, entrantes: res.ventas })
        );
      }
      setLoading(false);
    },
    onError: (error) => {
      console.error("Error escuchando ventas:", error);
      setLoading(false);
    },
  });

  return () => unsubscribe();
}, [perfil]);

  const ambitoBusqueda = JSON.stringify([perfil?.clienteId, perfil?.rol]);
  const textoBusqueda = busqueda.trim();
  const resultadoActual = busquedaRemota?.texto === textoBusqueda &&
    busquedaRemota?.ambito === ambitoBusqueda ? busquedaRemota : null;

  useEffect(() => {
    const texto = busqueda.trim();
    if (!texto || (!perfil?.clienteId && perfil?.rol !== "superadmin")) {
      setBusquedaRemota(null);
      return;
    }

    let cancelada = false;
    const contexto = { texto, ambito: ambitoBusqueda };
    setBusquedaRemota({ ...contexto, ventas: [], buscando: true, errorTecnico: false });

    const timer = setTimeout(async () => {
      try {
        const resultado = await buscarVentasGlobales({
          perfil,
          textoBusqueda: texto,
          incluirDiagnostico: true,
        });
        if (cancelada) return;

        if (resultado.limiteAlcanzado) {
          console.warn(
            "Una consulta de búsqueda de ventas alcanzó su límite. Los resultados encontrados se conservan."
          );
        }
        if (resultado.consultasFallidas.length) {
          console.warn(
            "La búsqueda de ventas terminó con consultas parciales fallidas:",
            resultado.consultasFallidas
          );
        }
        setBusquedaRemota({
          ...contexto,
          ventas: resultado.ventas,
          buscando: false,
          errorTecnico: resultado.consultasFallidas.length > 0,
        });
      } catch (error) {
        if (cancelada) return;
        console.error("Error buscando ventas globalmente:", error);
        setBusquedaRemota({
          ...contexto,
          ventas: [],
          buscando: false,
          errorTecnico: true,
        });
      }
    }, 350);

    return () => {
      cancelada = true;
      clearTimeout(timer);
    };
  }, [busqueda, perfil, ambitoBusqueda]);

  const ventasFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);
    if (!texto) return ventas;

    const locales = ventas.filter((v) =>
      (perfil?.rol === "superadmin" || v.clienteId === perfil?.clienteId) &&
      [v.numeroVenta, v.clienteNombre, v.clienteDNI, v.pedidoVisibleId]
        .some((valor) => normalizarTexto(valor).includes(texto))
    );
    const mapa = new Map();
    [...locales, ...(resultadoActual?.ventas || [])].forEach((venta) => {
      if (venta?.firebaseId) mapa.set(venta.firebaseId, venta);
    });
    return Array.from(mapa.values()).sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
  }, [busqueda, ventas, resultadoActual, perfil?.rol, perfil?.clienteId]);

  const busquedaFinalizada = Boolean(
    textoBusqueda && resultadoActual && !resultadoActual.buscando
  );
  const busquedaSinResultados = busquedaFinalizada && ventasFiltradas.length === 0;
  const busquedaConErrorVisible = busquedaSinResultados && resultadoActual.errorTecnico;
  const mensajeListaVacia = textoBusqueda
    ? busquedaSinResultados && !busquedaConErrorVisible
      ? `No encontramos ventas que coincidan con «${textoBusqueda}».`
      : ""
    : "No se encontraron ventas.";

  return (
    <div className="ventas-page">
      <div className="ventas-topbar">
        <h1>Listado de ventas</h1>
        
      </div>

      <div className="ventas-card">
        <div className="ventas-grid ventas-grid-2">
          <div className="ventas-field">
            <label>Buscar venta</label>
            <input
              type="text"
              placeholder="Buscar por N° venta, cliente, DNI o pedido..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {textoBusqueda && resultadoActual?.buscando && <p role="status">Buscando ventas...</p>}
        {busquedaConErrorVisible && (
          <p className="ventas-alert ventas-alert-error" role="alert">
            No pudimos completar la búsqueda. Intentá nuevamente.
          </p>
        )}
        {loading && <p style={{ marginTop: "16px" }}>Cargando ventas...</p>}

{!loading && (
  <>
    <div className="ventas-mobile-list">
      {ventasFiltradas.map((v) => {
        const ventaAnulada =
          (v.estadoVenta || "activa") === "anulada";

        return (
          <div
            key={v.firebaseId}
            className={`venta-mobile-card ${
              ventaAnulada ? "is-anulada" : ""
            }`}
            onClick={() => onVer(v)}
          >
            <div className="venta-mobile-top">
              <div>
                <strong>
                  Venta #{v.numeroVenta || "-"}
                </strong>

                <span>
                  {v.clienteNombre || "Sin cliente"}
                </span>
              </div>

              <span
                className={`ventas-estado-badge ${
                  ventaAnulada
                    ? "ventas-estado-anulado"
                    : "ventas-estado-ok"
                }`}
              >
                {ventaAnulada
                  ? "Anulada"
                  : "Activa"}
              </span>
            </div>

            <div className="venta-mobile-info">
              <div>
                <small>Fecha</small>
                <p>{v.fechaVenta || "-"}</p>
              </div>

              <div>
                <small>Pedido</small>
                <p>
                  {v.pedidoVisibleId
                    ? `#${v.pedidoVisibleId}`
                    : "-"}
                </p>
              </div>
            </div>

          <div className="venta-mobile-money">
            <div>
              <small>Total</small>

              <strong>
                {formatearMoneda(
                  v.total,
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
            </div>

            <div>
              <small>Pagado</small>

              <strong>
                {formatearMoneda(
                  v.totalPagado,
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
            </div>

            <div>
              <small>Saldo</small>

              <strong
                className={
                  Number(v.saldoPendiente || 0) > 0
                    ? "venta-money-warning"
                    : "venta-money-ok"
                }
              >
                {formatearMoneda(
                  v.saldoPendiente || 0,
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
            </div>
          </div>

            <button
              className="btn btn-primary venta-mobile-btn"
              onClick={(e) => {
                e.stopPropagation();
                onVer(v);
              }}
            >
              Ver
            </button>
          </div>
        );
      })}

      {ventasFiltradas.length === 0 && mensajeListaVacia && (
        <p className="ventas-mobile-empty" role={textoBusqueda ? "status" : undefined}>
          {mensajeListaVacia}
        </p>
      )}
    </div>

    <div className="ventas-table-wrap ventas-table-desktop">
            <table className="ventas-table">
              <thead>
                <tr>
                  <th>N° Venta</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Pedido asociado</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                 
                </tr>
              </thead>

              <tbody>
                {ventasFiltradas.map((v) => {
                  const ventaAnulada = (v.estadoVenta || "activa") === "anulada";

                  return (
                    <tr
                      key={v.firebaseId}
                      className={`ventas-row-clickable ${ventaAnulada ? "ventas-row-anulada" : ""}`}
                      onClick={() => onVer(v)}
                    >
                      <td>{v.numeroVenta || "-"}</td>
                      <td>{v.fechaVenta || "-"}</td>
                      <td>{v.clienteNombre || "-"}</td>
                      <td>{v.pedidoVisibleId ? `#${v.pedidoVisibleId}` : "-"}</td>
                      <td>
                        <span
                          className={`ventas-estado-badge ${
                            ventaAnulada
                              ? "ventas-estado-anulado"
                              : "ventas-estado-ok"
                          }`}
                        >
                          {ventaAnulada ? "Anulada" : "Activa"}
                        </span>
                      </td>
                      <td>{formatearMoneda(v.total, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                      <td>{formatearMoneda(v.totalPagado, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                      <td>
                        {Number(v.saldoAFavor || 0) > 0 ? (
                          <span className="ventas-saldo-badge ventas-saldo-favor">
                            A favor: {formatearMoneda(v.saldoAFavor, configMoneda.moneda, configMoneda.localeMoneda)}
                          </span>
                        ) : Number(v.saldoPendiente || 0) > 0 ? (
                          <span className="ventas-saldo-badge ventas-saldo-pendiente">
                            Pendiente: {formatearMoneda(v.saldoPendiente, configMoneda.moneda, configMoneda.localeMoneda)}
                          </span>
                        ) : (
                          <span className="ventas-saldo-badge ventas-saldo-ok">
                            {formatearMoneda(0, configMoneda.moneda, configMoneda.localeMoneda)}
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                })}

                {ventasFiltradas.length === 0 && mensajeListaVacia && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "18px" }}>
                      <span role={textoBusqueda ? "status" : undefined}>{mensajeListaVacia}</span>
                    </td>
                  </tr>
                )}
              </tbody>
           </table>
          </div>
          </>
          )}

        {!loading && !textoBusqueda && hayMas && (
          <div style={{ textAlign: "center", marginTop: "18px" }}>
            <button
              className="btn btn-secondary"
              onClick={cargarMasVentas}
              disabled={loadingMas}
            >
              {loadingMas ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
