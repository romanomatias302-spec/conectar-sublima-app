import { useEffect, useMemo, useState } from "react";
import {
  asegurarColumnasBaseProduccion,
  crearColumnaIntermediaProduccion,
  actualizarColumnaProduccion,
  desactivarColumnaProduccion,
  escucharColumnasProduccion,
} from "../../firebase/produccionColumnas";
import {
  moverPedidoProduccion,
  escucharPedidosProduccionActivos,
  escucharPedidosProduccionFinalizadosRecientes,
  moverPedidosDeColumnaEliminadaAAnterior,
  recalcularPedidosPorCambioDeColumnas,
} from "../../firebase/produccionPedidos";
import { agruparPedidosPorColumna } from "./produccionUtils";
import ProduccionBoard from "./ProduccionBoard";
import "./produccion.css";

function getProduccionUIStorageKey(perfil) {
  const clienteId = perfil?.clienteId || "sin-cliente";
  const userId = perfil?.uid || perfil?.firebaseUid || perfil?.email || "sin-usuario";
  return `produccion_ui_${clienteId}_${userId}`;
}

function cargarColumnasContraidas(perfil) {
  try {
    const key = getProduccionUIStorageKey(perfil);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.columnasContraidas) ? data.columnasContraidas : [];
  } catch (error) {
    console.error("Error leyendo preferencias de producción:", error);
    return [];
  }
}

function guardarColumnasContraidas(perfil, columnasContraidas) {
  try {
    const key = getProduccionUIStorageKey(perfil);
    localStorage.setItem(
      key,
      JSON.stringify({
        columnasContraidas,
      })
    );
  } catch (error) {
    console.error("Error guardando preferencias de producción:", error);
  }
}

export default function ProduccionPage({ perfil, onVerPedido = () => {} }) {
  const [columnas, setColumnas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidosFinalizadosRecientes, setPedidosFinalizadosRecientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState(false);
  const [animandoFinalizados, setAnimandoFinalizados] = useState([]);

  const [mostrarNuevaColumna, setMostrarNuevaColumna] = useState(false);
  const [nombreNuevaColumna, setNombreNuevaColumna] = useState("");
  const [guardandoColumna, setGuardandoColumna] = useState(false);

  const [columnaEditandoId, setColumnaEditandoId] = useState(null);
  const [nombreEditarColumna, setNombreEditarColumna] = useState("");
  const [guardandoEdicionColumna, setGuardandoEdicionColumna] = useState(false);
  const [eliminandoColumnaId, setEliminandoColumnaId] = useState(null);
  const [columnasContraidas, setColumnasContraidas] = useState([]);

  async function cargar() {
    if (!perfil?.clienteId) return;

    try {
        await asegurarColumnasBaseProduccion(perfil.clienteId);
    } catch (error) {
        console.error("Error asegurando columnas base:", error);
    }
  }

  useEffect(() => {
    let unsubscribeColumnas = null;
    let unsubscribePedidos = null;
    let unsubscribeFinalizados = null;

    async function iniciar() {
        if (!perfil?.clienteId) return;

        setLoading(true);

        try {
        await asegurarColumnasBaseProduccion(perfil.clienteId);

        unsubscribeColumnas = escucharColumnasProduccion(
            perfil.clienteId,
            (columnasActualizadas) => {
            setColumnas(columnasActualizadas);
            }
        );

        unsubscribePedidos = escucharPedidosProduccionActivos(
            perfil.clienteId,
            (pedidosActualizados) => {
            setPedidos(pedidosActualizados);
            setLoading(false);
            }
        );

        unsubscribeFinalizados = escucharPedidosProduccionFinalizadosRecientes(
            perfil.clienteId,
            (pedidosFinalizados) => {
            setPedidosFinalizadosRecientes(pedidosFinalizados);
            }
        );
        } catch (error) {
        console.error("Error iniciando producción en tiempo real:", error);
        setLoading(false);
        }
    }

    iniciar();

    return () => {
        if (unsubscribeColumnas) unsubscribeColumnas();
        if (unsubscribePedidos) unsubscribePedidos();
        if (unsubscribeFinalizados) unsubscribeFinalizados();
    };
    }, [perfil?.clienteId]);

    useEffect(() => {
        if (!perfil) return;
        setColumnasContraidas(cargarColumnasContraidas(perfil));
        }, [perfil?.clienteId, perfil?.uid, perfil?.firebaseUid, perfil?.email]);

  const pedidosPorColumna = useMemo(() => {
    const agrupado = agruparPedidosPorColumna(columnas, pedidos);

    const columnaFinal = columnas.find((c) => c.esFinal);
    if (!columnaFinal) return agrupado;

    if (!agrupado[columnaFinal.id]) {
        agrupado[columnaFinal.id] = [];
    }

    pedidosFinalizadosRecientes.forEach((pedidoFinalizado) => {
        const yaExiste = agrupado[columnaFinal.id].some(
        (p) => (p.firebaseId || p.id) === (pedidoFinalizado.firebaseId || pedidoFinalizado.id)
        );

        if (!yaExiste) {
        agrupado[columnaFinal.id].push(pedidoFinalizado);
        }
    });

    animandoFinalizados.forEach((pedidoAnimado) => {
        const yaExiste = agrupado[columnaFinal.id].some(
        (p) => (p.firebaseId || p.id) === (pedidoAnimado.firebaseId || pedidoAnimado.id)
        );

        if (!yaExiste) {
        agrupado[columnaFinal.id].push(pedidoAnimado);
        }
    });

    return agrupado;
    }, [columnas, pedidos, pedidosFinalizadosRecientes, animandoFinalizados]);

  async function manejarMoverPedido(pedidoId, columnaDestinoId) {
    if (moviendo) return;

    const pedidoActual = pedidos.find(
      (p) => (p.firebaseId || p.id) === pedidoId
    );
    if (!pedidoActual) return;

    if (pedidoActual.estado === "Cancelado") return;

    const columnaDestino = columnas.find((c) => c.id === columnaDestinoId);
    if (!columnaDestino) return;

    if (pedidoActual.columnaProduccionId === columnaDestinoId) return;

    const progresoNuevo = Math.round(
      (columnas.findIndex((c) => c.id === columnaDestinoId) / (columnas.length - 1)) * 100
    );

    const estadoProduccionNuevo = columnaDestino.esFinal
      ? "finalizado"
      : columnaDestino.esInicial
      ? "pendiente"
      : "en_proceso";

    const estadoGeneralNuevo =
      pedidoActual.estado === "Cancelado"
        ? "Cancelado"
        : columnaDestino.esFinal
        ? "Terminado"
        : columnaDestino.esInicial
        ? "Pendiente"
        : "En proceso";

    const produccionFinalizadaNueva = !!columnaDestino.esFinal;
    const vaAFinalizados = !!columnaDestino.esFinal;

    const pedidosPrevios = pedidos;

    setPedidos((prev) =>
      prev.map((p) =>
        (p.firebaseId || p.id) === pedidoId
          ? {
              ...p,
              columnaProduccionId: columnaDestinoId,
              progresoProduccion: progresoNuevo,
              estadoProduccion: estadoProduccionNuevo,
              estado: estadoGeneralNuevo,
              produccionFinalizada: produccionFinalizadaNueva,
            }
          : p
      )
    );

    if (vaAFinalizados) {
        const pedidoAnimado = {
            ...pedidoActual,
            columnaProduccionId: columnaDestinoId,
            progresoProduccion: progresoNuevo,
            estadoProduccion: estadoProduccionNuevo,
            estado: estadoGeneralNuevo,
            produccionFinalizada: produccionFinalizadaNueva,
            __animandoSalida: true,
        };

        setAnimandoFinalizados((prev) => [
            ...prev.filter(
            (p) => (p.firebaseId || p.id) !== (pedidoAnimado.firebaseId || pedidoAnimado.id)
            ),
            pedidoAnimado,
        ]);

        setTimeout(() => {
            setAnimandoFinalizados((prev) =>
            prev.filter(
                (p) => (p.firebaseId || p.id) !== (pedidoAnimado.firebaseId || pedidoAnimado.id)
            )
            );
        }, 2500);
        }

    try {
      setMoviendo(true);

      await moverPedidoProduccion({
        pedidoId,
        pedidoActual,
        columnaDestino,
        columnasOrdenadas: columnas,
        usuarioActor: {
          uid: perfil?.uid || perfil?.firebaseUid || null,
          nombre: perfil?.nombre || perfil?.email || "Usuario",
        },
      });
    } catch (error) {
      console.error("Error moviendo pedido en producción:", error);
      setPedidos(pedidosPrevios);
    } finally {
      setMoviendo(false);
    }
  }

  if (loading) {
    return <div className="produccion-page">Cargando producción...</div>;
  }


async function manejarCrearColumna() {
  try {
    const nombre = (nombreNuevaColumna || "").trim();

    if (!nombre) return;
    if (!perfil?.clienteId) return;

    setGuardandoColumna(true);

    await crearColumnaIntermediaProduccion({
     clienteId: perfil.clienteId,
     nombre,
    });

    await recalcularPedidosPorCambioDeColumnas(perfil.clienteId);

    setNombreNuevaColumna("");
    setMostrarNuevaColumna(false);

    
  } catch (error) {
    console.error("Error creando columna de producción:", error);
  } finally {
    setGuardandoColumna(false);
  }
}

async function manejarEditarColumna(columna) {
  setColumnaEditandoId(columna.id);
  setNombreEditarColumna(columna.nombre || "");
}

async function guardarEdicionColumna() {
  try {
    const nombre = (nombreEditarColumna || "").trim();
    if (!nombre || !columnaEditandoId) return;

    setGuardandoEdicionColumna(true);

    await actualizarColumnaProduccion(columnaEditandoId, {
      nombre,
    });

    setColumnaEditandoId(null);
    setNombreEditarColumna("");
    
  } catch (error) {
    console.error("Error editando columna:", error);
  } finally {
    setGuardandoEdicionColumna(false);
  }
}

async function manejarEliminarColumna(columna) {
  try {
    if (!columna || columna.esInicial || columna.esFinal) return;
    if (!perfil?.clienteId) return;

    const confirmar = window.confirm(
      `¿Seguro que querés eliminar la columna "${columna.nombre}"? Los pedidos de esa columna volverán automáticamente a la columna anterior.`
    );

    if (!confirmar) return;

    setEliminandoColumnaId(columna.id);

    await moverPedidosDeColumnaEliminadaAAnterior({
      clienteId: perfil.clienteId,
      columnaEliminadaId: columna.id,
    });

    await desactivarColumnaProduccion(columna.id);

    await recalcularPedidosPorCambioDeColumnas(perfil.clienteId);
  } catch (error) {
    console.error("Error eliminando columna:", error);
  } finally {
    setEliminandoColumnaId(null);
  }
}

function toggleColumnaContraida(columnaId) {
  setColumnasContraidas((prev) => {
    const yaEsta = prev.includes(columnaId);

    const nuevo = yaEsta
      ? prev.filter((id) => id !== columnaId)
      : [...prev, columnaId];

    guardarColumnasContraidas(perfil, nuevo);
    return nuevo;
  });
}


  return (
    <div className="produccion-page">
      <div className="produccion-page-header">
  <div className="produccion-page-header-top">
    <h2>Producción</h2>

    <button
      className="btn-produccion-secundario"
      onClick={() => setMostrarNuevaColumna((prev) => !prev)}
    >
      + Columna
    </button>
  </div>

  {mostrarNuevaColumna && (
    <div className="produccion-nueva-columna-box">
      <input
        type="text"
        placeholder="Nombre de la nueva etapa..."
        value={nombreNuevaColumna}
        onChange={(e) => setNombreNuevaColumna(e.target.value)}
        className="produccion-input-columna"
      />

      <button
        className="btn-produccion-primario"
        onClick={manejarCrearColumna}
        disabled={guardandoColumna}
      >
        {guardandoColumna ? "Guardando..." : "Guardar"}
      </button>

      <button
        className="btn-produccion-cancelar"
        onClick={() => {
          setMostrarNuevaColumna(false);
          setNombreNuevaColumna("");
        }}
      >
        Cancelar
      </button>
    </div>
  )}
</div>

<div className="produccion-board-wrapper">
  <ProduccionBoard
    columnas={columnas}
    pedidosPorColumna={pedidosPorColumna}
    onMoverPedido={manejarMoverPedido}
    onVerPedido={onVerPedido}
    onEditarColumna={manejarEditarColumna}
    onEliminarColumna={manejarEliminarColumna}
    columnaEditandoId={columnaEditandoId}
    nombreEditarColumna={nombreEditarColumna}
    setNombreEditarColumna={setNombreEditarColumna}
    onGuardarEdicionColumna={guardarEdicionColumna}
    guardandoEdicionColumna={guardandoEdicionColumna}
    eliminandoColumnaId={eliminandoColumnaId}
    columnasContraidas={columnasContraidas}
    onToggleColumnaContraida={toggleColumnaContraida}
  />
</div>
    </div>
  );
}