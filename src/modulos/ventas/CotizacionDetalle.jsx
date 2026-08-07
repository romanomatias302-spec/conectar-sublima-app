import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  obtenerCotizacionPorId,
  obtenerItemsDeCotizacion,
  anularCotizacion,
  actualizarCotizacion,
} from "../../firebase/cotizaciones";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { obtenerUsuariosPorCliente } from "../../firebase/usuariosConfig";
import { puedeHacer } from "../../utils/permisos";
import ProductoSelectorModal from "../../components/ProductoSelectorModal/ProductoSelectorModal";
import "./VentasPage.css";



export default function CotizacionDetalle({
  perfil,
  cotizacionId,
  onVolver,
  onPrepararVenta,
}) {
  const [cotizacion, setCotizacion] = useState(null);
  const [items, setItems] = useState([]);
  const [configNegocio, setConfigNegocio] = useState({
    nombreVisible: "",
    logoUrl: "",
  });
  const [error, setError] = useState("");
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [exito, setExito] = useState("");
  const [dniRapido, setDniRapido] = useState("");
  const [guardandoDni, setGuardandoDni] = useState(false);
  const [menuOpcionesAbierto, setMenuOpcionesAbierto] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [editando, setEditando] = useState(false);
const [guardandoEdicion, setGuardandoEdicion] = useState(false);
const [editFechaValidez, setEditFechaValidez] = useState("");
const [editNotas, setEditNotas] = useState("");
const [editItems, setEditItems] = useState([]);
const [editDescuento, setEditDescuento] = useState(0);
const [editVendedorUid, setEditVendedorUid] = useState("");
const [usuarios, setUsuarios] = useState([]);
const [modalPrecioEdicionAbierto, setModalPrecioEdicionAbierto] = useState(false);
const [itemPrecioEdicionIndex, setItemPrecioEdicionIndex] = useState(null);


const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);
const puedeEditarCotizacion = puedeHacer(perfil, "ventas", "editarCotizacion");
const puedeAnularCotizacion = puedeHacer(perfil, "ventas", "anularCotizacion");
const puedeConvertirCotizacion = puedeHacer(perfil, "ventas", "convertirCotizacion");
const puedeOtorgarDescuentoCotizacion =
  puedeHacer(perfil, "ventas", "otorgarDescuentoCotizacion");

  const cargarDetalle = async () => {
    try {
      setError("");

      const [cotizacionData, itemsData] = await Promise.all([
        obtenerCotizacionPorId(cotizacionId),
        obtenerItemsDeCotizacion(cotizacionId),
      ]);

      setCotizacion(cotizacionData);
      setItems(
        itemsData.filter(
            (item) => (item.estadoItem || "activo") === "activo"
        )
        );
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la cotización.");
    }
  };

  const cargarConfigNegocio = async () => {
    try {
      if (!perfil?.clienteId || perfil?.rol === "superadmin") return;

      const ref = doc(db, "clientes-saas", perfil.clienteId);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const data = snap.data();

      setConfigNegocio({
        nombreVisible: data.nombreVisible || data.nombre || "",
        logoUrl: data.logoUrl || "",
      });
    } catch (err) {
      console.error("Error cargando negocio:", err);
    }
  };

  const cargarUsuarios = async () => {
  try {
    if (!perfil?.clienteId) return;
    const usuariosCliente = await obtenerUsuariosPorCliente(perfil.clienteId);
    setUsuarios(usuariosCliente);
  } catch (err) {
    console.warn("No se pudieron cargar vendedores:", err);
    setUsuarios([]);
  }
};

  useEffect(() => {
    if (!cotizacionId) return;
    cargarDetalle();
    cargarConfigNegocio();
    cargarUsuarios();
  }, [cotizacionId, perfil]);

  const guardarDniRapidoCliente = async () => {
  try {
    const dniLimpio = String(dniRapido || "").trim();

    if (!dniLimpio) {
      setError("Ingresá un DNI válido.");
      return;
    }

    if (!cotizacion?.clienteRefId) {
      setError("No se encontró el cliente asociado.");
      return;
    }

    setGuardandoDni(true);
    setError("");
    setExito("");

    await updateDoc(doc(db, "clientes", cotizacion.clienteRefId), {
      dni: dniLimpio,
      updatedAt: new Date(),
    });

    await updateDoc(doc(db, "cotizaciones", cotizacion.firebaseId), {
      clienteDNI: dniLimpio,
      updatedAt: new Date(),
    });

    setDniRapido("");
    setExito("DNI actualizado correctamente.");
    await cargarDetalle();
  } catch (err) {
    console.error(err);
    setError("No se pudo actualizar el DNI del cliente.");
  } finally {
    setGuardandoDni(false);
  }
};

const abrirEdicion = () => {

  if (!puedeEditarCotizacion) {
    setError("No tenés permisos para editar cotizaciones.");
    return;
    }

  if (!cotizacion) return;

  if (cotizacion.convertidaAVenta) {
    setError("No se puede editar una cotización convertida a venta.");
    return;
  }

  if ((cotizacion.estadoCotizacion || "") === "anulada") {
    setError("No se puede editar una cotización anulada.");
    return;
  }

  setEditFechaValidez(cotizacion.fechaValidez || "");
  setEditNotas(cotizacion.notas || "");
  setEditVendedorUid(cotizacion.vendedorUid || "");
  const subtotalActual = items
  .filter((item) => (item.estadoItem || "activo") === "activo")
  .reduce(
    (acc, item) =>
      acc +
      Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
    0
  );

const descuentoActual = Number(cotizacion.descuento || 0);

const descuentoPorcentajeActual =
  subtotalActual > 0 && descuentoActual > 0
    ? (descuentoActual / subtotalActual) * 100
    : 0;

setEditDescuento(descuentoPorcentajeActual);

setEditItems(
  items
    .filter((item) => (item.estadoItem || "activo") === "activo")
    .map((item) => ({
      firebaseId: item.firebaseId || "",

      descripcion: item.descripcion || "",
      cantidad: Number(item.cantidad || 0),
      precioUnitario: Number(item.precioUnitario || 0),
      excluirDescuento: item.excluirDescuento === true,

      origenPrecio: item.origenPrecio || "manual",

      listaPrecioId: item.listaPrecioId || "",
      listaPrecioNombre: item.listaPrecioNombre || "",

      productoListaNombre: item.productoListaNombre || "",
      productoBaseId: item.productoBaseId || "",

      imagenUrl: item.imagenUrl || "",
      imagenThumb: item.imagenThumb || "",

      reglaCantidad: item.reglaCantidad || null,

      adicionalesSeleccionados: Array.isArray(item.adicionalesSeleccionados)
        ? item.adicionalesSeleccionados
        : [],

      precioDetalleInterno: item.precioDetalleInterno || null,

      varianteId:
        item.varianteId ||
        item.precioDetalleInterno?.varianteId ||
        "",

      varianteNombre:
        item.varianteNombre ||
        item.precioDetalleInterno?.varianteNombre ||
        "",
    }))
);

  setMenuOpcionesAbierto(false);
  setEditando(true);
};

const agregarItemEdicion = () => {
  setEditItems((prev) => [
    ...prev,
    {
      descripcion: "",
      cantidad: 1,
      precioUnitario: 0,
      excluirDescuento: false,

      origenPrecio: "manual",
      listaPrecioId: "",
      listaPrecioNombre: "",
      productoListaNombre: "",
      productoBaseId: "",
      imagenUrl: "",
      imagenThumb: "",
      reglaCantidad: null,
      adicionalesSeleccionados: [],
      precioDetalleInterno: null,
      varianteId: "",
      varianteNombre: "",
    },
  ]);
};

const actualizarItemEdicion = (index, campo, valor) => {
  setEditItems((prev) =>
    prev.map((item, i) =>
      i === index ? { ...item, [campo]: valor } : item
    )
  );
};

const abrirSelectorPrecioEdicion = (index) => {
  setItemPrecioEdicionIndex(index);
  setModalPrecioEdicionAbierto(true);
  setError("");
};

const aplicarProductoSeleccionadoEdicion = (datosPrecio) => {
  if (itemPrecioEdicionIndex === null) return;

  setEditItems((prev) =>
    prev.map((item, index) =>
      index === itemPrecioEdicionIndex
        ? {
            ...item,
            ...datosPrecio,
          }
        : item
    )
  );

  setModalPrecioEdicionAbierto(false);
  setItemPrecioEdicionIndex(null);
  setError("");
};

const eliminarItemEdicion = (index) => {
  if (editItems.length === 1) return;
  setEditItems((prev) => prev.filter((_, i) => i !== index));
};

const editItemsNormalizados = editItems.map((item) => ({
  ...item,
  cantidad: Number(item.cantidad || 0),
  precioUnitario: Number(item.precioUnitario || 0),
  subtotal: Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
}));

const editSubtotal = editItemsNormalizados.reduce(
  (acc, item) => acc + Number(item.subtotal || 0),
  0
);

const editSubtotalAplicableDescuento = editItemsNormalizados
  .filter((item) => item.excluirDescuento !== true)
  .reduce(
    (acc, item) => acc + Number(item.subtotal || 0),
    0
  );

const editDescuentoMonto =
  editSubtotalAplicableDescuento > 0 &&
  Number(editDescuento || 0) > 0
    ? editSubtotalAplicableDescuento *
      (Number(editDescuento || 0) / 100)
    : 0;

const editTotal = editSubtotal - editDescuentoMonto;

const editVendedorSeleccionado =
  usuarios.find((u) => u.uid === editVendedorUid) || null;

const guardarEdicionCotizacion = async () => {
  try {
    if (!cotizacion) return;

    setGuardandoEdicion(true);
    setError("");
    setExito("");

    const itemsValidos = editItemsNormalizados.filter(
      (item) =>
        item.descripcion.trim() &&
        Number(item.cantidad) > 0 &&
        Number(item.precioUnitario) >= 0
    );

    if (!itemsValidos.length) {
      setError("Agregá al menos un ítem válido.");
      return;
    }

    await actualizarCotizacion({
      perfil,
      cotizacion,
      fechaValidez: editFechaValidez,
      items: itemsValidos,
      descuento: puedeOtorgarDescuentoCotizacion ? editDescuentoMonto : 0,
      notas: editNotas,
      vendedor: editVendedorSeleccionado,
    });

    setEditando(false);
    await cargarDetalle();
    setExito("Cotización editada correctamente.");
  } catch (err) {
    console.error(err);
    setError(err.message || "No se pudo editar la cotización.");
  } finally {
    setGuardandoEdicion(false);
  }
};

const handleAnularCotizacion = async () => {
  try {
    if (!puedeAnularCotizacion) {
        setError("No tenés permisos para anular cotizaciones.");
        return;
        }
    if (!cotizacion) return;

    if (cotizacion.convertidaAVenta) {
      setError("No se puede anular una cotización ya convertida a venta.");
      return;
    }

    if ((cotizacion.estadoCotizacion || "") === "anulada") {
      setError("Esta cotización ya está anulada.");
      return;
    }

    const motivo = window.prompt("Motivo de anulación:", "");
    if (motivo === null) return;

    const ok = window.confirm(
      `¿Seguro que querés anular la cotización #${cotizacion.numeroCotizacion}?`
    );

    if (!ok) return;

    setAnulando(true);
    setError("");
    setExito("");
    setMenuOpcionesAbierto(false);

    await anularCotizacion({
      perfil,
      cotizacionId: cotizacion.firebaseId,
      motivoAnulacion: motivo,
    });

    await cargarDetalle();

    setExito("Cotización anulada correctamente.");
  } catch (err) {
    console.error(err);
    setError(err.message || "No se pudo anular la cotización.");
  } finally {
    setAnulando(false);
  }
};

const handleConvertirAVenta = () => {

    if (!puedeConvertirCotizacion) {
        setError("No tenés permisos para convertir cotizaciones a venta.");
        return;
    }

  if (!cotizacion) return;

  if (cotizacion.convertidaAVenta) {
    setError("Esta cotización ya fue convertida a venta.");
    return;
  }

  if ((cotizacion.estadoCotizacion || "") === "anulada") {
    setError("No se puede convertir una cotización anulada.");
    return;
  }

const itemsVenta = items
  .filter((item) => (item.estadoItem || "activo") === "activo")
  .map((item) => ({
    descripcion: item.descripcion || "",
    cantidad: Number(item.cantidad || 0),
    precioUnitario: Number(item.precioUnitario || 0),
    excluirDescuento: item.excluirDescuento === true,

    origenPrecio: item.origenPrecio || "manual",
    listaPrecioId: item.listaPrecioId || "",
    listaPrecioNombre: item.listaPrecioNombre || "",
    productoListaNombre: item.productoListaNombre || "",
    productoBaseId: item.productoBaseId || "",
    imagenUrl: item.imagenUrl || "",
    imagenThumb: item.imagenThumb || "",
    reglaCantidad: item.reglaCantidad || null,
    adicionalesSeleccionados: item.adicionalesSeleccionados || [],
    precioDetalleInterno: item.precioDetalleInterno || null,
  }));

  onPrepararVenta({
    cotizacion,
    items: itemsVenta,
  });
};

 

  if (!cotizacion) {
    return (
      <div className="ventas-page">
        <div className="ventas-card">
          <p>Cargando cotización...</p>
        </div>
      </div>
    );
  }

  const descuento = Number(cotizacion.descuento || 0);

  return (
    <div className="ventas-page cotizacion-print-area">
      <div className="ventas-topbar cotizacion-detalle-topbar cotizacion-screen-only">

        <div className="cotizacion-negocio-info">
          {configNegocio.logoUrl && (
            <img
              src={configNegocio.logoUrl}
              alt="Logo negocio"
              className="cotizacion-logo"
            />
          )}

          <div>
            <h1>Cotización #{cotizacion.numeroCotizacion}</h1>
            <p>{configNegocio.nombreVisible || "Cotización"}</p>
          </div>
        </div>

        <div className="cotizacion-detalle-actions">
            <button
                className="btn btn-secondary"
                onClick={() => setMenuOpcionesAbierto((prev) => !prev)}
            >
                ⋯
            </button>

            {menuOpcionesAbierto && (
                <div className="cotizacion-opciones-menu">
                <button onClick={() => window.print()}>
                    Imprimir
                </button>

                {!cotizacion.convertidaAVenta &&
                    (cotizacion.estadoCotizacion || "") !== "anulada" && (
                    <button
                        onClick={handleConvertirAVenta}
                        disabled={!puedeConvertirCotizacion || convirtiendo}
                    >
                        {convirtiendo ? "Convirtiendo..." : "Convertir a venta"}
                    </button>
                    )}

                    <button
                    onClick={abrirEdicion}
                    disabled={
                        !puedeEditarCotizacion ||
                        cotizacion.convertidaAVenta ||
                        (cotizacion.estadoCotizacion || "") === "anulada"
                    }
                    >
                    Editar
                    </button>

                    <button
                    onClick={handleAnularCotizacion}
                    disabled={
                    !puedeAnularCotizacion ||
                    anulando ||
                    cotizacion.convertidaAVenta ||
                    (cotizacion.estadoCotizacion || "") === "anulada"
                    }
                    >
                    {anulando ? "Anulando..." : "Anular"}
                    </button>
                </div>
            )}

            <button className="btn btn-secondary" onClick={onVolver}>
                Volver
            </button>
            </div>
        {error && <div className="ventas-alert ventas-alert-error">{error}</div>}
        {exito && <div className="ventas-alert ventas-alert-ok">{exito}</div>}
      </div>

      <section className="ventas-card cotizacion-screen-only">
        <div className="ventas-top-editable factura-info-grid">
          <div className="ventas-top-editable-item">
            <span>Cliente</span>
            <strong>{cotizacion.clienteNombre || "-"}</strong>
          </div>

          <div className="ventas-top-editable-item">
            <span>Fecha</span>
            <strong>{cotizacion.fechaCotizacion || "-"}</strong>
          </div>

          <div className="ventas-top-editable-item">
            <span>Validez</span>
            <strong>{cotizacion.fechaValidez || "-"}</strong>
          </div>

            <div className="ventas-top-editable-item">
            <span>Vendedor</span>
            <strong>
                {cotizacion.vendedorNombre || cotizacion.vendedorEmail || "-"}
            </strong>
            </div>

            <div
            className={`ventas-top-editable-item ${
                cotizacion.convertidaAVenta
                ? "cotizacion-estado-convertida"
                : cotizacion.estadoCotizacion === "anulada"
                ? "cotizacion-estado-anulada"
                : ""
            }`}
            >
            <span>Estado</span>

            <strong>
                {cotizacion.convertidaAVenta
                ? `Convertida a venta #${cotizacion.ventaVisibleId || "-"}`
                : cotizacion.estadoCotizacion === "anulada"
                ? "Anulada"
                : cotizacion.estadoCotizacion || "Borrador"}
            </strong>
            </div>
        </div>

     {!String(cotizacion.clienteDNI || "").trim() && (
        <div className="cotizacion-documento-tip">
            <span>Documento de identidad: —</span>
            <span className="cotizacion-tooltip-icon">
            ⓘ
            <small>
                Cliente sin documento cargado. Podés completarlo antes de guardar la venta.
            </small>
            </span>
        </div>
        )}

        {cotizacion.notas && (
          <div className="ventas-subpanel">
            <strong>Notas</strong>
            <p style={{ marginBottom: 0 }}>{cotizacion.notas}</p>
          </div>
        )}
      </section>

      <section className="ventas-card cotizacion-screen-only">
        <div className="ventas-card-header">
          <h2>Ítems cotizados</h2>
        </div>

        <div className="ventas-table-wrap">
          <table className="ventas-table cotizacion-detalle-items-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Subtotal</th>

              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.firebaseId}>
                  <td className="ventas-producto-td">
                    <div className="ventas-producto-row">
                      <div className="ventas-producto-img">
                        {item.imagenThumb || item.imagenUrl ? (
                          <img
                            src={item.imagenThumb || item.imagenUrl}
                            alt={item.descripcion || "Producto"}
                          />
                        ) : (
                          <span />
                        )}
                      </div>

                      <div className="ventas-producto-main ventas-producto-main-lista">
                        <span className="ventas-producto-nombre">
                          {item.descripcion || "Producto sin descripción"}
                        </span>

                        {item.origenPrecio === "lista_precio" && (
                          <small className="ventas-item-source">Lista de precios</small>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="ventas-cantidad-td">{item.cantidad}</td>

                  <td className="ventas-money-td">
                    {formatearMoneda(
                      item.precioUnitario,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </td>

                  <td className="ventas-money-td ventas-subtotal-td">
                    {formatearMoneda(
                      item.subtotal,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ventas-card cotizacion-resumen-final cotizacion-screen-only">
        <div className="ventas-resumen-row">
          <span>Subtotal</span>
          <strong>
            {formatearMoneda(
              cotizacion.subtotal,
              configMoneda.moneda,
              configMoneda.localeMoneda
            )}
          </strong>
        </div>

        {descuento > 0 && (
          <div className="ventas-resumen-row">
            <span>Descuento</span>
            <strong>
              {formatearMoneda(
                descuento,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
            </strong>
          </div>
        )}

        <div className="ventas-resumen-row ventas-total">
          <span>Total</span>
          <strong>
            {formatearMoneda(
              cotizacion.total,
              configMoneda.moneda,
              configMoneda.localeMoneda
            )}
          </strong>
        </div>
      </section>

      <div className="cotizacion-print-only">

        <div className="cotizacion-print-header">
          <div className="cotizacion-print-negocio">
            {configNegocio.logoUrl && (
              <img
                src={configNegocio.logoUrl}
                alt="Logo negocio"
                className="cotizacion-print-logo"
              />
            )}

            <div>
              <h1>Cotización #{cotizacion.numeroCotizacion}</h1>
              <p>{configNegocio.nombreVisible || "Cotización"}</p>
            </div>
          </div>
        </div>

        <div className="cotizacion-print-info">
          <div>
            <span>Cliente</span>
            <strong>{cotizacion.clienteNombre || "-"}</strong>
          </div>

          <div>
            <span>Fecha</span>
            <strong>{cotizacion.fechaCotizacion || "-"}</strong>
          </div>

          <div>
            <span>Validez</span>
            <strong>{cotizacion.fechaValidez || "-"}</strong>
          </div>

          <div>
            <span>Vendedor</span>
            <strong>
              {cotizacion.vendedorNombre ||
                cotizacion.vendedorEmail ||
                "-"}
            </strong>
          </div>

          {String(cotizacion.clienteDNI || "").trim() && (
            <div>
              <span>Documento</span>
              <strong>{cotizacion.clienteDNI}</strong>
            </div>
          )}
        </div>

        {cotizacion.notas && (
          <div className="cotizacion-print-notas">
            <span>Notas</span>
            <p>{cotizacion.notas}</p>
          </div>
        )}

        <div className="cotizacion-print-items">
          <h2>Ítems cotizados</h2>

          <table>
            <colgroup>
              <col className="print-col-producto" />
              <col className="print-col-cantidad" />
              <col className="print-col-precio" />
              <col className="print-col-subtotal" />
            </colgroup>

            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.firebaseId}>
                  <td>
                    <div className="cotizacion-print-producto">
                      <div className="cotizacion-print-producto-imagen">
                        {(item.imagenThumb || item.imagenUrl) && (
                          <img
                            src={item.imagenThumb || item.imagenUrl}
                            alt=""
                          />
                        )}
                      </div>

                      <span>
                        {item.descripcion || "Producto sin descripción"}
                      </span>
                    </div>
                  </td>

                  <td className="print-center">
                    {item.cantidad}
                  </td>

                  <td className="print-money">
                    {formatearMoneda(
                      item.precioUnitario,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </td>

                  <td className="print-money">
                    {formatearMoneda(
                      item.subtotal,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cotizacion-print-resumen">
          <div>
            <span>Subtotal</span>
            <strong>
              {formatearMoneda(
                cotizacion.subtotal,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
            </strong>
          </div>

          {descuento > 0 && (
            <div>
              <span>Descuento</span>
              <strong>
                {formatearMoneda(
                  descuento,
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
            </div>
          )}

          <div className="cotizacion-print-total">
            <span>Total</span>
            <strong>
              {formatearMoneda(
                cotizacion.total,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
            </strong>
          </div>
        </div>

      </div>

      {editando && (
        <div className="ventas-importar-overlay">
            <div className="ventas-importar-modal cotizacion-modal">
            <div className="ventas-card-header">
                <h2>Editar cotización #{cotizacion.numeroCotizacion}</h2>

                <button
                className="btn btn-secondary btn-xs"
                onClick={() => setEditando(false)}
                >
                Cerrar
                </button>
            </div>

            <div className="cotizacion-fechas-row">
                <div className="ventas-field">
                <label>Fecha</label>
                <input type="date" value={cotizacion.fechaCotizacion || ""} disabled />
                </div>

                

                <div className="ventas-field">
                <label>Validez hasta</label>
                <input
                    type="date"
                    value={editFechaValidez}
                    onChange={(e) => setEditFechaValidez(e.target.value)}
                />
                </div>
            </div>

            <div className="cotizacion-cliente-vendedor-row ventas-mt">
                <div className="ventas-field">
                    <label>Cliente</label>
                    <input value={cotizacion.clienteNombre || "-"} disabled />
                </div>

                <div className="ventas-field">
                    <label>Vendedor opcional</label>
                    <select
                    value={editVendedorUid}
                    onChange={(e) => setEditVendedorUid(e.target.value)}
                    >
                    <option value="">Sin vendedor asignado</option>
                    {usuarios.map((u) => (
                        <option key={u.uid} value={u.uid}>
                        {u.nombre || u.email || "Usuario sin nombre"}
                        </option>
                    ))}
                    </select>
                </div>
                </div>

            <div className="ventas-field ventas-mt">
                <label>Notas</label>
                <input
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                />
            </div>

            <div className="ventas-items-actions ventas-mt">
                <button className="btn btn-primary" onClick={agregarItemEdicion}>
                + Agregar ítem
                </button>
            </div>

            <div className="ventas-table-wrap">
                <table className="ventas-table">
                <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Cant.</th>
                      <th>Precio</th>
                      <th>Subtotal</th>
                      <th>Excluir desc.</th>
                      <th></th>
                    </tr>
                </thead>

                <tbody>
                    {editItemsNormalizados.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <div className="ventas-descripcion-selector">
                          <input
                            value={item.descripcion}
                            onChange={(e) =>
                              actualizarItemEdicion(index, "descripcion", e.target.value)
                            }
                          />

                          <button
                            type="button"
                            className="ventas-selector-precio-btn"
                            onClick={() => abrirSelectorPrecioEdicion(index)}
                            title="Agregar desde lista de precios"
                          />
                        </div>
                      </td>

                        <td>
                        <input
                            type="number"
                            value={item.cantidad === 0 ? "" : item.cantidad}
                            onChange={(e) =>
                            actualizarItemEdicion(index, "cantidad", e.target.value)
                            }
                            placeholder="0"
                        />
                        </td>

                        <td>
                        <input
                            type="number"
                            value={item.precioUnitario === 0 ? "" : item.precioUnitario}
                            onChange={(e) =>
                            actualizarItemEdicion(index, "precioUnitario", e.target.value)
                            }
                            placeholder="0"
                        />
                        </td>

                        <td>
                        {formatearMoneda(
                            item.subtotal,
                            configMoneda.moneda,
                            configMoneda.localeMoneda
                        )}
                        </td>

                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={item.excluirDescuento === true}
                            onChange={(e) =>
                              actualizarItemEdicion(
                                index,
                                "excluirDescuento",
                                e.target.checked
                              )
                            }
                          />
                        </td>

                        <td>
                        <button
                            className="btn btn-danger btn-xs"
                            onClick={() => eliminarItemEdicion(index)}
                            disabled={editItems.length === 1}
                        >
                            X
                        </button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>

            <div className="ventas-card ventas-mt cotizacion-resumen-card">
                <div className="ventas-resumen">
                <div className="ventas-resumen-row">
                    <span>Subtotal</span>
                    <strong>
                    {formatearMoneda(
                        editSubtotal,
                        configMoneda.moneda,
                        configMoneda.localeMoneda
                    )}
                    </strong>
                </div>

                <div className="ventas-field">
                    <label>Descuento %</label>
                  <input
                    type="number"
                    value={puedeOtorgarDescuentoCotizacion ? editDescuento : 0}
                    onChange={(e) => setEditDescuento(e.target.value)}
                    disabled={!puedeOtorgarDescuentoCotizacion}
                  />
                </div>

                {Number(editDescuentoMonto || 0) > 0 && (
                    <div className="ventas-resumen-row">
                    <span>Descuento</span>
                    <strong>
                        {formatearMoneda(
                        editDescuentoMonto,
                        configMoneda.moneda,
                        configMoneda.localeMoneda
                        )}
                    </strong>
                    </div>
                )}

                <div className="ventas-resumen-row ventas-total">
                    <span>Total</span>
                    <strong>
                    {formatearMoneda(
                        editTotal,
                        configMoneda.moneda,
                        configMoneda.localeMoneda
                    )}
                    </strong>
                </div>

                <button
                    className="btn btn-primary btn-full"
                    onClick={guardarEdicionCotizacion}
                    disabled={guardandoEdicion}
                >
                    {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
                </button>
                </div>
            </div>
            </div>
        </div>
        )}

        <ProductoSelectorModal
          open={modalPrecioEdicionAbierto}
          perfil={perfil}
          configMoneda={configMoneda}
          itemActual={
            itemPrecioEdicionIndex !== null
              ? editItems[itemPrecioEdicionIndex]
              : null
          }
          onClose={() => {
            setModalPrecioEdicionAbierto(false);
            setItemPrecioEdicionIndex(null);
          }}
          onAplicar={aplicarProductoSeleccionadoEdicion}
        />  

    </div>
  );
}