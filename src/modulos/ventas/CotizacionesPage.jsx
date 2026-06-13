import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  crearCotizacion,
  obtenerCotizacionesPaginadas,
} from "../../firebase/cotizaciones";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { puedeHacer } from "../../utils/permisos";
import "./VentasPage.css";

const itemVacio = () => ({
  descripcion: "",
  cantidad: 1,
  precioUnitario: 0,
  excluirDescuento: false,
});

const clienteRapidoInicial = {
  nombre: "",
  dni: "",
  telefono: "",
};

export default function CotizacionesPage({ perfil }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMas, setLoadingMas] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [modalCrear, setModalCrear] = useState(false);

  const [clientes, setClientes] = useState([]);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [mostrarDropdownCliente, setMostrarDropdownCliente] = useState(false);
  const [clienteRefId, setClienteRefId] = useState("");

  const [fechaCotizacion, setFechaCotizacion] = useState(
    new Date().toISOString().split("T")[0]
  );

const [fechaValidez, setFechaValidez] = useState("");
const [configNegocio, setConfigNegocio] = useState({
    nombreVisible: "",
    logoUrl: "",
  });

  const [items, setItems] = useState([itemVacio()]);
  const [descuento, setDescuento] = useState(0);
  const [notas, setNotas] = useState("");

  const [mostrarClienteRapido, setMostrarClienteRapido] = useState(false);
  const [clienteRapido, setClienteRapido] = useState(clienteRapidoInicial);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  const puedeCrearCotizacion = puedeHacer(perfil, "ventas", "crearCotizacion");
  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");

  const cargarCotizaciones = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await obtenerCotizacionesPaginadas({
        perfil,
        pageSize: 50,
      });

      setCotizaciones(res.cotizaciones);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las cotizaciones.");
    } finally {
      setLoading(false);
    }
  };

  const cargarMasCotizaciones = async () => {
    try {
      if (!ultimoDoc || !hayMas) return;

      setLoadingMas(true);

      const res = await obtenerCotizacionesPaginadas({
        perfil,
        ultimoDoc,
        pageSize: 50,
      });

      setCotizaciones((prev) => [...prev, ...res.cotizaciones]);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar más cotizaciones.");
    } finally {
      setLoadingMas(false);
    }
  };

  const cargarClientes = async () => {
    try {
      if (!perfil) return;

      const clientesRef = collection(db, "clientes");

      const qClientes =
        perfil.rol === "superadmin"
          ? query(clientesRef)
          : query(clientesRef, where("clienteId", "==", perfil.clienteId));

      const snapClientes = await getDocs(qClientes);

      setClientes(
        snapClientes.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
      );
    } catch (err) {
      console.error("Error cargando clientes:", err);
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
      console.error("Error cargando configuración del negocio:", err);
    }
  };

  useEffect(() => {
    if (!perfil) return;
    cargarCotizaciones();
    cargarClientes();
    cargarConfigNegocio();
  }, [perfil]);

  const cotizacionesFiltradas = useMemo(() => {
    const texto = (busqueda || "").trim().toLowerCase();

    return cotizaciones.filter((c) => {
      const coincideTexto =
        !texto ||
        String(c.numeroCotizacion || "").toLowerCase().includes(texto) ||
        String(c.clienteNombre || "").toLowerCase().includes(texto) ||
        String(c.clienteDNI || "").toLowerCase().includes(texto);

      const fecha = c.fechaCotizacion || "";

      const coincideDesde = !fechaDesde || fecha >= fechaDesde;
      const coincideHasta = !fechaHasta || fecha <= fechaHasta;

      return coincideTexto && coincideDesde && coincideHasta;
    });
  }, [cotizaciones, busqueda, fechaDesde, fechaHasta]);

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

  const itemsNormalizados = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        cantidad: Number(item.cantidad || 0),
        precioUnitario: Number(item.precioUnitario || 0),
        excluirDescuento: item.excluirDescuento === true,
        subtotal:
          Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
      })),
    [items]
  );

  const subtotal = useMemo(
    () => itemsNormalizados.reduce((acc, item) => acc + item.subtotal, 0),
    [itemsNormalizados]
  );

  const subtotalAplicableDescuento = useMemo(
    () =>
      itemsNormalizados
        .filter((item) => item.excluirDescuento !== true)
        .reduce((acc, item) => acc + item.subtotal, 0),
    [itemsNormalizados]
  );

  const descuentoMonto = useMemo(() => {
    const porcentaje = Number(descuento || 0);
    if (porcentaje <= 0) return 0;
    return subtotalAplicableDescuento * (porcentaje / 100);
  }, [subtotalAplicableDescuento, descuento]);

  const total = useMemo(
    () => subtotal - descuentoMonto,
    [subtotal, descuentoMonto]
  );

  const resetearFormulario = () => {
    setBusquedaCliente("");
    setClienteRefId("");
    setMostrarDropdownCliente(false);
    setFechaCotizacion(new Date().toISOString().split("T")[0]);
    setFechaValidez("");
    setItems([itemVacio()]);
    setDescuento(0);
    setNotas("");
    setMostrarClienteRapido(false);
    setClienteRapido(clienteRapidoInicial);
  };

  const usarClienteExistente = (clienteExistente) => {
    if (!clienteExistente?.firebaseId) return;

    setClienteRefId(clienteExistente.firebaseId);

    setBusquedaCliente(
      `${clienteExistente.nombre || ""}${
        clienteExistente.dni ? ` - ${clienteExistente.dni}` : ""
      }`
    );

    setClienteRapido(clienteRapidoInicial);
    setMostrarClienteRapido(false);
    setMostrarDropdownCliente(false);
    setError("");
  };

  const guardarClienteRapido = async () => {
    try {
      if (!puedeCrearClientes) {
        setError("No tenés permisos para crear clientes.");
        return;
      }

      const nombreLimpio = (clienteRapido.nombre || "").trim();
      const dniLimpio = String(clienteRapido.dni || "").trim();

      if (!nombreLimpio) {
        setError("El nombre del cliente rápido es obligatorio.");
        return;
      }

      if (dniLimpio) {
        const existentePorDni = clientes.find(
          (c) => String(c.dni || "").trim() === dniLimpio
        );

        if (existentePorDni) {
          const usarExistente = window.confirm(
            `Ya existe un cliente con el DNI ${dniLimpio}: ${
              existentePorDni.nombre || "Sin nombre"
            }.\n\n¿Querés usar ese cliente para esta cotización?`
          );

          if (usarExistente) {
            usarClienteExistente(existentePorDni);
            return;
          }

          setError("No se creó un cliente nuevo para evitar duplicar el DNI.");
          return;
        }
      }

      const datos = {
        nombre: nombreLimpio,
        dni: dniLimpio,
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
      usarClienteExistente(nuevoCliente);
    } catch (err) {
      console.error(err);
      setError("No se pudo crear el cliente rápido.");
    }
  };

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

  const guardarCotizacion = async () => {
    try {
      if (!puedeCrearCotizacion) {
        setError("No tenés permisos para crear cotizaciones.");
        return;
      }

      setGuardando(true);
      setError("");
      setExito("");

      if (!clienteSeleccionado) {
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

      await crearCotizacion({
        perfil,
        cliente: clienteSeleccionado,
        fechaCotizacion,
        fechaValidez,
        items: itemsValidos,
        descuento: Number(descuentoMonto || 0),
        notas,
      });

      setExito("Cotización guardada con éxito.");
      setModalCrear(false);
      resetearFormulario();
      await cargarCotizaciones();
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar la cotización.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="ventas-page">
      <div className="ventas-topbar">
        <div>
          <h1>Cotizaciones</h1>
          <p>Presupuestos creados para clientes.</p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setModalCrear(true)}
          disabled={!puedeCrearCotizacion}
        >
          + Nueva cotización
        </button>
      </div>

      {error && <div className="ventas-alert ventas-alert-error">{error}</div>}
      {exito && <div className="ventas-alert ventas-alert-ok">{exito}</div>}

      <div className="ventas-card">
        <div className="ventas-grid ventas-grid-3">
          <div className="ventas-field">
            <label>Buscar cliente / N°</label>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Cliente, DNI o número..."
            />
          </div>

          <div className="ventas-field">
            <label>Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>

          <div className="ventas-field">
            <label>Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="ventas-card">
        {loading && <p>Cargando cotizaciones...</p>}

        {!loading && (
          <>
            <div className="ventas-mobile-list">
              {cotizacionesFiltradas.map((c) => (
                <div key={c.firebaseId} className="venta-mobile-card">
                  <div className="venta-mobile-top">
                    <div>
                      <strong>Cotización #{c.numeroCotizacion || "-"}</strong>
                      <span>{c.clienteNombre || "Sin cliente"}</span>
                    </div>

                    <span className="ventas-estado-badge ventas-estado-ok">
                      {c.estadoCotizacion || "borrador"}
                    </span>
                  </div>

                  <div className="venta-mobile-info">
                    <div>
                      <small>Fecha</small>
                      <p>{c.fechaCotizacion || "-"}</p>
                    </div>

                    <div>
                      <small>Items</small>
                      <p>{c.cantidad || 0}</p>
                    </div>

                    <div>
                      <small>Total</small>
                      <p>
                        {formatearMoneda(
                          c.total,
                          configMoneda.moneda,
                          configMoneda.localeMoneda
                        )}
                      </p>
                    </div>
                  </div>

                  <button className="btn btn-primary venta-mobile-btn">
                    Ver detalle
                  </button>
                </div>
              ))}
            </div>

            <div className="ventas-table-wrap ventas-table-desktop">
              <table className="ventas-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {cotizacionesFiltradas.map((c) => (
                    <tr key={c.firebaseId}>
                      <td>#{c.numeroCotizacion || "-"}</td>
                      <td>{c.fechaCotizacion || "-"}</td>
                      <td>{c.clienteNombre || "-"}</td>
                      <td>{c.estadoCotizacion || "borrador"}</td>
                      <td>
                        {formatearMoneda(
                          c.total,
                          configMoneda.moneda,
                          configMoneda.localeMoneda
                        )}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-xs">
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}

                  {cotizacionesFiltradas.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", padding: 16 }}>
                        No se encontraron cotizaciones.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hayMas && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  onClick={cargarMasCotizaciones}
                  disabled={loadingMas}
                >
                  {loadingMas ? "Cargando..." : "Cargar más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {modalCrear && (
        <div className="ventas-importar-overlay">
          <div className="ventas-importar-modal cotizacion-modal">
            <div className="ventas-card-header cotizacion-header-negocio">
            <div className="cotizacion-negocio-info">
                {configNegocio.logoUrl && (
                <img
                    src={configNegocio.logoUrl}
                    alt="Logo negocio"
                    className="cotizacion-logo"
                />
                )}

                <div>
                <h2>Nueva cotización</h2>
                <p>{configNegocio.nombreVisible || "Cotización"}</p>
                </div>
            </div>

              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  setModalCrear(false);
                  resetearFormulario();
                }}
              >
                Cerrar
              </button>
            </div>

            <div className="ventas-grid ventas-grid-top">
              <div className="ventas-field">
                <label>Fecha</label>
                <input type="date" value={fechaCotizacion} disabled />
              </div>
              <div className="ventas-field">
                <label>Validez hasta</label>
                <input
                    type="date"
                    value={fechaValidez}
                    onChange={(e) => setFechaValidez(e.target.value)}
                />
            </div>

              <div className="ventas-field ventas-field-cliente">
                <label>Seleccionar cliente</label>

                <div className="ventas-cliente-inline">
                  <div className="ventas-cliente-buscador">
                    <input
                      placeholder="Escribí para buscar cliente..."
                      value={busquedaCliente}
                      onFocus={() => setMostrarDropdownCliente(true)}
                      onBlur={() => {
                        setTimeout(() => setMostrarDropdownCliente(false), 180);
                      }}
                      onChange={(e) => {
                        setBusquedaCliente(e.target.value);
                        setClienteRefId("");
                        setMostrarDropdownCliente(true);
                      }}
                    />

                    {mostrarDropdownCliente && !clienteRefId && (
                      <div className="ventas-dropdown">
                        {clientesFiltrados.slice(0, 8).map((c) => (
                          <button
                            key={c.firebaseId}
                            type="button"
                            onClick={() => usarClienteExistente(c)}
                          >
                            {c.nombre || "Sin nombre"} {c.dni ? `- ${c.dni}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {puedeCrearClientes && (
                    <button
                      type="button"
                      className="btn btn-secondary ventas-btn-inline"
                      onClick={() => setMostrarClienteRapido((prev) => !prev)}
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
                        setClienteRapido((prev) => ({
                          ...prev,
                          nombre: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="ventas-field">
                    <label>DNI</label>
                    <input
                      value={clienteRapido.dni}
                      onChange={(e) =>
                        setClienteRapido((prev) => ({
                          ...prev,
                          dni: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="ventas-field">
                    <label>Teléfono</label>
                    <input
                      value={clienteRapido.telefono}
                      onChange={(e) =>
                        setClienteRapido((prev) => ({
                          ...prev,
                          telefono: e.target.value,
                        }))
                      }
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

            <div className="ventas-field ventas-mt">
              <label>Notas</label>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Condiciones, demora, validez..."
              />
            </div>

            <div className="ventas-items-actions ventas-mt">
              <button className="btn btn-primary" onClick={agregarItem}>
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
                    <th></th>
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
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) =>
                            actualizarItem(index, "cantidad", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          value={item.precioUnitario}
                          onChange={(e) =>
                            actualizarItem(index, "precioUnitario", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        {formatearMoneda(
                          item.subtotal,
                          configMoneda.moneda,
                          configMoneda.localeMoneda
                        )}
                      </td>

                      <td>
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => eliminarItem(index)}
                          disabled={items.length === 1}
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ventas-card ventas-mt">
              <div className="ventas-resumen">
                <div className="ventas-resumen-row">
                  <span>Subtotal</span>
                  <strong>
                    {formatearMoneda(
                      subtotal,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </strong>
                </div>

                <div className="ventas-field">
                  <label>Descuento %</label>
                  <input
                    type="number"
                    value={descuento}
                    onChange={(e) => setDescuento(e.target.value)}
                  />
                </div>

                {Number(descuentoMonto || 0) > 0 && (
                    <div className="ventas-resumen-row">
                        <span>Descuento</span>
                        <strong>
                        {formatearMoneda(
                            descuentoMonto,
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
                      total,
                      configMoneda.moneda,
                      configMoneda.localeMoneda
                    )}
                  </strong>
                </div>

                <button
                  className="btn btn-primary btn-full"
                  onClick={guardarCotizacion}
                  disabled={guardando}
                >
                  {guardando ? "Guardando..." : "Guardar cotización"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}