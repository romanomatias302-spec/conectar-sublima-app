
import React, { useEffect, useState } from "react";

import { db } from "../../firebase";
import {
  obtenerVentasPaginadas,
  escucharVentasRecientes,
  buscarVentasGlobales,
} from "../../firebase/ventas";
import "./VentasPage.css";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";

export default function VentasList({ perfil, onVer = () => {}, onEditar = () => {} }) {
  const [ventas, setVentas] = useState([]);
  const [ventasFiltradas, setVentasFiltradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMas, setLoadingMas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  
  

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
      setVentasFiltradas(res.ventas);
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

      const res = await obtenerVentasPaginadas({
        perfil,
        ultimoDoc,
        pageSize: PAGE_SIZE,
      });

      const acumuladas = [...ventas, ...res.ventas];

      setVentas(acumuladas);
      setVentasFiltradas(acumuladas);
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

  setLoading(true);

  const unsubscribe = escucharVentasRecientes({
    perfil,
    pageSize: PAGE_SIZE,
    onData: (res) => {
      setVentas(res.ventas);
      setVentasFiltradas(res.ventas);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
      setLoading(false);
    },
    onError: (error) => {
      console.error("Error escuchando ventas:", error);
      setLoading(false);
    },
  });

  return () => unsubscribe();
}, [perfil]);

useEffect(() => {
  const texto = normalizarTexto(busqueda);

  if (!texto) {
    setVentasFiltradas(ventas);
    return;
  }

  /*
   * Mostramos inmediatamente las coincidencias
   * que ya tenemos cargadas.
   *
   * Esto hace que el buscador se sienta rápido,
   * pero NO termina acá.
   */
  const locales = ventas.filter((v) => {
    const numero = normalizarTexto(v.numeroVenta);
    const cliente = normalizarTexto(v.clienteNombre);
    const dni = normalizarTexto(v.clienteDNI);
    const pedido = normalizarTexto(v.pedidoVisibleId);

    return (
      numero.includes(texto) ||
      cliente.includes(texto) ||
      dni.includes(texto) ||
      pedido.includes(texto)
    );
  });

  setVentasFiltradas(locales);

  let cancelada = false;

  const timer = setTimeout(async () => {
    try {
      const remotas = await buscarVentasGlobales({
        perfil,
        textoBusqueda: busqueda,
      });

      if (cancelada) return;

      /*
       * Fusionamos resultados locales + Firestore.
       * firebaseId impide ventas duplicadas.
       */
      const mapa = new Map();

      [...locales, ...remotas].forEach((venta) => {
        if (venta?.firebaseId) {
          mapa.set(venta.firebaseId, venta);
        }
      });

      const combinadas = Array.from(
        mapa.values()
      ).sort((a, b) => {
        const fechaA =
          a.createdAt?.toMillis?.() || 0;

        const fechaB =
          b.createdAt?.toMillis?.() || 0;

        return fechaB - fechaA;
      });

      setVentasFiltradas(combinadas);
    } catch (error) {
      if (cancelada) return;

      console.error(
        "Error buscando ventas globalmente:",
        error
      );

      /*
       * Ante un error conservamos resultados locales.
       * Nunca dejamos inutilizable el listado.
       */
      setVentasFiltradas(locales);
    }
  }, 350);

  return () => {
    cancelada = true;
    clearTimeout(timer);
  };
}, [busqueda, ventas, perfil]);

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

      {ventasFiltradas.length === 0 && (
        <p className="ventas-mobile-empty">
          No se encontraron ventas
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

                {ventasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "18px" }}>
                      No se encontraron ventas.
                    </td>
                  </tr>
                )}
              </tbody>
           </table>
          </div>
          </>
          )}

        {!loading && !busqueda && hayMas && (
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