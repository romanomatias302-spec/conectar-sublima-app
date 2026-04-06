import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { crearVenta } from "../../firebase/ventas";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import "./VentasPage.css";
import { puedeHacer } from "../../utils/permisos";

const itemVacio = () => ({
  descripcion: "",
  cantidad: 1,
  precioUnitario: 0,
});

const clienteRapidoInicial = {
  nombre: "",
  dni: "",
  telefono: "",
};

export default function VentasPage({ perfil }) {
  const [clientes, setClientes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteRefId, setClienteRefId] = useState("");
  const [pedidoRefId, setPedidoRefId] = useState("");

  const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState([itemVacio()]);
  const [descuento, setDescuento] = useState(0);
  const [pagosIniciales, setPagosIniciales] = useState([
    { monto: 0, medioPago: "efectivo" }
  ]);
  const [observaciones, setObservaciones] = useState("");

  const [mostrarClienteRapido, setMostrarClienteRapido] = useState(false);
  const [clienteRapido, setClienteRapido] = useState(clienteRapidoInicial);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  const puedeCrearVentas = puedeHacer(perfil, "ventas", "crear");
  const puedeEditarVentas = puedeHacer(perfil, "ventas", "editar");
  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");

  const cargarDatosBase = async () => {
    try {
      if (!perfil) return;

      const clientesRef = collection(db, "clientes");
      const pedidosRef = collection(db, "pedidos");

      const qClientes =
        perfil.rol === "superadmin"
          ? query(clientesRef)
          : query(clientesRef, where("clienteId", "==", perfil.clienteId));

      const qPedidos =
        perfil.rol === "superadmin"
          ? query(pedidosRef, orderBy("createdAt", "desc"), limit(50))
          : query(
              pedidosRef,
              where("clienteId", "==", perfil.clienteId),
              orderBy("createdAt", "desc"),
              limit(50)
            );

      const [snapClientes, snapPedidos] = await Promise.all([
        getDocs(qClientes),
        getDocs(qPedidos),
      ]);

      setClientes(
        snapClientes.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
      );

      setPedidos(
        snapPedidos.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
      );
    } catch (err) {
      console.error("Error cargando datos de ventas:", err);
    }
  };

 

  useEffect(() => {
    cargarDatosBase();
  }, [perfil]);

  const clientesFiltrados = useMemo(() => {
    const texto = (busquedaCliente || "").trim().toLowerCase();
    if (!texto) return clientes;

      

    return clientes.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const dni = (c.dni || "").toString().toLowerCase();
      const telefono = (c.telefono || "").toLowerCase();
      return (
        nombre.includes(texto) ||
        dni.includes(texto) ||
        telefono.includes(texto)
      );
    });
  }, [clientes, busquedaCliente]);

  const clienteSeleccionado = useMemo(
    () => clientes.find((c) => c.firebaseId === clienteRefId) || null,
    [clientes, clienteRefId]
  );

  const pedidoSeleccionado = useMemo(
    () => pedidos.find((p) => p.firebaseId === pedidoRefId) || null,
    [pedidos, pedidoRefId]
  );

  const itemsNormalizados = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        cantidad: Number(item.cantidad || 0),
        precioUnitario: Number(item.precioUnitario || 0),
        subtotal: Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
      })),
    [items]
  );

  const subtotal = useMemo(
    () => itemsNormalizados.reduce((acc, item) => acc + item.subtotal, 0),
    [itemsNormalizados]
  );

  const total = useMemo(
    () => subtotal - Number(descuento || 0),
    [subtotal, descuento]
  );

 const totalPagadoInicial = useMemo(() => {
    return pagosIniciales.reduce(
      (acc, pago) => acc + Number(pago.monto || 0),
      0
    );
  }, [pagosIniciales]);

  const saldo = useMemo(() => {
    const valor = total - totalPagadoInicial;
    return valor < 0 ? 0 : valor;
  }, [total, totalPagadoInicial]);

  const agregarItem = () => {
    setItems((prev) => [...prev, itemVacio()]);
  };

  const eliminarItem = (index) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const actualizarItem = (index, campo, valor) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [campo]: valor } : item
      )
    );
  };

  const resetearFormulario = () => {
    setBusquedaCliente("");
    setClienteRefId("");
    setPedidoRefId("");
    setFechaVenta(new Date().toISOString().split("T")[0]);
    setItems([itemVacio()]);
    setDescuento(0);
    setPagosIniciales([{ monto: 0, medioPago: "efectivo" }]);
    setObservaciones("");
    setMostrarClienteRapido(false);
    setClienteRapido(clienteRapidoInicial);
  };

  const guardarClienteRapido = async () => {
    try {
      if (!puedeCrearClientes) {
        setError("No tenés permisos para crear clientes.");
        return;
      }
      if (!clienteRapido.nombre.trim()) {
        setError("El nombre del cliente rápido es obligatorio.");
        return;
      }

      const datos = {
        nombre: clienteRapido.nombre.trim(),
        dni: clienteRapido.dni ? clienteRapido.dni.toString() : "",
        telefono: clienteRapido.telefono || "",
        direccion: "",
        localidad: "",
        provincia: "",
        email: "",
        clienteId: perfil?.clienteId || "",
      };

      const docRef = await addDoc(collection(db, "clientes"), {
        ...datos,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const nuevoCliente = {
        firebaseId: docRef.id,
        ...datos,
      };

      setClientes((prev) => [nuevoCliente, ...prev]);
      setClienteRefId(docRef.id);
      setBusquedaCliente(
        `${nuevoCliente.nombre}${nuevoCliente.dni ? ` - ${nuevoCliente.dni}` : ""}`
      );
      setClienteRapido(clienteRapidoInicial);
      setMostrarClienteRapido(false);
      setError("");
    } catch (err) {
      console.error(err);
      setError("No se pudo crear el cliente rápido.");
    }
  };

    const actualizarPagoInicial = (index, campo, valor) => {
        setPagosIniciales((prev) =>
        prev.map((pago, i) =>
            i === index ? { ...pago, [campo]: valor } : pago
        )
        );
    };

    const agregarPagoInicial = () => {
        setPagosIniciales((prev) => [
        ...prev,
        { monto: 0, medioPago: "efectivo" }
        ]);
    };

    const eliminarPagoInicial = (index) => {
        if (pagosIniciales.length === 1) return;
        setPagosIniciales((prev) => prev.filter((_, i) => i !== index));
    };

  const guardarVenta = async () => {
    try {
      if (!puedeCrearVentas) {
        setError("No tenés permisos para crear ventas.");
        return;
      }
      setGuardando(true);
      setError("");
      setExito("");

      const cliente = clientes.find((c) => c.firebaseId === clienteRefId);
      if (!cliente) {
        setError("Seleccioná un cliente.");
        return;
      }

      const itemsValidos = itemsNormalizados.filter(
        (item) =>
          item.descripcion.trim() &&
          Number(item.cantidad) > 0 &&
          Number(item.precioUnitario) >= 0
      );

      if (!itemsValidos.length) {
        setError("Agregá al menos un ítem válido.");
        return;
      }

      await crearVenta({
        perfil,
        cliente,
        fechaVenta,
        items: itemsValidos,
        descuento: Number(descuento || 0),
        pedidoAsociado: pedidoSeleccionado || null,
        pagosIniciales: pagosIniciales.map((pago) => ({
          monto: Number(pago.monto || 0),
          medioPago: pago.medioPago || "efectivo",
          fechaPago: fechaVenta,
          observacion: Number(pago.monto || 0) > 0 ? "Pago inicial" : "",
        })),
        observaciones,
      });

      setExito("Venta guardada con éxito.");
      resetearFormulario();
      
      await cargarDatosBase();
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar la venta.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="ventas-page">
      <div className="ventas-topbar">
        <div>
          <h1>Ventas</h1>
          
        </div>
      </div>

      {error && <div className="ventas-alert ventas-alert-error">{error}</div>}
      {exito && <div className="ventas-alert ventas-alert-ok">{exito}</div>}

      <div className="ventas-layout">
        <section className="ventas-card ventas-card-lg">
          <div className="ventas-card-header">
            <h2>Datos de la venta</h2>
          </div>

        <div className="ventas-grid ventas-grid-top">
            <div className="ventas-field">
              <label>Fecha</label>
              <input
                type="date"
                value={fechaVenta}
                disabled
              />
            </div>

            <div className="ventas-field ventas-field-cliente">
              <label>Seleccionar cliente</label>
              <div className="ventas-cliente-inline">
                <input
                  list="clientes-sugeridos"
                  placeholder="Escribí para buscar cliente..."
                  value={busquedaCliente}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setBusquedaCliente(valor);

                    const clienteEncontrado = clientes.find((c) => {
                      const textoOpcion = `${c.nombre || ""}${c.dni ? ` - ${c.dni}` : ""}`;
                      return textoOpcion === valor;
                    });

                    if (clienteEncontrado) {
                      setClienteRefId(clienteEncontrado.firebaseId);
                    }
                  }}
                  disabled={!puedeCrearVentas}
                />

                <datalist id="clientes-sugeridos">
                  {clientesFiltrados.map((c) => (
                    <option
                      key={c.firebaseId}
                      value={`${c.nombre || ""}${c.dni ? ` - ${c.dni}` : ""}`}
                    />
                  ))}
                </datalist>

                  {puedeCrearClientes && (
                    <button
                      type="button"
                      className="btn btn-secondary ventas-btn-inline"
                      onClick={() => setMostrarClienteRapido((prev) => !prev)}
                      disabled={!puedeCrearVentas}
                    >
                      {mostrarClienteRapido ? "Cerrar" : "Cliente rápido"}
                    </button>
                  )}
              </div>
            </div>
          </div>

          {mostrarClienteRapido && puedeCrearClientes && (
            <div className="ventas-subpanel">
              <h3>Cliente rápido</h3>
              <div className="ventas-grid ventas-grid-3">
                <div className="ventas-field">
                  <label>Nombre</label>
                  <input
                    value={clienteRapido.nombre}
                    onChange={(e) =>
                      setClienteRapido((prev) => ({ ...prev, nombre: e.target.value }))
                    }
                    disabled={!puedeCrearClientes}
                  />
                </div>

                <div className="ventas-field">
                  <label>DNI</label>
                  <input
                    value={clienteRapido.dni}
                    onChange={(e) =>
                      setClienteRapido((prev) => ({ ...prev, dni: e.target.value }))
                    }
                    disabled={!puedeCrearClientes}
                  />
                </div>

                <div className="ventas-field">
                  <label>Teléfono</label>
                  <input
                    value={clienteRapido.telefono}
                    onChange={(e) =>
                      setClienteRapido((prev) => ({ ...prev, telefono: e.target.value }))
                    }
                    disabled={!puedeCrearClientes}
                  />
                </div>
              </div>

              <div className="ventas-actions-row">
                <button className="btn btn-primary" onClick={guardarClienteRapido}>
                  Guardar cliente rápido
                </button>
              </div>
            </div>
          )}

          <div className="ventas-grid ventas-grid-pedido ventas-mt">
            <div className="ventas-field ventas-pedido-field">
              <label>Asociar pedido (opcional)</label>
              <select
                value={pedidoRefId}
                onChange={(e) => setPedidoRefId(e.target.value)}
                disabled={!puedeCrearVentas}
              >
                <option value="">Sin pedido asociado</option>
                {pedidos.map((p) => (
                  <option key={p.firebaseId} value={p.firebaseId}>
                    #{p.id} - {p.cliente} - {p.fechaPedido}
                  </option>
                ))}
              </select>
            </div>

            <div className="ventas-field">
              <label>Observaciones</label>
              <input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Detalle extra de la venta..."
                disabled={!puedeCrearVentas}
              />
            </div>
          </div>

          

          <div className="ventas-items-actions">
            <button className="btn btn-primary" onClick={agregarItem} disabled={!puedeCrearVentas}>
              + Agregar ítem
            </button>
          </div>

          <div className="ventas-table-wrap">
            <table className="ventas-table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {itemsNormalizados.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        value={item.descripcion}
                        onChange={(e) =>
                          actualizarItem(index, "descripcion", e.target.value)
                        }
                        placeholder="Ej: Remera personalizada"
                        disabled={!puedeCrearVentas}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) =>
                          actualizarItem(index, "cantidad", e.target.value)
                        }
                        disabled={!puedeCrearVentas}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={item.precioUnitario}
                        onChange={(e) =>
                          actualizarItem(index, "precioUnitario", e.target.value)
                        }
                        disabled={!puedeCrearVentas}
                      />
                    </td>
                     <td>{formatearMoneda(item.subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        onClick={() => eliminarItem(index)}
                        disabled={items.length === 1 || !puedeCrearVentas}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="ventas-card ventas-card-sm ventas-card-sticky-wrap">
          <div className="ventas-card-sticky">
            <div className="ventas-card-header">
              <h2>Resumen</h2>
            </div>

            <div className="ventas-resumen">
              <div className="ventas-resumen-row">
                <span>Cliente</span>
                <strong>{clienteSeleccionado?.nombre || "-"}</strong>
              </div>

              <div className="ventas-resumen-row">
                <span>Pedido asociado</span>
                <strong>{pedidoSeleccionado ? `#${pedidoSeleccionado.id}` : "-"}</strong>
              </div>

              <div className="ventas-resumen-row">
                <span>Subtotal</span>
                <strong>{formatearMoneda(subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <div className="ventas-field">
                <label>Descuento</label>
                <input
                  type="number"
                  min="0"
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                  disabled={!puedeCrearVentas}
                />
              </div>

              <div className="ventas-resumen-row ventas-total">
                <span>Total</span>
                <strong>{formatearMoneda(total, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <div className="ventas-field">
                <label>Pagos iniciales</label>
              </div>

              <div className="ventas-pagos-lista">
                {pagosIniciales.map((pago, index) => (
                  <div className="ventas-pago-item" key={index}>
                    <input
                      type="number"
                      min="0"
                      placeholder="Monto"
                      value={pago.monto}
                      onChange={(e) =>
                        actualizarPagoInicial(index, "monto", e.target.value)
                      }
                      disabled={!puedeCrearVentas}
                    />

                    <select
                      value={pago.medioPago}
                      onChange={(e) =>
                        actualizarPagoInicial(index, "medioPago", e.target.value)
                      }
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="debito">Débito</option>
                      <option value="credito">Crédito</option>
                      <option value="mp">Mercado Pago</option>
                      <option value="otro">Otro</option>
                    </select>

                    <button
                      type="button"
                      className="ventas-pago-remove"
                      onClick={() => eliminarPagoInicial(index)}
                      disabled={pagosIniciales.length === 1 || !puedeCrearVentas}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="ventas-add-pago-btn"
                onClick={agregarPagoInicial}
                disabled={!puedeCrearVentas}
              >
                + Agregar otro pago
              </button>

              <div className="ventas-resumen-row">
                <span>Total pagado</span>
                <strong>{formatearMoneda(totalPagadoInicial, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <div className="ventas-resumen-row">
                <span>Saldo pendiente</span>
                <strong>{formatearMoneda(saldo, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={guardarVenta}
                disabled={guardando || !puedeCrearVentas}
              >
                {guardando ? "Guardando..." : "Guardar venta"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      
    </div>
  );
}