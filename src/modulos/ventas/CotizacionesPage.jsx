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
  buscarCotizacionesEnFirestore,
  escucharCotizacionesRecientes,
} from "../../firebase/cotizaciones";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { fechaHoyNegocio } from "../../utils/fechas";
import { puedeHacer } from "../../utils/permisos";
import { obtenerUsuariosPorCliente } from "../../firebase/usuariosConfig";
import "./VentasPage.css";
import ProductoSelectorModal from "../../components/ProductoSelectorModal/ProductoSelectorModal";
import { Trash2 } from "lucide-react";

const itemVacio = () => ({
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
});

const clienteRapidoInicial = {
  nombre: "",
  dni: "",
  telefono: "",
};

export default function CotizacionesPage({ perfil, onVerCotizacion }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMas, setLoadingMas] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [buscandoFirestore, setBuscandoFirestore] = useState(false);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [modalCrear, setModalCrear] = useState(false);

  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [vendedorUid, setVendedorUid] = useState("");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [mostrarDropdownCliente, setMostrarDropdownCliente] = useState(false);
  const [clienteRefId, setClienteRefId] = useState("");

const [fechaCotizacion, setFechaCotizacion] = useState(() =>
  fechaHoyNegocio(perfil)
);

const [fechaValidez, setFechaValidez] = useState("");
const [configNegocio, setConfigNegocio] = useState({
    nombreVisible: "",
    logoUrl: "",
  });

  const [items, setItems] = useState([itemVacio()]);
  const [modalPrecioAbierto, setModalPrecioAbierto] = useState(false);
  const [itemPrecioIndex, setItemPrecioIndex] = useState(null);

  const [descuento, setDescuento] = useState(0);
  const [notas, setNotas] = useState("");

  const [mostrarClienteRapido, setMostrarClienteRapido] = useState(false);
  const [clienteRapido, setClienteRapido] = useState(clienteRapidoInicial);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  const puedeCrearCotizacion = puedeHacer(perfil, "ventas", "crearCotizacion");
  const puedeOtorgarDescuentoCotizacion =
  puedeHacer(perfil, "ventas", "otorgarDescuentoCotizacion");
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

  cargarClientes();
  cargarUsuarios();
  cargarConfigNegocio();

  setLoading(true);

  const unsubscribe = escucharCotizacionesRecientes({
    perfil,
    pageSize: 50,
    onData: (res) => {
      setCotizaciones(res.cotizaciones);
      setUltimoDoc(res.ultimoDoc);
      setHayMas(res.hayMas);
      setLoading(false);
    },
    onError: (err) => {
      console.error("Error escuchando cotizaciones:", err);
      setError("No se pudieron cargar las cotizaciones.");
      setLoading(false);
    },
  });

  return () => unsubscribe();
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

  useEffect(() => {
  const texto = (busqueda || "").trim();

  if (!texto) return;

  if (fechaDesde || fechaHasta) return;

  if (cotizacionesFiltradas.length > 0) return;

  const timer = setTimeout(async () => {
    try {
      setBuscandoFirestore(true);

      const resultados = await buscarCotizacionesEnFirestore({
        perfil,
        texto,
        pageSize: 50,
      });

      setCotizaciones((prev) => {
        const existentes = new Set(prev.map((c) => c.firebaseId));
        const nuevos = resultados.filter((c) => !existentes.has(c.firebaseId));
        return [...prev, ...nuevos];
      });
    } catch (err) {
      console.error("Error buscando cotizaciones:", err);
      setError("No se pudo buscar la cotización.");
    } finally {
      setBuscandoFirestore(false);
    }
  }, 350);

  return () => clearTimeout(timer);
}, [busqueda, fechaDesde, fechaHasta, cotizacionesFiltradas.length, perfil]);

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

  const vendedorSeleccionado = useMemo(
    () => usuarios.find((u) => u.uid === vendedorUid) || null,
    [usuarios, vendedorUid]
  );

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
    setFechaCotizacion(fechaHoyNegocio(perfil));
    setFechaValidez("");
    setItems([itemVacio()]);
    setDescuento(0);
    setNotas("");
    setMostrarClienteRapido(false);
    setClienteRapido(clienteRapidoInicial);
    setVendedorUid("");
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

  const abrirSelectorPrecio = (index) => {
    setItemPrecioIndex(index);
    setModalPrecioAbierto(true);
    setError("");
  };

  const aplicarProductoSeleccionado = (datosPrecio) => {
    if (itemPrecioIndex === null) return;

    Object.entries(datosPrecio).forEach(([campo, valor]) => {
      actualizarItem(itemPrecioIndex, campo, valor);
    });

    setModalPrecioAbierto(false);
    setItemPrecioIndex(null);
    setError("");
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
        descuento: puedeOtorgarDescuentoCotizacion
        ? Number(descuentoMonto || 0)
        : 0,
        notas,
        vendedor: vendedorSeleccionado,
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
          <div className="cotizaciones-filtros-row">
            <div className="ventas-field">
              <label>Buscar cliente / N°</label>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Cliente, documento o número..."
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

            <div className="ventas-field ventas-field-action">
              <span className="ventas-action-spacer" />
              <button
                className="btn btn-secondary cotizaciones-limpiar-btn"
                onClick={() => {
                  setFechaDesde("");
                  setFechaHasta("");
                }}
                disabled={!fechaDesde && !fechaHasta}
              >
                Limpiar fechas
              </button>
            </div>
          </div>
        </div>

      <div className="ventas-card">
        {loading && <p>Cargando cotizaciones...</p>}
        {buscandoFirestore && <p>Buscando en todas las cotizaciones...</p>}

        {!loading && (
          <>
            <div className="ventas-mobile-list">
              {cotizacionesFiltradas.map((c) => (
                <div
                  key={c.firebaseId}
                  className={`venta-mobile-card ${
                    c.convertidaAVenta ? "cotizacion-row-convertida" : ""
                  }`}
                  onClick={() => onVerCotizacion(c)}
                >
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
                  </tr>
                </thead>

                <tbody>
                  {cotizacionesFiltradas.map((c) => (
                  <tr
                    key={c.firebaseId}
                    className={`ventas-row-clickable ${
                      c.convertidaAVenta ? "cotizacion-row-convertida" : ""
                    }`}
                    onClick={() => onVerCotizacion(c)}
                  >
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

                    </tr>
                  ))}

                  {cotizacionesFiltradas.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: "center", padding: 16 }}>
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

            <div className="cotizacion-form-grid">
              <div className="cotizacion-fechas-row">
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
              </div>

             

          <div className="cotizacion-cliente-vendedor-row">

          <div className="ventas-field ventas-field-cliente">
            <div className="cotizacion-label-row">
            <label>Seleccionar cliente</label>

            {puedeCrearClientes && (
              <button
                type="button"
                className="cotizacion-cliente-rapido-link"
                onClick={() => setMostrarClienteRapido((prev) => !prev)}
              >
                {mostrarClienteRapido ? "Cerrar" : "+ Cliente rápido"}
              </button>
            )}
          </div>

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
                        {c.nombre || "Sin nombre"}{" "}
                        {c.dni ? `- ${c.dni}` : ""}
                      </button>
                    ))}
                  </div>
                )}

                {busquedaCliente.trim() && !clienteRefId && (
                  <small className="cotizacion-cliente-aviso">
                    El cliente no existe. Selecciona de la lista o crealo como cliente rápido.
                  </small>
                )}
              </div>

         
            </div>
          </div>

          <div className="ventas-field">
            <label>Vendedor opcional</label>

            <select
              value={vendedorUid}
              onChange={(e) => setVendedorUid(e.target.value)}
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
                    <label>Documento de identidad</label>
                    <input
                      value={clienteRapido.dni}
                      onChange={(e) =>
                        setClienteRapido((prev) => ({
                          ...prev,
                          dni: e.target.value,
                        }))
                      }
                    />
                    <small className="cotizacion-ayuda-discreta">
                      Podés dejarlo vacío y completarlo más adelante.
                    </small>
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
              <table className="ventas-table ventas-items-table cotizacion-items-table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Subtotal</th>
                    <th>Acción</th>
                    <th>Excluir desc.</th>
                  </tr>
                </thead>

                <tbody>
                  {itemsNormalizados.map((item, index) => (
                    <tr key={index}>
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

                          <div
                            className={`ventas-producto-main ${
                              item.origenPrecio === "lista_precio"
                                ? "ventas-producto-main-lista"
                                : "ventas-producto-main-manual"
                            }`}
                          >
                            {item.origenPrecio === "lista_precio" ? (
                              <>
                                <span className="ventas-producto-nombre">
                                  {item.descripcion || "Producto sin descripción"}
                                </span>

                                <small className="ventas-item-source">
                                  Lista de precios
                                </small>
                              </>
                            ) : (
                              <div className="ventas-descripcion-selector ventas-descripcion-selector-clean">
                                <input
                                  value={item.descripcion}
                                  onChange={(e) =>
                                    actualizarItem(index, "descripcion", e.target.value)
                                  }
                                  placeholder="Ej: Remera personalizada"
                                />

                                <button
                                  type="button"
                                  className="ventas-selector-precio-btn"
                                  onClick={() => abrirSelectorPrecio(index)}
                                  title="Agregar desde lista de precios"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="ventas-cantidad-td">
                        <input
                          className="ventas-cantidad-input"
                          type="number"
                          min="1"
                          value={Number(item.cantidad) === 0 ? "" : item.cantidad}
                          onChange={(e) =>
                            actualizarItem(
                              index,
                              "cantidad",
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          onBlur={(e) => {
                            if (e.target.value === "") actualizarItem(index, "cantidad", 0);
                          }}
                        />
                      </td>

                      <td className="ventas-money-td">
                        {item.origenPrecio === "lista_precio" ? (
                          <span>
                            {formatearMoneda(
                              item.precioUnitario,
                              configMoneda.moneda,
                              configMoneda.localeMoneda
                            )}
                          </span>
                        ) : (
                          <input
                            className="ventas-precio-input-clean"
                            type="number"
                            min="0"
                            value={item.precioUnitario}
                            onFocus={(e) => {
                              if (Number(e.target.value) === 0) e.target.select();
                            }}
                            onChange={(e) =>
                              actualizarItem(
                                index,
                                "precioUnitario",
                                e.target.value === "" ? "" : Number(e.target.value)
                              )
                            }
                            onBlur={(e) => {
                              if (e.target.value === "") actualizarItem(index, "precioUnitario", 0);
                            }}
                          />
                        )}
                      </td>

                      <td className="ventas-money-td ventas-subtotal-td">
                        <span>
                          {formatearMoneda(
                            item.subtotal,
                            configMoneda.moneda,
                            configMoneda.localeMoneda
                          )}
                        </span>
                      </td>

                      <td className="ventas-action-td">
                        <div className="ventas-action-center">
                          <button
                            type="button"
                            className="ventas-delete-icon-btn"
                            onClick={() => eliminarItem(index)}
                            disabled={items.length === 1}
                            title="Eliminar ítem"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>

                      <td className="ventas-check-td">
                        <input
                          type="checkbox"
                          checked={item.excluirDescuento === true}
                          onChange={(e) =>
                            actualizarItem(index, "excluirDescuento", e.target.checked)
                          }
                          title="Excluir este ítem del descuento porcentual"
                        />
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
                    value={puedeOtorgarDescuentoCotizacion ? descuento : 0}
                    onChange={(e) => setDescuento(e.target.value)}
                    disabled={!puedeOtorgarDescuentoCotizacion}
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
      <ProductoSelectorModal
        open={modalPrecioAbierto}
        perfil={perfil}
        configMoneda={configMoneda}
        itemActual={itemPrecioIndex !== null ? items[itemPrecioIndex] : null}
        onClose={() => {
          setModalPrecioAbierto(false);
          setItemPrecioIndex(null);
        }}
        onAplicar={aplicarProductoSeleccionado}
      />
    </div>
  );
}