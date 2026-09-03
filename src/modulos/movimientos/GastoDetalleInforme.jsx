import React, { useEffect, useState } from "react";
import { obtenerGastoPorId } from "../../firebase/gastos";
import {
  formatearMoneda,
  obtenerConfigMonedaDesdePerfil,
} from "../../utils/moneda";

export default function GastoDetalleInforme({ perfil, gastoId, onCerrar }) {
  const [gasto, setGasto] = useState(null);
  const [error, setError] = useState("");
  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);
  const moneda = (valor) =>
    formatearMoneda(
      valor,
      configMoneda.moneda,
      configMoneda.localeMoneda
    );

  useEffect(() => {
    let cancelado = false;
    setGasto(null);
    setError("");

    obtenerGastoPorId({ perfil, gastoId })
      .then((resultado) => {
        if (!cancelado) setGasto(resultado);
      })
      .catch((err) => {
        console.error("No se pudo cargar el detalle real del gasto:", err);
        if (!cancelado) setError("No se pudo cargar el gasto asociado.");
      });

    return () => {
      cancelado = true;
    };
  }, [perfil, gastoId]);

  const items = Array.isArray(gasto?.items) && gasto.items.length
    ? gasto.items
    : gasto
    ? [{
        descripcion: gasto.descripcion || gasto.concepto || "",
        cantidad: 1,
        precioUnitario: gasto.total || gasto.monto || 0,
      }]
    : [];
  const pagos = Array.isArray(gasto?.pagos) ? gasto.pagos : [];

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
              Detalle del gasto {gasto?.numeroGasto ? `#${gasto.numeroGasto}` : ""}
            </h2>
            <p style={{ margin: "6px 0 16px", color: "#666" }}>
              Información registrada en Gastos.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>
        </div>

        {!gasto && !error && <p>Cargando detalle del gasto...</p>}
        {error && <div className="ventas-alert ventas-alert-error">{error}</div>}

        {gasto && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 18,
              }}
            >
              {[
                ["Proveedor", gasto.proveedorNombre || gasto.proveedor || "-"],
                ["Fecha", gasto.fecha || "-"],
                ["Categoría", gasto.categoria || "-"],
                ["Estado", gasto.estado || (gasto.activo === false ? "anulado" : "activo")],
                ["Total", moneda(gasto.total || gasto.monto)],
                ["Pagado", moneda(gasto.totalPagado)],
                ["Saldo", moneda(gasto.saldo)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}
                >
                  <div style={{ color: "#666", fontSize: 13 }}>{label}</div>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <h3>Conceptos</h3>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table style={{ minWidth: 620 }}>
                <thead>
                  <tr><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const cantidad = Number(item.cantidad || 0);
                    const precio = Number(item.precioUnitario || 0);
                    return (
                      <tr key={item.id || index}>
                        <td>{item.descripcion || "-"}</td>
                        <td>{cantidad}</td>
                        <td>{moneda(precio)}</td>
                        <td>{moneda(item.subtotal ?? cantidad * precio)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3>Pagos</h3>
            {pagos.length ? (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ minWidth: 520 }}>
                  <thead><tr><th>Medio</th><th>Importe</th><th>Estado</th></tr></thead>
                  <tbody>
                    {pagos.map((pago, index) => (
                      <tr key={pago.id || index}>
                        <td>{pago.medioPago || "-"}</td>
                        <td>{moneda(pago.monto)}</td>
                        <td>{pago.estado || "activo"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: "#666" }}>No hay pagos detallados registrados.</p>}

            {(gasto.comprobantes || []).length > 0 && (
              <>
                <h3>Comprobantes</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {gasto.comprobantes.map((comprobante, index) => (
                    <a
                      key={comprobante.id || comprobante.url || index}
                      href={comprobante.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {comprobante.nombre || "Ver comprobante"}
                    </a>
                  ))}
                </div>
              </>
            )}

            {gasto.observaciones && (
              <div style={{ marginTop: 18 }}>
                <h3>Observaciones</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{gasto.observaciones}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
