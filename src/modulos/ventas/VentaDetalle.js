import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  obtenerVentaPorId,
  obtenerItemsDeVenta,
  obtenerPagosDeVenta,
  actualizarPedidoAsociadoDeVenta,
  agregarItemAVenta,
  agregarPagoPosteriorAVenta,
  anularItemDeVenta,
  anularPagoDeVenta,
  anularVenta,
} from "../../firebase/ventas";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import "./VentasPage.css";
import { puedeHacer } from "../../utils/permisos";


export default function VentaDetalle({ perfil, ventaId, onVolver, onVerPedido }) {
  const [venta, setVenta] = useState(null);
  const [items, setItems] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [pedidos, setPedidos] = useState([]);

  const [pedidoRefId, setPedidoRefId] = useState("");
  const [guardandoPedido, setGuardandoPedido] = useState(false);

  const [nuevoItem, setNuevoItem] = useState({
    descripcion: "",
    cantidad: 1,
    precioUnitario: 0,
  });

  const [nuevoPago, setNuevoPago] = useState({
    monto: 0,
    medioPago: "efectivo",
    fechaPago: new Date().toISOString().split("T")[0],
    observacion: "",
    fechaComprobanteReal: "",
  });

  const [guardandoItem, setGuardandoItem] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [anulandoVenta, setAnulandoVenta] = useState(false);

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const puedeVerVentas = puedeHacer(perfil, "ventas", "ver");
  const puedeEditarVentas = puedeHacer(perfil, "ventas", "editar");



  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  const cargarVentaCompleta = async () => {
    try {
      setError("");
      setExito("");

      const [ventaData, itemsData, pagosData] = await Promise.all([
        obtenerVentaPorId(ventaId),
        obtenerItemsDeVenta(ventaId),
        obtenerPagosDeVenta(ventaId),
      ]);

      setVenta(ventaData);
      setItems(itemsData);
      setPagos(pagosData);
      setPedidoRefId(ventaData.pedidoRefId || "");
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la venta.");
    }
  };

  const cargarPedidos = async () => {
    try {
      if (!perfil) return;

      const pedidosRef = collection(db, "pedidos");

      const q =
        perfil.rol === "superadmin"
          ? query(pedidosRef, orderBy("createdAt", "desc"), limit(50))
          : query(
              pedidosRef,
              where("clienteId", "==", perfil.clienteId),
              orderBy("createdAt", "desc"),
              limit(50)
            );

      const snap = await getDocs(q);

      setPedidos(
        snap.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
      );
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!ventaId) return;
    cargarVentaCompleta();
    cargarPedidos();
  }, [ventaId, perfil]);

  const pedidoSeleccionado = useMemo(
    () => pedidos.find((p) => p.firebaseId === pedidoRefId) || null,
    [pedidos, pedidoRefId]
  );
  const ventaAnulada = (venta?.estadoVenta || "activa") === "anulada";

    const anularItem = async (item) => {
    try {
      if (!puedeEditarVentas) return;
      const motivo = window.prompt("Motivo de anulación del ítem:", "");
      if (motivo === null) return;

      setError("");
      setExito("");

      await anularItemDeVenta({
        perfil,
        ventaId: venta.firebaseId,
        itemId: item.firebaseId,
        motivoAnulacion: motivo,
      });

      await cargarVentaCompleta();
      setExito("Ítem anulado con éxito.");
    } catch (err) {
      console.error(err);
      setError("No se pudo anular el ítem.");
    }
  };

  const anularPago = async (pago) => {
    try {
      if (!puedeEditarVentas) return;
      const motivo = window.prompt("Motivo de anulación del pago:", "");
      if (motivo === null) return;

      setError("");
      setExito("");

      await anularPagoDeVenta({
        perfil,
        ventaId: venta.firebaseId,
        pagoId: pago.firebaseId,
        motivoAnulacion: motivo,
      });

      await cargarVentaCompleta();
      setExito("Pago anulado con éxito.");
    } catch (err) {
      console.error(err);
      setError("No se pudo anular el pago.");
    }
  };

    const handleAnularVenta = async () => {
      try {
        if (!puedeEditarVentas) return;
        if (!venta) return;

        const motivo = window.prompt("Motivo de anulación de la venta:", "");
        if (motivo === null) return;

        const confirmado = window.confirm(
            `¿Seguro que querés anular la venta #${venta.numeroVenta}? Esta acción no borra la venta, solo la deja anulada.`
        );

        if (!confirmado) return;

        setAnulandoVenta(true);
        setError("");
        setExito("");

        await anularVenta({
            perfil,
            ventaId: venta.firebaseId,
            motivoAnulacion: motivo,
        });

        await cargarVentaCompleta();
        await cargarPedidos();

        setExito("Venta anulada con éxito.");
        } catch (err) {
        console.error(err);
        setError(err.message || "No se pudo anular la venta.");
        } finally {
        setAnulandoVenta(false);
        }
    };

  const guardarPedidoAsociado = async () => {
    try {
      if (!puedeEditarVentas) return;
      if (!venta) return;
      setGuardandoPedido(true);
      setError("");
      setExito("");

      await actualizarPedidoAsociadoDeVenta({
        ventaId: venta.firebaseId,
        pedidoAsociado: pedidoSeleccionado,
      });

      await cargarVentaCompleta();
      setExito("Pedido asociado actualizado.");
    } catch (err) {
      console.error(err);
      setError("No se pudo actualizar el pedido asociado.");
    } finally {
      setGuardandoPedido(false);
    }
  };

  const guardarNuevoItem = async () => {
    try {
      if (!puedeEditarVentas) return;
      if (!venta) return;
      setGuardandoItem(true);
      setError("");
      setExito("");

      await agregarItemAVenta({
        perfil,
        venta,
        descripcion: nuevoItem.descripcion,
        cantidad: Number(nuevoItem.cantidad),
        precioUnitario: Number(nuevoItem.precioUnitario),
      });

      setNuevoItem({
        descripcion: "",
        cantidad: 1,
        precioUnitario: 0,
      });

      await cargarVentaCompleta();
      setExito("Ítem agregado con éxito.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo agregar el ítem.");
    } finally {
      setGuardandoItem(false);
    }
  };

  const guardarNuevoPago = async () => {
    try {
      if (!puedeEditarVentas) return;
      if (!venta) return;
      setGuardandoPago(true);
      setError("");
      setExito("");

      await agregarPagoPosteriorAVenta({
        perfil,
        venta,
        monto: Number(nuevoPago.monto),
        medioPago: nuevoPago.medioPago,
        fechaPago: nuevoPago.fechaPago,
        fechaComprobanteReal: nuevoPago.fechaComprobanteReal,
        observacion: nuevoPago.observacion,
      });

      setNuevoPago({
        monto: 0,
        medioPago: "efectivo",
        fechaPago: new Date().toISOString().split("T")[0],
        observacion: "",
        fechaComprobanteReal: "",
      });

      await cargarVentaCompleta();
      setExito("Pago agregado con éxito.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo agregar el pago.");
    } finally {
      setGuardandoPago(false);
    }
  };

    if (!puedeVerVentas) {
    return (
      <div className="ventas-page">
        <div className="ventas-card">
          <p>No tenés permisos para ver ventas.</p>
        </div>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="ventas-page">
        <div className="ventas-card">
          <p>Cargando detalle de venta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ventas-page">
      <div className="ventas-topbar">
        <div>
          <h1>Venta #{venta.numeroVenta}</h1>
          <div style={{ marginTop: "6px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span
              className={`ventas-estado-badge ${
                ventaAnulada ? "ventas-estado-anulado" : "ventas-estado-ok"
              }`}
            >
              {ventaAnulada ? "Venta anulada" : "Venta activa"}
            </span>

            {!ventaAnulada && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={handleAnularVenta}
                disabled={anulandoVenta || !puedeEditarVentas}
              >
                {anulandoVenta ? "Anulando..." : "Anular venta"}
              </button>
            )}
          </div>
        </div>

        <button className="btn btn-secondary" onClick={onVolver}>
          Volver
        </button>
      </div>

      {error && <div className="ventas-alert ventas-alert-error">{error}</div>}
      {exito && <div className="ventas-alert ventas-alert-ok">{exito}</div>}

      {ventaAnulada && (
        <div className="ventas-alert ventas-alert-error">
          Esta venta está anulada. Se conserva por trazabilidad y no admite nuevas modificaciones operativas.
        </div>
      )}

      <div className="ventas-layout">
        <section className="ventas-main-column">
          <div className="ventas-top-editable ventas-mt-sm">
            <div className="ventas-top-editable-item">
              <span>Fecha</span>
              <strong>{venta.fechaVenta || "-"}</strong>
            </div>

            <div className="ventas-top-editable-item">
              <span>Cliente</span>
              <strong>{venta.clienteNombre || "-"}</strong>
            </div>

            <div className="ventas-top-editable-item ventas-top-editable-pedido">
              <span>Pedido asociado</span>
              <div className="ventas-top-editable-pedido-row">
                <select
                  value={pedidoRefId}
                  onChange={(e) => setPedidoRefId(e.target.value)}
                  disabled={ventaAnulada || !puedeEditarVentas}
                >
                  <option value="">Sin pedido asociado</option>
                  {pedidos.map((p) => (
                    <option key={p.firebaseId} value={p.firebaseId}>
                      #{p.id} - {p.cliente} - {p.fechaPedido}
                    </option>
                  ))}
                </select>

                <button
                  className="btn btn-primary"
                  onClick={guardarPedidoAsociado}
                  disabled={guardandoPedido || ventaAnulada || !puedeEditarVentas}
                >
                  {guardandoPedido ? "Guardando..." : "Guardar"}
                </button>

                {venta?.pedidoRefId && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => onVerPedido && onVerPedido(venta.pedidoRefId)}
                  >
                    Ver pedido
                  </button>
                )}
              </div>
            </div>
          </div>

          <section className="ventas-card ventas-card-lg ventas-bloque">
            <div className="ventas-card-header">
              <h2>Ítems</h2>
            </div>

            <div className="ventas-table-wrap">
              <table className="ventas-table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const activo = (item.estadoItem || "activo") === "activo";

                    return (
                      <tr
                        key={item.firebaseId}
                        className={!activo ? "ventas-row-anulada" : ""}
                      >
                        <td>{item.descripcion}</td>
                        <td>{item.cantidad}</td>
                        <td>{formatearMoneda(item.precioUnitario, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                        <td>{formatearMoneda(item.subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</td>  
                        <td>
                          <span className={`ventas-estado-badge ${activo ? "ventas-estado-ok" : "ventas-estado-anulado"}`}>
                            {activo ? "Activo" : "Anulado"}
                          </span>
                        </td>
                        <td>
                          {activo && !ventaAnulada && puedeEditarVentas ? (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => anularItem(item)}
                            >
                              Anular
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ventas-subpanel ventas-mt">
              <div className="ventas-card-header">
                <h2>Agregar nuevo ítem</h2>
              </div>

              <div className="ventas-grid ventas-grid-3">
                <div className="ventas-field">
                  <label>Descripción</label>
                  <input
                    value={nuevoItem.descripcion}
                    onChange={(e) =>
                      setNuevoItem((prev) => ({ ...prev, descripcion: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>

                <div className="ventas-field">
                  <label>Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={nuevoItem.cantidad}
                    onChange={(e) =>
                      setNuevoItem((prev) => ({ ...prev, cantidad: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>

                <div className="ventas-field">
                  <label>Precio unitario</label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoItem.precioUnitario}
                    onChange={(e) =>
                      setNuevoItem((prev) => ({ ...prev, precioUnitario: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>
              </div>

              <div className="ventas-actions-row">
                <button
                  className="btn btn-primary"
                  onClick={guardarNuevoItem}
                  disabled={guardandoItem || ventaAnulada || !puedeEditarVentas}
                >
                  {guardandoItem ? "Agregando..." : "Agregar ítem"}
                </button>
              </div>
            </div>
          </section>

          <section className="ventas-card ventas-card-lg ventas-bloque">
            <div className="ventas-card-header">
              <h2>Pagos</h2>
            </div>

            <div className="ventas-table-wrap">
              <table className="ventas-table">
                <thead>
                  <tr>
                    <th>Fecha carga</th>
                    <th>Fecha real comp.</th>
                    <th>Monto</th>
                    <th>Medio</th>
                    <th>Observación</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pago) => {
                    const activo = (pago.estadoPagoRegistro || "activo") === "activo";

                    return (
                      <tr
                        key={pago.firebaseId}
                        className={!activo ? "ventas-row-anulada" : ""}
                      >
                        <td>{pago.fechaPago || "-"}</td>
                        <td>{pago.fechaComprobanteReal || "-"}</td>
                        <td>{formatearMoneda(pago.monto, configMoneda.moneda, configMoneda.localeMoneda)}</td> 
                        <td>{pago.medioPago || "-"}</td>
                        <td>{pago.observacion || "-"}</td>
                        <td>
                          <span className={`ventas-estado-badge ${activo ? "ventas-estado-ok" : "ventas-estado-anulado"}`}>
                            {activo ? "Activo" : "Anulado"}
                          </span>
                        </td>
                        <td>
                          {activo && !ventaAnulada && puedeEditarVentas ? (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => anularPago(pago)}
                            >
                              Anular
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ventas-subpanel ventas-mt">
              <div className="ventas-card-header">
                <h2>Agregar pago</h2>
              </div>

              <div className="ventas-grid ventas-grid-3">
                <div className="ventas-field">
                  <label>Monto</label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoPago.monto}
                    onChange={(e) =>
                      setNuevoPago((prev) => ({ ...prev, monto: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>

                <div className="ventas-field">
                  <label>Medio de pago</label>
                  <select
                    value={nuevoPago.medioPago}
                    onChange={(e) =>
                      setNuevoPago((prev) => ({ ...prev, medioPago: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="debito">Débito</option>
                    <option value="credito">Crédito</option>
                    <option value="mp">Mercado Pago</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="ventas-field">
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={nuevoPago.fechaPago}
                    disabled
                  />
                </div>
              </div>

              <div className="ventas-field">
                <label>Observación</label>
                <input
                  value={nuevoPago.observacion}
                  onChange={(e) =>
                    setNuevoPago((prev) => ({ ...prev, observacion: e.target.value }))
                  }
                  disabled={!puedeEditarVentas || ventaAnulada}
                />
              </div>

              <div className="ventas-field">
                <label>Fecha real de comprobante (opcional)</label>
                <input
                  type="date"
                  value={nuevoPago.fechaComprobanteReal}
                  onChange={(e) =>
                    setNuevoPago((prev) => ({
                      ...prev,
                      fechaComprobanteReal: e.target.value,
                    }))
                  }
                  disabled={!puedeEditarVentas || ventaAnulada}
                />
              </div>

              <div className="ventas-actions-row">
                <button
                  className="btn btn-primary"
                  onClick={guardarNuevoPago}
                  disabled={guardandoPago || ventaAnulada || !puedeEditarVentas}
                >
                  {guardandoPago ? "Agregando..." : "Agregar pago"}
                </button>
              </div>
            </div>
          </section>
        </section>

        <aside className="ventas-card ventas-card-sm">
          <div className="ventas-card-header">
            <h2>Resumen</h2>
          </div>

          <div className="ventas-resumen">
            <div className="ventas-resumen-row">
              <span>Cliente</span>
              <strong>{venta.clienteNombre || "-"}</strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Pedido asociado</span>
              <strong>{venta.pedidoVisibleId ? `#${venta.pedidoVisibleId}` : "-"}</strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Subtotal</span>
              <strong>{formatearMoneda(venta.subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</strong>  
            </div>

            <div className="ventas-resumen-row">
              <span>Descuento</span>
              <strong>{formatearMoneda(venta.descuento, configMoneda.moneda, configMoneda.localeMoneda)}</strong> 
            </div>

            <div className="ventas-resumen-row ventas-total">
              <span>Total</span>
              <strong>{formatearMoneda(venta.total, configMoneda.moneda, configMoneda.localeMoneda)}</strong> 
            </div>

            <div className="ventas-resumen-row">
              <span>Total pagado</span>
              <strong>{formatearMoneda(venta.totalPagado, configMoneda.moneda, configMoneda.localeMoneda)}</strong> 
            </div>

            {Number(venta.saldoAFavor || 0) > 0 && (
              <div className="ventas-resumen-row">
                <span>Saldo a favor</span>
                <strong className="ventas-saldo-badge ventas-saldo-favor">
                  {formatearMoneda(venta.saldoAFavor, configMoneda.moneda, configMoneda.localeMoneda)} 
                </strong>
              </div>
            )}

            <div className="ventas-resumen-row">
              <span>Saldo pendiente</span>
              <strong
                className={`ventas-saldo-badge ${
                  Number(venta.saldoPendiente || 0) <= 0
                    ? "ventas-saldo-ok"
                    : "ventas-saldo-pendiente"
                }`}
              >
                {formatearMoneda(venta.saldoPendiente, configMoneda.moneda, configMoneda.localeMoneda)} 
              </strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Estado de venta</span>
              <strong>{venta.estadoVenta || "activa"}</strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Estado de pago</span>
              <strong>{venta.estadoPago || "-"}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}