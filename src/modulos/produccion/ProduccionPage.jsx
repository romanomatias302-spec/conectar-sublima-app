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
} from "../../firebase/produccionPedidos";
import { agruparPedidosPorColumna } from "./produccionUtils";
import ProduccionBoard from "./ProduccionBoard";
import "./produccion.css";

export default function ProduccionPage({ perfil, onVerPedido = () => {} }) {
  const [columnas, setColumnas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState(false);

  const [mostrarNuevaColumna, setMostrarNuevaColumna] = useState(false);
  const [nombreNuevaColumna, setNombreNuevaColumna] = useState("");
  const [guardandoColumna, setGuardandoColumna] = useState(false);

  const [columnaEditandoId, setColumnaEditandoId] = useState(null);
  const [nombreEditarColumna, setNombreEditarColumna] = useState("");
  const [guardandoEdicionColumna, setGuardandoEdicionColumna] = useState(false);
  const [eliminandoColumnaId, setEliminandoColumnaId] = useState(null);

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
        } catch (error) {
        console.error("Error iniciando producción en tiempo real:", error);
        setLoading(false);
        }
    }

    iniciar();

    return () => {
        if (unsubscribeColumnas) unsubscribeColumnas();
        if (unsubscribePedidos) unsubscribePedidos();
    };
    }, [perfil?.clienteId]);

  const pedidosPorColumna = useMemo(() => {
    return agruparPedidosPorColumna(columnas, pedidos);
  }, [columnas, pedidos]);

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

    const confirmar = window.confirm(
      `¿Seguro que querés eliminar la columna "${columna.nombre}"? Los pedidos de esa columna deberán reubicarse manualmente por ahora.`
    );

    if (!confirmar) return;

    setEliminandoColumnaId(columna.id);

    await desactivarColumnaProduccion(columna.id);

    
  } catch (error) {
    console.error("Error eliminando columna:", error);
  } finally {
    setEliminandoColumnaId(null);
  }
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
/>
    </div>
  );
}