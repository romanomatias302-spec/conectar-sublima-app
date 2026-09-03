import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  obtenerGastosPendientesProveedorPaginados,
  obtenerVentasPendientesClientePaginadas,
} from "../../firebase/informesFinancieros";
import {
  formatearMoneda,
  obtenerConfigMonedaDesdePerfil,
} from "../../utils/moneda";

export default function SaldoPendienteModal({
  perfil,
  tipo,
  resumen,
  onCerrar,
  onAbrirVenta,
  onAbrirGasto,
}) {
  const [detalles, setDetalles] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const solicitudRef = useRef(0);
  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);
  const moneda = (valor) =>
    formatearMoneda(valor, configMoneda.moneda, configMoneda.localeMoneda);
  const esCliente = tipo === "cliente";
  const clave = esCliente
    ? resumen.clienteId || resumen.clienteNombre
    : resumen.proveedorId || resumen.proveedorNombre;

  const cargar = useCallback(async (cursor = null, reiniciar = false) => {
    const solicitudId = ++solicitudRef.current;
    setLoading(true);
    setError("");

    try {
      const resultado = esCliente
        ? await obtenerVentasPendientesClientePaginadas({
            perfil,
            clienteClave: clave,
            ultimoDoc: cursor,
          })
        : await obtenerGastosPendientesProveedorPaginados({
            perfil,
            proveedorClave: clave,
            ultimoDoc: cursor,
          });

      if (solicitudId !== solicitudRef.current) return;
      const nuevos = esCliente ? resultado.ventas : resultado.gastos;
      setDetalles((actuales) => reiniciar ? nuevos : [...actuales, ...nuevos]);
      setUltimoDoc(resultado.ultimoDoc);
      setHayMas(resultado.hayMas);
    } catch (err) {
      console.error("Error cargando detalle paginado del saldo:", err);
      if (solicitudId === solicitudRef.current) {
        setError("No pudimos cargar el detalle del saldo. Intentá nuevamente.");
      }
    } finally {
      if (solicitudId === solicitudRef.current) setLoading(false);
    }
  }, [esCliente, perfil, clave]);

  useEffect(() => {
    setDetalles([]);
    setUltimoDoc(null);
    setHayMas(true);
    cargar(null, true);
    return () => {
      solicitudRef.current += 1;
    };
  }, [cargar]);

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal-content"
        style={{ maxWidth: 1000, maxHeight: "88vh", overflow: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>
              {esCliente ? resumen.clienteNombre : resumen.proveedorNombre}
            </h2>
            <p style={{ color: "#666", marginTop: 6 }}>
              {esCliente ? "Saldo pendiente de cobro" : "Saldo pendiente de pago"}:{" "}
              <strong>{moneda(resumen.totalPendiente)}</strong>
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>
        </div>

        {error && <div className="ventas-alert ventas-alert-error">{error}</div>}

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ minWidth: 760 }}>
            <thead>
              {esCliente ? (
                <tr><th>Venta</th><th>Fecha</th><th>Total</th><th>Cobrado</th><th>Pendiente</th><th></th></tr>
              ) : (
                <tr><th>Gasto</th><th>Fecha</th><th>Concepto</th><th>Total</th><th>Pagado</th><th>Pendiente</th><th></th></tr>
              )}
            </thead>
            <tbody>
              {detalles.map((detalle) => esCliente ? (
                <tr key={detalle.firebaseId}>
                  <td>#{detalle.numeroVenta || "-"}</td>
                  <td>{detalle.fechaVenta || "-"}</td>
                  <td>{moneda(detalle.total)}</td>
                  <td>{moneda(detalle.totalPagado)}</td>
                  <td>{moneda(detalle.saldoPendiente)}</td>
                  <td><button type="button" onClick={() => onAbrirVenta(detalle.firebaseId)}>Ver venta</button></td>
                </tr>
              ) : (
                <tr key={detalle.firebaseId}>
                  <td>#{detalle.numeroGasto || "-"}</td>
                  <td>{detalle.fecha || "-"}</td>
                  <td>{detalle.categoria || detalle.descripcion || "-"}</td>
                  <td>{moneda(detalle.total)}</td>
                  <td>{moneda(detalle.totalPagado)}</td>
                  <td>{moneda(detalle.saldo)}</td>
                  <td><button type="button" onClick={() => onAbrirGasto(detalle.firebaseId)}>Ver gasto</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!detalles.length && !loading && !error && (
          <p style={{ color: "#666" }}>No se encontraron documentos pendientes.</p>
        )}
        {loading && <p>Cargando detalle...</p>}
        {!loading && hayMas && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button type="button" onClick={() => cargar(ultimoDoc, false)}>Cargar más</button>
          </div>
        )}
      </div>
    </div>
  );
}
