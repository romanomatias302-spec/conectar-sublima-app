import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import PedidoFormModal from "./PedidoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./PedidosList.css";
import ProduccionEstadoCell from "../produccion/ProduccionEstadoCell";
import { escucharColumnasProduccion } from "../../firebase/produccionColumnas";
import { sincronizarPedidoDesdeEstadoManual } from "../../firebase/produccionPedidos";
import {
  buscarPedidosGlobales,
  obtenerPedidosFiltradosPaginados,
} from "../../firebase/pedidos";
import { puedeHacer } from "../../utils/permisos";
import { fusionarDocumentosPaginados } from "../../utils/paginacionRealtime";
import {
  FaCalendarAlt,
  FaTimes,
} from "react-icons/fa";

export default function PedidosList({
  perfil,
  onVerDetalle,
  onIrProduccion,
  abrirNuevo = false,
}) {
  const [pedidos, setPedidos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaRemota, setBusquedaRemota] = useState(null);
  const [buscandoFirestore, setBuscandoFirestore] = useState(false);
  const solicitudBusquedaRef = useRef(0);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarFiltroFecha, setMostrarFiltroFecha] = useState(false);

  const filtroFechaRef = useRef(null);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [pedidoEditar, setPedidoEditar] = useState(null);

  const [ordenCampo, setOrdenCampo] = useState("id");
  const [ordenDireccion, setOrdenDireccion] = useState("desc");

  const [loading, setLoading] = useState(false);
  const [loadingMas, setLoadingMas] = useState(false);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);
  const listenerInicializadoRef = useRef(false);
  const versionListadoRef = useRef(0);

  const [columnasProduccion, setColumnasProduccion] = useState([]);

  const PAGE_SIZE = 100;

  const puedeCrearPedidos = puedeHacer(perfil, "pedidos", "crear");
  const puedeEditarPedidos = puedeHacer(perfil, "pedidos", "editar");
  const puedeEliminarPedidos = puedeHacer(perfil, "pedidos", "eliminar");

  const esAdminPedidos =
    perfil?.rol === "admin" ||
    perfil?.rol === "superadmin";

  const debeVerSoloAsignados =
    !esAdminPedidos &&
    puedeHacer(
      perfil,
      "produccion",
      "verSoloAsignados"
    );

  const uidActual =
    perfil?.uid ||
    perfil?.firebaseUid ||
    "";

  const cargarPedidos = () => {
    if (!perfil) return () => {};

    setLoading(true);

    if (estadoFiltro || fechaDesde || fechaHasta || debeVerSoloAsignados) {
      let cancelado = false;
      obtenerPedidosFiltradosPaginados({
        perfil,
        pageSize: PAGE_SIZE,
        coincide: pedidoCoincideFiltrosEstructurales,
      })
        .then((resultado) => {
          if (cancelado) return;
          setPedidos(resultado.pedidos);
          setUltimoDoc(resultado.ultimoDoc);
          setHayMas(resultado.hayMas);
        })
        .catch((error) => {
          if (!cancelado) console.error("Error al filtrar pedidos:", error);
        })
        .finally(() => {
          if (!cancelado) setLoading(false);
        });
      return () => {
        cancelado = true;
      };
    }

    const pedidosRef = collection(db, "pedidos");

    const q =
      perfil.rol === "superadmin"
        ? query(
            pedidosRef,
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
          )
        : query(
            pedidosRef,
            where("clienteId", "==", perfil.clienteId),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
          );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((docu) => ({
          firebaseId: docu.id,
          ...docu.data(),
        }));

        if (!listenerInicializadoRef.current) {
          setPedidos(lista);
          setUltimoDoc(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null);
          setHayMas(snapshot.docs.length === PAGE_SIZE);
          listenerInicializadoRef.current = true;
        } else {
          setPedidos((actuales) =>
            fusionarDocumentosPaginados({ actuales, entrantes: lista })
          );
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error al escuchar pedidos:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  };

  const cargarMasPedidos = async () => {
    try {
      if (!perfil || !ultimoDoc || !hayMas) return;

      setLoadingMas(true);
      const versionListado = versionListadoRef.current;

      const resultado = await obtenerPedidosFiltradosPaginados({
        perfil,
        ultimoDoc,
        pageSize: PAGE_SIZE,
        coincide: pedidoCoincideFiltrosEstructurales,
      });

      if (versionListado !== versionListadoRef.current) return;
      setPedidos((actuales) =>
        fusionarDocumentosPaginados({
          actuales,
          entrantes: resultado.pedidos,
        })
      );
      setUltimoDoc(resultado.ultimoDoc);
      setHayMas(resultado.hayMas);
    } catch (error) {
      console.error("Error al cargar más pedidos:", error);
    } finally {
      setLoadingMas(false);
    }
  };



  const normalizarTexto = (texto) =>
    String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const obtenerNombreEtapaPedido = (pedido) => {
    if (pedido.estado === "Cancelado") return "Cancelado";

    const columna = columnasProduccion.find(
      (c) => c.id === pedido.columnaProduccionId
    );

    if (columna?.nombre) return columna.nombre;

    if (pedido.estado === "Terminado") return "Producción finalizada";
    if (pedido.estado === "En proceso") return "En proceso";
    return "Pendiente";
  };

  const pedidoCoincideFiltrosEstructurales = (pedido) => {
    if (debeVerSoloAsignados && pedido.produccionAsignadoUid !== uidActual) {
      return false;
    }
    if (estadoFiltro && obtenerNombreEtapaPedido(pedido) !== estadoFiltro) {
      return false;
    }
    const fecha = String(pedido.fechaPedido || "");
    if (fechaDesde && (!fecha || fecha < fechaDesde)) return false;
    if (fechaHasta && (!fecha || fecha > fechaHasta)) return false;
    return true;
  };

  const cargarColumnasProduccion = () => {
    if (!perfil?.clienteId) return () => {};

    const unsubscribe = escucharColumnasProduccion(
      perfil.clienteId,
      (columnas) => {
        setColumnasProduccion(columnas || []);
      }
    );

    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribeColumnas = cargarColumnasProduccion();
    return () => {
      if (typeof unsubscribeColumnas === "function") unsubscribeColumnas();
    };
  }, [perfil]);

  useEffect(() => {
    listenerInicializadoRef.current = false;
    versionListadoRef.current += 1;
    const unsubscribePedidos = cargarPedidos();

    return () => {
      if (typeof unsubscribePedidos === "function") {
        unsubscribePedidos();
      }
    };
  }, [
    perfil,
    estadoFiltro,
    fechaDesde,
    fechaHasta,
    debeVerSoloAsignados,
    uidActual,
    columnasProduccion,
  ]);

  useEffect(() => {
    const texto = busqueda.trim();
    if (!texto || (!perfil?.clienteId && perfil?.rol !== "superadmin")) {
      setBusquedaRemota(null);
      setBuscandoFirestore(false);
      return;
    }

    const solicitudId = ++solicitudBusquedaRef.current;
    let cancelada = false;
    setBuscandoFirestore(true);
    const timer = setTimeout(async () => {
      try {
        const resultados = await buscarPedidosGlobales({ perfil, texto });
        if (cancelada || solicitudId !== solicitudBusquedaRef.current) return;
        setBusquedaRemota({ texto: normalizarTexto(texto), pedidos: resultados });
      } catch (error) {
        if (cancelada || solicitudId !== solicitudBusquedaRef.current) return;
        console.error("Error buscando pedidos globalmente:", error);
        setBusquedaRemota({ texto: normalizarTexto(texto), pedidos: [] });
      } finally {
        if (!cancelada && solicitudId === solicitudBusquedaRef.current) {
          setBuscandoFirestore(false);
        }
      }
    }, 350);

    return () => {
      cancelada = true;
      clearTimeout(timer);
    };
  }, [busqueda, perfil]);

useEffect(() => {
  if (!mostrarFiltroFecha) return;

  const manejarClickFueraFiltroFecha = (event) => {
    if (
      filtroFechaRef.current &&
      !filtroFechaRef.current.contains(event.target)
    ) {
      setMostrarFiltroFecha(false);
    }
  };

  document.addEventListener(
    "mousedown",
    manejarClickFueraFiltroFecha
  );

  return () => {
    document.removeEventListener(
      "mousedown",
      manejarClickFueraFiltroFecha
    );
  };
}, [mostrarFiltroFecha]);

  useEffect(() => {
  if (!abrirNuevo) return;
  if (!puedeCrearPedidos) return;

  setPedidoEditar(null);
  setMostrarModal(true);
}, [abrirNuevo, puedeCrearPedidos]);



  const eliminarPedido = async (firebaseId) => {
    if (!puedeEliminarPedidos) return;
    if (window.confirm("¿Seguro que querés eliminar este pedido?")) {
      try {
        await deleteDoc(doc(db, "pedidos", firebaseId));
      } catch (error) {
        console.error("Error al eliminar pedido:", error);
      }
    }
  };

  const actualizarEstado = async (firebaseId, nuevaEtapaONuevoEstado) => {
    try {
      if (!puedeEditarPedidos) return; 
      const pedidoActual = pedidos.find((p) => p.firebaseId === firebaseId);
      if (!pedidoActual) return;
      if (!perfil?.clienteId) return;

      if (nuevaEtapaONuevoEstado === "Cancelado") {
        await sincronizarPedidoDesdeEstadoManual({
          pedidoActual,
          nuevoEstado: "Cancelado",
          clienteId: perfil.clienteId,
        });
        return;
      }

      const columnaDestino = columnasProduccion.find(
        (c) => c.nombre === nuevaEtapaONuevoEstado
      );

      if (!columnaDestino) return;

      const nuevoEstadoGeneral = columnaDestino.esFinal
        ? "Terminado"
        : columnaDestino.esInicial
        ? "Pendiente"
        : "En proceso";

      await sincronizarPedidoDesdeEstadoManual({
        pedidoActual: {
          ...pedidoActual,
          columnaProduccionId: columnaDestino.id,
        },
        nuevoEstado: nuevoEstadoGeneral,
        clienteId: perfil.clienteId,
        columnaDestinoManualId: columnaDestino.id,
      });
    } catch (error) {
      console.error("Error al actualizar etapa/estado:", error);
    }
  };

const textoBusquedaActual = normalizarTexto(busqueda);
const pedidosRemotosActuales =
  busquedaRemota?.texto === textoBusquedaActual ? busquedaRemota.pedidos : [];
const pedidosPorId = new Map();
[...pedidos, ...(pedidosRemotosActuales || [])].forEach((pedido) => {
  if (pedido?.firebaseId) pedidosPorId.set(pedido.firebaseId, pedido);
});
const pedidosFiltrados = Array.from(pedidosPorId.values()).filter((p) => {
  if (debeVerSoloAsignados) {
    if (!uidActual) {
      return false;
    }

    if (
      p.produccionAsignadoUid !==
      uidActual
    ) {
      return false;
    }
  }

  const textoBusqueda =
    normalizarTexto(busqueda);

  if (textoBusqueda) {
    const camposBusqueda = [
      p.id,
      p.numeroPedido,
      p.numero,
      p.cliente,
      p.clienteNombre,
      p.nombreCliente,
      p.clienteBusqueda,
      p.clienteDNI,
    ].map(normalizarTexto);

    const coincideBusqueda =
      camposBusqueda.some((valor) =>
        valor.includes(textoBusqueda)
      );

    if (!coincideBusqueda) {
      return false;
    }
  }

  if (estadoFiltro) {
    const etapaActual =
      obtenerNombreEtapaPedido(p);

    if (etapaActual !== estadoFiltro) {
      return false;
    }
  }

  const fechaPedido =
    String(p.fechaPedido || "");

  if (
    fechaDesde &&
    (!fechaPedido ||
      fechaPedido < fechaDesde)
  ) {
    return false;
  }

  if (
    fechaHasta &&
    (!fechaPedido ||
      fechaPedido > fechaHasta)
  ) {
    return false;
  }

  return true;
});

  const manejarOrden = (campo) => {
    if (ordenCampo === campo) {
      setOrdenDireccion((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion("asc");
    }
  };

  const normalizarFecha = (fecha) => {
    if (!fecha) return new Date(0);
    const partes = fecha.split("-");
    if (partes.length === 3) {
      return new Date(fecha + "T00:00:00");
    }
    return new Date(fecha);
  };

  const pedidosOrdenados = [...pedidosFiltrados].sort((a, b) => {
    let valorA = a[ordenCampo];
    let valorB = b[ordenCampo];

    if (ordenCampo === "fechaPedido" || ordenCampo === "fechaEntrega") {
      valorA = normalizarFecha(valorA);
      valorB = normalizarFecha(valorB);
    } else if (ordenCampo === "id") {
      valorA = Number(valorA) || 0;
      valorB = Number(valorB) || 0;
    } else {
      valorA = (valorA || "").toString().toLowerCase();
      valorB = (valorB || "").toString().toLowerCase();
    }

    if (valorA < valorB) return ordenDireccion === "asc" ? -1 : 1;
    if (valorA > valorB) return ordenDireccion === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="pedidos-lista">
      <div className="encabezado-lista">
        <h1>Pedidos</h1>
        <div className="acciones-lista">
          <input
            type="text"
            placeholder="Buscar cliente o N° de pedido..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="buscador"
          />
          {buscandoFirestore && <span>Buscando en todos los pedidos...</span>}



          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="filtro"
          >
            <option value="">Todas las etapas</option>

            {columnasProduccion.map((col) => (
              <option key={col.id} value={col.nombre}>
                {col.nombre}
              </option>
            ))}

            <option value="Cancelado">Cancelado</option>
            </select>

            <div
              ref={filtroFechaRef}
              className="pedidos-filtro-fecha-wrap"
            >
              <button
                type="button"
                className={`pedidos-filtro-fecha-btn ${
                  fechaDesde || fechaHasta ? "activo" : ""
                }`}
                onClick={() =>
                  setMostrarFiltroFecha((prev) => !prev)
                }
                aria-expanded={mostrarFiltroFecha}
                aria-haspopup="dialog"
              >
                <FaCalendarAlt
                  className="pedidos-filtro-fecha-icono"
                  aria-hidden="true"
                />

                <span>Fecha</span>

                {(fechaDesde || fechaHasta) && (
                  <span
                    className="pedidos-filtro-fecha-dot"
                    aria-hidden="true"
                  />
                )}
              </button>

              {mostrarFiltroFecha && (
                <div
                  className="pedidos-filtro-fecha-popover"
                  role="dialog"
                  aria-label="Filtrar pedidos por fecha"
                >
                  <div className="pedidos-filtro-fecha-popover-header">
                    <div>
                      <strong>Fecha del pedido</strong>
                      <span>Seleccioná un rango</span>
                    </div>

                    <button
                      type="button"
                      className="pedidos-filtro-fecha-cerrar"
                      onClick={() =>
                        setMostrarFiltroFecha(false)
                      }
                      aria-label="Cerrar filtro"
                    >
                      <FaTimes />
                    </button>
                  </div>

                  <div className="pedidos-filtro-fecha-campos">
                    <label>
                      <span>Desde</span>

                      <input
                        type="date"
                        value={fechaDesde}
                        onChange={(e) =>
                          setFechaDesde(e.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Hasta</span>

                      <input
                        type="date"
                        value={fechaHasta}
                        onChange={(e) =>
                          setFechaHasta(e.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div className="pedidos-filtro-fecha-actions">
                    <button
                      type="button"
                      className="pedidos-filtro-fecha-limpiar"
                      disabled={!fechaDesde && !fechaHasta}
                      onClick={() => {
                        setFechaDesde("");
                        setFechaHasta("");
                      }}
                    >
                      Limpiar
                    </button>

                    <button
                      type="button"
                      className="pedidos-filtro-fecha-aplicar"
                      onClick={() =>
                        setMostrarFiltroFecha(false)
                      }
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {puedeCrearPedidos && (
            <button
              className="btn-nuevo"
              onClick={() => {
                setPedidoEditar(null);
                setMostrarModal(true);
              }}
            >
              + Nuevo Pedido
            </button>
          )}
        </div>
      </div>

      {loading && (
        <p style={{ marginTop: "10px", color: "#666" }}>Cargando pedidos...</p>
      )}

            <div className="pedidos-mobile-list">
        {pedidosOrdenados.map((p) => (
          <div
            key={p.firebaseId}
            className="pedido-mobile-card"
            onClick={() => onVerDetalle(p)}
          >
            <div className="pedido-mobile-top">
              <div>
                <strong>#{p.id}</strong>
                <span>{p.cliente || "Sin cliente"}</span>
              </div>

              <span className={`pedido-mobile-estado ${p.estado?.toLowerCase().replace(" ", "-")}`}>
                {p.estado || "Sin estado"}
              </span>
            </div>

          <div className="pedido-mobile-info">
            <div className="pedido-mobile-info-row">
              <small>Pedido:</small>
              <p>{p.fechaPedido || "-"}</p>
            </div>

            <div className="pedido-mobile-info-row">
              <small>Entrega:</small>
              <p>{p.fechaEntrega || "-"}</p>
            </div>
          </div>

            <div className="pedido-mobile-produccion">
              <ProduccionEstadoCell
                pedido={p}
                columnasProduccion={columnasProduccion}
                onIrProduccion={onIrProduccion}
              />
            </div>

            <div className="pedido-mobile-actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => onVerDetalle(p)}>Ver detalle</button>

              {puedeEditarPedidos && (
                <button
                  onClick={() => {
                    setPedidoEditar(p);
                    setMostrarModal(true);
                  }}
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <table className="tabla-pedidos tabla-pedidos-desktop">
        <thead>
          <tr>
            <th onClick={() => manejarOrden("id")} style={{ cursor: "pointer" }}>
              N° de pedido {ordenCampo === "id" ? (ordenDireccion === "asc" ? "▲" : "▼") : ""}
            </th>
            <th onClick={() => manejarOrden("cliente")} style={{ cursor: "pointer" }}>
              Cliente {ordenCampo === "cliente" ? (ordenDireccion === "asc" ? "▲" : "▼") : ""}
            </th>
            <th onClick={() => manejarOrden("fechaPedido")} style={{ cursor: "pointer" }}>
              Fecha Pedido {ordenCampo === "fechaPedido" ? (ordenDireccion === "asc" ? "▲" : "▼") : ""}
            </th>
            <th onClick={() => manejarOrden("fechaEntrega")} style={{ cursor: "pointer" }}>
              Fecha Entrega {ordenCampo === "fechaEntrega" ? (ordenDireccion === "asc" ? "▲" : "▼") : ""}
            </th>
            <th>Producción</th>
            <th onClick={() => manejarOrden("estado")} style={{ cursor: "pointer" }}>
              Estado {ordenCampo === "estado" ? (ordenDireccion === "asc" ? "▲" : "▼") : ""}
            </th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {pedidosOrdenados.map((p) => (
            <tr
              key={p.firebaseId}
              className="fila-clickable"
              onClick={() => onVerDetalle(p)}
            >
              <td>#{p.id}</td>
              <td>{p.cliente}</td>
              <td>{p.fechaPedido}</td>
              <td>{p.fechaEntrega}</td>

              <td style={{ minWidth: "170px", width: "170px" }}>
                <ProduccionEstadoCell
                  pedido={p}
                  columnasProduccion={columnasProduccion}
                  onIrProduccion={onIrProduccion}
                />
              </td>

              <td>
                <select
                  className={`estado-select ${p.estado?.toLowerCase().replace(" ", "-")}`}
                  value={obtenerNombreEtapaPedido(p)}
                  onChange={(e) => actualizarEstado(p.firebaseId, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!puedeEditarPedidos}
                >
                  {columnasProduccion.map((col) => (
                    <option key={col.id} value={col.nombre}>
                      {col.nombre}
                    </option>
                  ))}

                  <option value="Cancelado">Cancelado</option>
                </select>
              </td>

              <td onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  onVer={() => onVerDetalle(p)}
                  onEditar={
                    puedeEditarPedidos
                      ? () => {
                          setPedidoEditar(p);
                          setMostrarModal(true);
                        }
                      : undefined
                  }
                  onEliminar={
                    puedeEliminarPedidos
                      ? () => eliminarPedido(p.firebaseId)
                      : undefined
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pedidosFiltrados.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "20px", color: "#888" }}>
          No se encontraron pedidos.
        </p>
      )}

      {!loading && hayMas && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button className="btn-secundario" onClick={cargarMasPedidos} disabled={loadingMas}>
            {loadingMas ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}

      {mostrarModal && (
        <PedidoFormModal
          pedido={pedidoEditar}
          perfil={perfil}
          onClose={() => setMostrarModal(false)}
          onPedidoCreado={(nuevoPedido) => {
            setMostrarModal(false);
            onVerDetalle(nuevoPedido);
          }}
        />
      )}
    </div>
  );
}
