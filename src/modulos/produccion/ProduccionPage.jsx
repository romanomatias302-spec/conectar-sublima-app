import { useEffect, useMemo, useState } from "react";
import {
  asegurarColumnasBaseProduccion,
  crearColumnaIntermediaProduccion,
  actualizarColumnaProduccion,
  desactivarColumnaProduccion,
  escucharColumnasProduccion,
  moverColumnaProduccion,
} from "../../firebase/produccionColumnas";
import {
  moverPedidoProduccion,
  escucharPedidosProduccionActivos,
  escucharPedidosProduccionFinalizadosRecientes,
  moverPedidosDeColumnaEliminadaAAnterior,
  recalcularPedidosPorCambioDeColumnas,
  actualizarDetalleManualProduccion,
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

  const [ordenTarjetas, setOrdenTarjetas] = useState("normal");

 const [pedidoEditandoDetalle, setPedidoEditandoDetalle] = useState(null);
 const [notaManual, setNotaManual] = useState("");
 const [metrosManual, setMetrosManual] = useState("");
 const [colorManual, setColorManual] = useState("");
 const [guardandoDetalleManual, setGuardandoDetalleManual] = useState(false);
 const [ahoraTick, setAhoraTick] = useState(Date.now());

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

    useEffect(() => {
        const interval = setInterval(() => {
            setAhoraTick(Date.now());
        }, 60000);

        return () => clearInterval(interval);
        }, []);    


  function normalizarFechaOrden(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ordenarTarjetas(lista, modoOrden) {
  const copia = [...lista];

  if (modoOrden === "entrega-asc") {
    return copia.sort((a, b) => {
      const fa = normalizarFechaOrden(a.fechaEntrega);
      const fb = normalizarFechaOrden(b.fechaEntrega);

      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;

      return fa - fb;
    });
  }

  if (modoOrden === "entrega-desc") {
    return copia.sort((a, b) => {
      const fa = normalizarFechaOrden(a.fechaEntrega);
      const fb = normalizarFechaOrden(b.fechaEntrega);

      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;

      return fb - fa;
    });
  }

  return copia;
}

  const pedidosPorColumna = useMemo(() => {
  const agrupadoBase = agruparPedidosPorColumna(columnas, pedidos);

  const columnaFinal = columnas.find((c) => c.esFinal);
  if (!columnaFinal) {
    const agrupadoOrdenado = {};
    Object.keys(agrupadoBase).forEach((colId) => {
      agrupadoOrdenado[colId] = ordenarTarjetas(agrupadoBase[colId] || [], ordenTarjetas);
    });
    return agrupadoOrdenado;
  }

  if (!agrupadoBase[columnaFinal.id]) {
    agrupadoBase[columnaFinal.id] = [];
  }

  pedidosFinalizadosRecientes.forEach((pedidoFinalizado) => {
    const yaExiste = agrupadoBase[columnaFinal.id].some(
      (p) => (p.firebaseId || p.id) === (pedidoFinalizado.firebaseId || pedidoFinalizado.id)
    );

    if (!yaExiste) {
      agrupadoBase[columnaFinal.id].push(pedidoFinalizado);
    }
  });

  animandoFinalizados.forEach((pedidoAnimado) => {
    const yaExiste = agrupadoBase[columnaFinal.id].some(
      (p) => (p.firebaseId || p.id) === (pedidoAnimado.firebaseId || pedidoAnimado.id)
    );

    if (!yaExiste) {
      agrupadoBase[columnaFinal.id].push(pedidoAnimado);
    }
  });

  const agrupadoOrdenado = {};
  Object.keys(agrupadoBase).forEach((colId) => {
    agrupadoOrdenado[colId] = ordenarTarjetas(agrupadoBase[colId] || [], ordenTarjetas);
  });

  return agrupadoOrdenado;
}, [columnas, pedidos, pedidosFinalizadosRecientes, animandoFinalizados, ordenTarjetas]);

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

  function abrirDetalleManual(pedido) {
  setPedidoEditandoDetalle(pedido);
  setNotaManual(pedido?.produccionNotaCorta || "");
  setMetrosManual(
    pedido?.produccionMetros === "" || pedido?.produccionMetros == null
      ? ""
      : String(pedido.produccionMetros)
  );
  setColorManual(pedido?.produccionColorMarca || "");
}

function cerrarDetalleManual() {
  setPedidoEditandoDetalle(null);
  setNotaManual("");
  setMetrosManual("");
  setColorManual("");
}

async function guardarDetalleManual() {
  try {
    if (!pedidoEditandoDetalle?.firebaseId) return;

    setGuardandoDetalleManual(true);

    await actualizarDetalleManualProduccion({
      pedidoId: pedidoEditandoDetalle.firebaseId,
      produccionNotaCorta: notaManual,
      produccionColorMarca: colorManual,
      produccionMetros: metrosManual,
    });

    cerrarDetalleManual();
  } catch (error) {
    console.error("Error guardando detalle manual de producción:", error);
  } finally {
    setGuardandoDetalleManual(false);
  }
}

  const puedeGestionarColumnas = perfil?.rol === "admin";

  async function manejarMoverColumna(columna, direccion) {
    try {
        if (!perfil?.clienteId) return;
        if (!columna || columna.esInicial || columna.esFinal) return;
        if (!puedeGestionarColumnas) return;

        await moverColumnaProduccion({
        clienteId: perfil.clienteId,
        columnaId: columna.id,
        direccion,
        });

        await recalcularPedidosPorCambioDeColumnas(perfil.clienteId);
    } catch (error) {
        console.error("Error moviendo columna:", error);
    }
    }

  return (
    <div className="produccion-page">
      <div className="produccion-page-header">
        <div className="produccion-page-header-top">
            <h2>Producción</h2>

            <div className="produccion-page-header-actions">
                <select
                value={ordenTarjetas}
                onChange={(e) => setOrdenTarjetas(e.target.value)}
                className="produccion-select-orden"
                >
                <option value="normal">Orden normal</option>
                <option value="entrega-asc">Entrega más próxima</option>
                <option value="entrega-desc">Entrega más lejana</option>
                </select>

                {puedeGestionarColumnas && (
                    <button
                        className="btn-produccion-secundario"
                        onClick={() => setMostrarNuevaColumna((prev) => !prev)}
                    >
                        + Columna
                    </button>
                    )}
            </div>
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
  onEditarDetalleManual={abrirDetalleManual}
  puedeGestionarColumnas={puedeGestionarColumnas}
  onMoverColumna={manejarMoverColumna}
  ahoraTick={ahoraTick}
/>
</div>

{pedidoEditandoDetalle && (
  <div className="produccion-modal-overlay" onClick={cerrarDetalleManual}>
    <div
      className="produccion-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <h3>Detalle manual de producción</h3>

      <label>Metros</label>
      <input
        type="number"
        step="0.01"
        value={metrosManual}
        onChange={(e) => setMetrosManual(e.target.value)}
        className="produccion-modal-input"
        placeholder="Ej: 42"
      />

      <label>Nota corta</label>
      <input
        type="text"
        maxLength={60}
        value={notaManual}
        onChange={(e) => setNotaManual(e.target.value)}
        className="produccion-modal-input"
        placeholder="Ej: Mandar hoy / Esperar 200 mts"
      />

      <label>Marca de color</label>
      <div className="produccion-colores-box">
        {["", "amarillo", "verde", "azul", "rojo", "violeta"].map((color) => (
          <button
            key={color || "sin-color"}
            type="button"
            className={`produccion-color-btn ${colorManual === color ? "activo" : ""}`}
            onClick={() => setColorManual(color)}
          >
            {color === "" ? "Sin color" : color}
          </button>
        ))}
      </div>

      <div className="produccion-modal-actions">
        <button className="btn-produccion-cancelar" onClick={cerrarDetalleManual}>
          Cancelar
        </button>

        <button
          className="btn-produccion-primario"
          onClick={guardarDetalleManual}
          disabled={guardandoDetalleManual}
        >
          {guardandoDetalleManual ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}