import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import PedidoFormModal from "./PedidoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./PedidosList.css";
import ProduccionEstadoCell from "../produccion/ProduccionEstadoCell";
import { obtenerColumnasProduccion } from "../../firebase/produccionColumnas";
import { calcularProgresoPorColumna } from "../produccion/produccionUtils";
import { sincronizarPedidoDesdeEstadoManual } from "../../firebase/produccionPedidos";

export default function PedidosList({
  onVerDetalle = () => {},
  onIrProduccion = () => {},
  perfil,
}) {
  const [pedidos, setPedidos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [pedidoEditar, setPedidoEditar] = useState(null);

  const [ordenCampo, setOrdenCampo] = useState("id");
  const [ordenDireccion, setOrdenDireccion] = useState("desc");

  const [loading, setLoading] = useState(false);
  const [loadingMas, setLoadingMas] = useState(false);
  const [ultimoDoc, setUltimoDoc] = useState(null);
  const [hayMas, setHayMas] = useState(true);

  const [buscando, setBuscando] = useState(false);
  const [modoBusqueda, setModoBusqueda] = useState(false);
  const [columnasProduccion, setColumnasProduccion] = useState([]);

  const PAGE_SIZE = 100;

  const cargarPedidos = () => {
    if (!perfil) return () => {};

    setLoading(true);

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

        setPedidos(lista);
        setUltimoDoc(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null);
        setHayMas(snapshot.docs.length === PAGE_SIZE);
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

      const pedidosRef = collection(db, "pedidos");

      const q =
        perfil.rol === "superadmin"
          ? query(
              pedidosRef,
              orderBy("createdAt", "desc"),
              startAfter(ultimoDoc),
              limit(PAGE_SIZE)
            )
          : query(
              pedidosRef,
              where("clienteId", "==", perfil.clienteId),
              orderBy("createdAt", "desc"),
              startAfter(ultimoDoc),
              limit(PAGE_SIZE)
            );

      const snapshot = await getDocs(q);

      const nuevosPedidos = snapshot.docs.map((docu) => ({
        firebaseId: docu.id,
        ...docu.data(),
      }));

      setPedidos((prev) => [...prev, ...nuevosPedidos]);
      setUltimoDoc(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null);
      setHayMas(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error al cargar más pedidos:", error);
    } finally {
      setLoadingMas(false);
    }
  };

  const buscarPedidosFirestore = async () => {
    try {
      if (!perfil) return;

      const texto = normalizarTexto(busqueda);

      if (!texto) {
        setModoBusqueda(false);
        cargarPedidos();
        return;
      }

      setBuscando(true);
      setModoBusqueda(true);

      const pedidosRef = collection(db, "pedidos");

      let q;

      // búsqueda por número exacto de pedido
      if (/^\d+$/.test(texto)) {
        q =
          perfil.rol === "superadmin"
            ? query(
                pedidosRef,
                where("id", "==", texto),
                limit(20)
              )
            : query(
                pedidosRef,
                where("clienteId", "==", perfil.clienteId),
                where("id", "==", texto),
                limit(20)
              );
      } else {
        // búsqueda por cliente (prefijo)
        q =
          perfil.rol === "superadmin"
            ? query(
                pedidosRef,
                orderBy("clienteBusqueda"),
                where("clienteBusqueda", ">=", texto),
                where("clienteBusqueda", "<=", texto + "\uf8ff"),
                limit(100)
              )
            : query(
                pedidosRef,
                where("clienteId", "==", perfil.clienteId),
                orderBy("clienteBusqueda"),
                where("clienteBusqueda", ">=", texto),
                where("clienteBusqueda", "<=", texto + "\uf8ff"),
                limit(100)
              );
      }

      console.log("BUSQUEDA TEXTO:", texto);
      console.log("MODO BUSQUEDA:", /^\d+$/.test(texto) ? "por id" : "por cliente");

      const snapshot = await getDocs(q);

      console.log("RESULTADOS BUSQUEDA:", snapshot.docs.length);

      const lista = snapshot.docs.map((docu) => ({
        firebaseId: docu.id,
        ...docu.data(),
      }));

      setPedidos(lista);
      setHayMas(false);
      setUltimoDoc(null);
    } catch (error) {
      console.error("Error al buscar pedidos:", error);
    } finally {
      setBuscando(false);
    }
  };

  const normalizarTexto = (texto) => (texto || "").trim().toLowerCase();

  const cargarColumnasProduccion = async () => {
  try {
    if (!perfil?.clienteId) return;

    const columnas = await obtenerColumnasProduccion(perfil.clienteId);
    setColumnasProduccion(columnas || []);
  } catch (error) {
    console.error("Error al cargar columnas de producción:", error);
  }
};

  useEffect(() => {
    const unsubscribe = cargarPedidos();

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [perfil]);

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarPedidosFirestore();
    }, 400);

    return () => clearTimeout(timer);
  }, [busqueda]);

  const eliminarPedido = async (firebaseId) => {
    if (window.confirm("¿Seguro que querés eliminar este pedido?")) {
      try {
        await deleteDoc(doc(db, "pedidos", firebaseId));
      } catch (error) {
        console.error("Error al eliminar pedido:", error);
      }
    }
  };

  const actualizarEstado = async (firebaseId, nuevoEstado) => {
    try {
      const pedidoActual = pedidos.find((p) => p.firebaseId === firebaseId);
      if (!pedidoActual) return;
      if (!perfil?.clienteId) return;

      await sincronizarPedidoDesdeEstadoManual({
        pedidoActual,
        nuevoEstado,
        clienteId: perfil.clienteId,
      });
    } catch (error) {
      console.error("Error al actualizar estado:", error);
    }
  };

  const pedidosFiltrados = pedidos.filter((p) => {
    const coincideEstado = estadoFiltro ? p.estado === estadoFiltro : true;
    return coincideEstado;
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
            placeholder="Buscar por cliente o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="buscador"
          />

          {buscando && (
            <p style={{ marginTop: "10px", color: "#666" }}>Buscando pedidos...</p>
          )}

          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="filtro"
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En proceso">En proceso</option>
            <option value="Terminado">Terminado</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          <button
            className="btn-nuevo"
            onClick={() => {
              setPedidoEditar(null);
              setMostrarModal(true);
            }}
          >
            + Nuevo Pedido
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ marginTop: "10px", color: "#666" }}>Cargando pedidos...</p>
      )}

      <table className="tabla-pedidos">
        <thead>
          <tr>
            <th onClick={() => manejarOrden("id")} style={{ cursor: "pointer" }}>
              ID Pedido {ordenCampo === "id" ? (ordenDireccion === "asc" ? "▲" : "▼") : ""}
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

              <td style={{ minWidth: "150px", width: "150px" }}>
                <ProduccionEstadoCell
                  pedido={p}
                  onIrProduccion={onIrProduccion}
                />
              </td>

              <td>
                <select
                  className={`estado-select ${p.estado?.toLowerCase().replace(" ", "-")}`}
                  value={p.estado || ""}
                  onChange={(e) => actualizarEstado(p.firebaseId, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="En proceso">En proceso</option>
                  <option value="Terminado">Terminado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </td>

              <td onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  onVer={() => onVerDetalle(p)}
                  onEditar={() => {
                    setPedidoEditar(p);
                    setMostrarModal(true);
                  }}
                  onEliminar={() => eliminarPedido(p.firebaseId)}
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

      {!loading && !modoBusqueda && hayMas && (
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