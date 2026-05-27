import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  asegurarColumnasBaseProduccion,
limpiarColumnasBaseDuplicadasProduccion,
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
  subirArchivoProduccion,
  subirImagenPortadaProduccion,
  asignarUsuarioProduccion,
  obtenerHistorialProduccionPedido,
  
} from "../../firebase/produccionPedidos";
import { agruparPedidosPorColumna } from "./produccionUtils";
import ProduccionBoard from "./ProduccionBoard";
import {
  escucharEtiquetasProduccion,
  crearEtiquetaProduccion,
  actualizarEtiquetaProduccion,
  desactivarEtiquetaProduccion,
} from "../../firebase/produccionEtiquetas";
import "./produccion.css";
import { puedeHacer } from "../../utils/permisos";

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
  const [filtroAsignado, setFiltroAsignado] = useState("todos");
  const [busquedaProduccion, setBusquedaProduccion] = useState("");
  

 const [pedidoEditandoDetalle, setPedidoEditandoDetalle] = useState(null);
 const [notaManual, setNotaManual] = useState("");
 const [metrosManual, setMetrosManual] = useState("");
 const [etiquetasProduccion, setEtiquetasProduccion] = useState([]);
 const [etiquetasSeleccionadasIds, setEtiquetasSeleccionadasIds] = useState([]);
const [filtroEtiquetaId, setFiltroEtiquetaId] = useState("todas");
 const [colorManual, setColorManual] = useState("");
const [colorManualTexto, setColorManualTexto] = useState("");

 const [mostrarNuevaEtiqueta, setMostrarNuevaEtiqueta] = useState(false);
 const [nuevaEtiquetaNombre, setNuevaEtiquetaNombre] = useState("");
 const [nuevaEtiquetaColor, setNuevaEtiquetaColor] = useState("rojo");
 const [guardandoEtiqueta, setGuardandoEtiqueta] = useState(false);
 const [guardandoDetalleManual, setGuardandoDetalleManual] = useState(false);
 const [ahoraTick, setAhoraTick] = useState(Date.now());
 const [historialProduccion, setHistorialProduccion] = useState([]);
 const [loadingHistorialProduccion, setLoadingHistorialProduccion] = useState(false);

 const [mostrarHistorialGeneral, setMostrarHistorialGeneral] = useState(false);


 const [usuariosProduccion, setUsuariosProduccion] = useState([]);
 const [usuarioAsignadoUid, setUsuarioAsignadoUid] = useState("");

 const [notaCortaManual,setNotaCortaManual]=useState("");
  const [notaLargaManual,setNotaLargaManual]=useState("");

  const [mostrarSelectorPortada,setMostrarSelectorPortada]=useState(false);

  const [imagenPortadaProduccion,setImagenPortadaProduccion]=useState("");
  const [imagenPreviewProduccion, setImagenPreviewProduccion] = useState("");
  const [archivosProduccion, setArchivosProduccion] = useState([]);
  const [subiendoArchivoProduccion, setSubiendoArchivoProduccion] = useState(false);
  const [imagenesPedido,setImagenesPedido]=useState([]);
  const [subiendoPortada,setSubiendoPortada]=

  useState(false);

  const puedeHacerEnProduccion = (accion = "ver") => {
    return puedeHacer(perfil, "produccion", accion);
  };

const esAdminProduccion =
  perfil?.rol === "admin" || perfil?.rol === "superadmin";

const debeVerSoloAsignados =
  !esAdminProduccion && puedeHacerEnProduccion("verSoloAsignados");

const uidActual =
  perfil?.uid || perfil?.firebaseUid || "";




  useEffect(() => {
  let unsubscribe = null;

  if (!perfil?.clienteId) return;

  unsubscribe = escucharEtiquetasProduccion(perfil.clienteId, (lista) => {
    setEtiquetasProduccion(lista || []);
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}, [perfil?.clienteId]);

  useEffect(() => {
    let unsubscribeColumnas = null;
    let unsubscribePedidos = null;
    let unsubscribeFinalizados = null;

    async function iniciar() {
        if (!perfil?.clienteId) return;

        setLoading(true);

        try {
        await asegurarColumnasBaseProduccion(perfil.clienteId);
        await limpiarColumnasBaseDuplicadasProduccion(perfil.clienteId);

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
  let cancelado = false;

  async function cargarUsuariosProduccion() {
    try {
      if (!perfil?.clienteId) return;

      const q = query(
        collection(db, "usuarios"),
        where("clienteId", "==", perfil.clienteId)
      );

      const snapshot = await getDocs(q);

      const lista = snapshot.docs
        .map((d) => ({
          uid: d.id,
          ...d.data(),
        }))
        .filter((u) => {
          if (!u?.activo) return false;
          if (u?.rol === "admin" || u?.rol === "superadmin") return true;
          return u?.permisos?.produccion?.ver === true;
        })
        .sort((a, b) =>
          String(a?.nombre || a?.email || "").localeCompare(
            String(b?.nombre || b?.email || "")
          )
        );

      if (!cancelado) {
        setUsuariosProduccion(lista);
      }
    } catch (error) {
      console.error("Error cargando usuarios de producción:", error);
    }
  }

  cargarUsuariosProduccion();

  return () => {
    cancelado = true;
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

function obtenerEtiquetasPedido(pedido) {
  if (Array.isArray(pedido?.produccionEtiquetas)) {
    return pedido.produccionEtiquetas.slice(0, 4);
  }

  if (pedido?.produccionEtiquetaId) {
    return [
      {
        id: pedido.produccionEtiquetaId,
        nombre: pedido.produccionEtiquetaNombre || "",
        color: pedido.produccionEtiquetaColor || "",
      },
    ];
  }

  return [];
}

function filtrarPedidosPorEtiqueta(lista, etiquetaId) {
  if (!Array.isArray(lista)) return [];
  if (!etiquetaId || etiquetaId === "todas") return lista;

  if (etiquetaId === "sin_etiqueta") {
    return lista.filter((pedido) => obtenerEtiquetasPedido(pedido).length === 0);
  }

  return lista.filter((pedido) =>
    obtenerEtiquetasPedido(pedido).some((etiqueta) => etiqueta.id === etiquetaId)
  );
}

function filtrarPedidosPorBusqueda(lista, textoBusqueda) {
  if (!Array.isArray(lista)) return [];

  const texto = String(textoBusqueda || "")
    .trim()
    .toLowerCase();

  if (!texto) return lista;

  return lista.filter((pedido) => {
    const numeroPedido = String(
      pedido.id ||
        pedido.numeroPedido ||
        pedido.numero ||
        ""
    ).toLowerCase();

    const cliente = String(
      pedido.cliente ||
        pedido.clienteNombre ||
        pedido.nombreCliente ||
        ""
    ).toLowerCase();

    return (
      numeroPedido.includes(texto) ||
      cliente.includes(texto)
    );
  });
}

function filtrarPedidosPorAsignado(lista, filtro, perfil, forzarSoloAsignados = false) {
  if (!Array.isArray(lista)) return [];

  const uidActual = perfil?.uid || perfil?.firebaseUid || "";

  if (forzarSoloAsignados) {
    if (!uidActual) return [];
    return lista.filter((p) => p.produccionAsignadoUid === uidActual);
  }

  if (filtro === "todos") return lista;

  if (filtro === "sin_asignar") {
    return lista.filter((p) => !p.produccionAsignadoUid);
  }

  if (filtro === "mios") {
    if (!uidActual) return lista;
    return lista.filter((p) => p.produccionAsignadoUid === uidActual);
  }

  return lista.filter((p) => p.produccionAsignadoUid === filtro);
}



  const pedidosPorColumna = useMemo(() => {
  const pedidosFiltrados = filtrarPedidosPorAsignado(
    pedidos,
    filtroAsignado,
    perfil,
    debeVerSoloAsignados
  );
const finalizadosFiltrados = filtrarPedidosPorAsignado(
  pedidosFinalizadosRecientes,
  filtroAsignado,
  perfil,
  debeVerSoloAsignados
);
const animadosFiltrados = filtrarPedidosPorAsignado(
  animandoFinalizados,
  filtroAsignado,
  perfil,
  debeVerSoloAsignados
);
const pedidosFiltradosPorEtiqueta = filtrarPedidosPorEtiqueta(
  pedidosFiltrados,
  filtroEtiquetaId
);

const pedidosFiltradosPorBusqueda = filtrarPedidosPorBusqueda(
  pedidosFiltradosPorEtiqueta,
  busquedaProduccion
);

  const agrupadoBase = agruparPedidosPorColumna(columnas, pedidosFiltradosPorBusqueda);

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

    const finalizadosFiltradosPorEtiqueta = filtrarPedidosPorEtiqueta(
      finalizadosFiltrados,
      filtroEtiquetaId
    );

    const animadosFiltradosPorEtiqueta = filtrarPedidosPorEtiqueta(
      animadosFiltrados,
      filtroEtiquetaId
    );

    const finalizadosFiltradosPorBusqueda = filtrarPedidosPorBusqueda(
  finalizadosFiltradosPorEtiqueta,
  busquedaProduccion
);

const animadosFiltradosPorBusqueda = filtrarPedidosPorBusqueda(
  animadosFiltradosPorEtiqueta,
  busquedaProduccion
);

    finalizadosFiltradosPorBusqueda.forEach((pedidoFinalizado) => {
    const yaExiste = agrupadoBase[columnaFinal.id].some(
      (p) => (p.firebaseId || p.id) === (pedidoFinalizado.firebaseId || pedidoFinalizado.id)
    );

    if (!yaExiste) {
      agrupadoBase[columnaFinal.id].push(pedidoFinalizado);
    }
  });

    animadosFiltradosPorBusqueda.forEach((pedidoAnimado) => {
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
}, [
  columnas,
  pedidos,
  pedidosFinalizadosRecientes,
  animandoFinalizados,
  ordenTarjetas,
  filtroAsignado,
  filtroEtiquetaId,
  perfil,
  debeVerSoloAsignados,
  busquedaProduccion,
]);

  async function manejarMoverPedido(pedidoId, columnaDestinoId) {
    if (!puedeHacerEnProduccion("mover")) return;
    if (moviendo) return;

    const todosLosPedidos = [
      ...pedidos,
      ...pedidosFinalizadosRecientes,
      ...animandoFinalizados,
    ];

    const pedidoActual = todosLosPedidos.find(
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

      const pedidosPrevios = [...pedidos];

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

  async function cargarProductosDelPedidoProduccion(pedidoId) {
  if (!pedidoId) return [];

  const snapshot = await getDocs(
    collection(db, `pedidos/${pedidoId}/productos`)
  );

  return snapshot.docs.map((docu) => ({
    id: docu.id,
    ...docu.data(),
  }));
}

  async function abrirDetalleManual(pedido) {
    if (!puedeHacerEnProduccion("editarDetalle")) return;

    setPedidoEditandoDetalle(pedido);
    setNotaManual(pedido?.produccionNotaCorta || "");
    setMetrosManual(
      pedido?.produccionMetros === "" || pedido?.produccionMetros == null
        ? ""
        : String(pedido.produccionMetros)
    );
const etiquetasActuales = obtenerEtiquetasPedido(pedido);
setEtiquetasSeleccionadasIds(etiquetasActuales.map((e) => e.id).filter(Boolean));
    setUsuarioAsignadoUid(pedido?.produccionAsignadoUid || "");
    setNotaCortaManual(
    pedido?.produccionNotaCorta || ""
    );

    setNotaLargaManual(
    pedido?.produccionNotaLarga || ""
    );

    setArchivosProduccion(pedido?.produccionArchivos || []);

    setImagenPortadaProduccion(
    pedido?.produccionImagenPortada || ""
    );

    setMostrarSelectorPortada(false);

const productosDelPedido = await cargarProductosDelPedidoProduccion(
  pedido?.firebaseId
);

const imagenesDetectadas = obtenerImagenesPedido(productosDelPedido);

setImagenesPedido(imagenesDetectadas);

console.log("IMÁGENES PRODUCCIÓN DETECTADAS:", imagenesDetectadas);

    try {
      setLoadingHistorialProduccion(true);
      const historial = await obtenerHistorialProduccionPedido(pedido?.firebaseId);
      setHistorialProduccion(historial);
    } catch (error) {
      console.error("Error cargando historial de producción:", error);
      setHistorialProduccion([]);
    } finally {
      setLoadingHistorialProduccion(false);
    }
  }

function obtenerImagenesPedido(productos = []) {
  const resultado = [];

  productos.forEach((prod) => {
    (prod?.imagenes || []).forEach((img, idx) => {
      const normalizada =
        typeof img === "string"
          ? { url: img, tipo: "link", portada: false }
          : img;

      if (!normalizada?.url) return;

      resultado.push({
        id: `${prod.id || prod.productoNombre || "producto"}-${idx}`,
        url: normalizada.url,
        portada: normalizada.portada || false,
        producto: prod.productoNombre || prod.producto || "Producto",
        tipo: normalizada.tipo || "link",
      });
    });
  });

  return resultado;
}

function cerrarDetalleManual() {
  setPedidoEditandoDetalle(null);
  setNotaManual("");
  setMetrosManual("");
  setEtiquetasSeleccionadasIds([]);
  setUsuarioAsignadoUid("");
  setHistorialProduccion([]);
  setLoadingHistorialProduccion(false);
  setArchivosProduccion([]);
  setSubiendoArchivoProduccion(false);
}

async function manejarSubirArchivosProduccion(e) {
  try {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setSubiendoArchivoProduccion(true);

    const nuevos = [];

    if (
    archivosProduccion.length +
    files.length >
    5
    ){
    throw new Error(
    "Máximo 5 archivos."
    );
}

    for (const archivo of files) {
      const subido = await subirArchivoProduccion({
        pedidoId: pedidoEditandoDetalle.firebaseId,
        archivo,
      });

      nuevos.push(subido);
    }

    setArchivosProduccion((prev) => [...prev, ...nuevos]);

    e.target.value = "";
  } catch (error) {
    console.error("Error subiendo archivo de producción:", error);
    alert(error.message || "No se pudo subir el archivo.");
  } finally {
    setSubiendoArchivoProduccion(false);
  }
}

async function manejarSubirPortada(e) {
try {

const archivo =
e.target.files?.[0];

if (!archivo) return;

setSubiendoPortada(true);

const subida =
await subirImagenPortadaProduccion({
pedidoId:
pedidoEditandoDetalle.firebaseId,
archivo,
});

setImagenPortadaProduccion(
subida.url
);

setMostrarSelectorPortada(false);

}
catch(error){

alert(
error.message
);

}
finally{
setSubiendoPortada(false);
}
}

async function guardarDetalleManual() {
  try {
    if (!puedeHacerEnProduccion("editarDetalle")) return;
    if (!pedidoEditandoDetalle?.firebaseId) return;

    setGuardandoDetalleManual(true);

const etiquetasSeleccionadas = etiquetasProduccion
  .filter((e) => etiquetasSeleccionadasIds.includes(e.id))
  .slice(0, 4)
  .map((e) => ({
    id: e.id,
    nombre: e.nombre || "",
    color: e.color || "",
  }));

    const usuarioSeleccionado =
      usuariosProduccion.find((u) => u.uid === usuarioAsignadoUid) || null;

if (puedeHacerEnProduccion("asignarUsuario")) {
  await asignarUsuarioProduccion({
    pedidoId: pedidoEditandoDetalle.firebaseId,
    usuarioAsignado: usuarioSeleccionado,
    usuarioActor: {
      uid: perfil?.uid || perfil?.firebaseUid || null,
      nombre: perfil?.nombre || perfil?.email || "Usuario",
    },
  });
}

await actualizarDetalleManualProduccion({
pedidoId: pedidoEditandoDetalle.firebaseId,

produccionNotaCorta:
notaCortaManual,

produccionNotaLarga:
notaLargaManual,

produccionImagenPortada:
imagenPortadaProduccion,

produccionArchivos: 
archivosProduccion,

produccionEtiquetas: etiquetasSeleccionadas,

produccionEtiquetaId:
etiquetasSeleccionadas[0]?.id || "",

produccionEtiquetaNombre:
etiquetasSeleccionadas[0]?.nombre || "",

produccionEtiquetaColor:
etiquetasSeleccionadas[0]?.color || "",
});

    cerrarDetalleManual();
  } catch (error) {
    console.error("Error guardando detalle manual de producción:", error);
  } finally {
    setGuardandoDetalleManual(false);
  }
}



async function guardarNuevaEtiquetaProduccion() {
  try {
    if (!puedeHacerEnProduccion("editarDetalle")) return;
    if (!perfil?.clienteId) return;

    const nombre = (nuevaEtiquetaNombre || "").trim();
    if (!nombre) return;

    setGuardandoEtiqueta(true);

    await crearEtiquetaProduccion({
      clienteId: perfil.clienteId,
      nombre,
      color: nuevaEtiquetaColor,
    });

    setNuevaEtiquetaNombre("");
    setNuevaEtiquetaColor("rojo");
    setMostrarNuevaEtiqueta(false);
  } catch (error) {
    console.error("Error creando etiqueta de producción:", error);
  } finally {
    setGuardandoEtiqueta(false);
  }
}

async function manejarEditarEtiquetaProduccion(etiqueta) {
  try {
    if (!puedeHacerEnProduccion("editarDetalle")) return;
    if (!perfil?.clienteId || !etiqueta?.id) return;

    const nuevoNombre = window.prompt(
      "Nuevo nombre de la etiqueta:",
      etiqueta.nombre || ""
    );

    if (nuevoNombre === null) return;

    const nombreLimpio = nuevoNombre.trim();
    if (!nombreLimpio) return;

    await actualizarEtiquetaProduccion({
      clienteId: perfil.clienteId,
      etiquetaId: etiqueta.id,
      nombre: nombreLimpio,
      color: etiqueta.color || "rojo",
    });
  } catch (error) {
    console.error("Error editando etiqueta:", error);
  }
}

async function manejarEliminarEtiquetaProduccion(etiqueta) {
  try {
    if (!puedeHacerEnProduccion("editarDetalle")) return;
    if (!perfil?.clienteId || !etiqueta?.id) return;

    const ok = window.confirm(
      `¿Seguro que querés eliminar la etiqueta "${etiqueta.nombre}"? No se borrará de pedidos anteriores, solo dejará de estar disponible.`
    );

    if (!ok) return;

    await desactivarEtiquetaProduccion({
      clienteId: perfil.clienteId,
      etiquetaId: etiqueta.id,
    });

    setEtiquetasSeleccionadasIds((prev) =>
      prev.filter((id) => id !== etiqueta.id)
    );
  } catch (error) {
    console.error("Error eliminando etiqueta:", error);
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

  function formatearFechaHistorial(timestamp) {
  if (!timestamp?.seconds) return "-";

  const fecha = new Date(timestamp.seconds * 1000);

  return fecha.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

  return (
    <div className="produccion-page">
      <div className="produccion-page-header">
        <div className="produccion-page-header-top">
            <div className="produccion-titulo-row">
              <h2>Producción</h2>

              <button
                type="button"
                className="btn-produccion-secundario"
                onClick={() => setMostrarHistorialGeneral(true)}
              >
                Historial
              </button>
            </div>

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

                <select
                  value={filtroEtiquetaId}
                  onChange={(e) => setFiltroEtiquetaId(e.target.value)}
                  className="produccion-select-orden"
                >
                  <option value="todas">Todas las etiquetas</option>
                  <option value="sin_etiqueta">Sin etiqueta</option>

                  {etiquetasProduccion.map((etiqueta) => (
                    <option key={etiqueta.id} value={etiqueta.id}>
                      {etiqueta.nombre}
                    </option>
                  ))}
                </select>

              {!debeVerSoloAsignados ? (
                <select
                  value={filtroAsignado}
                  onChange={(e) => setFiltroAsignado(e.target.value)}
                  className="produccion-select-orden"
                >
                  <option value="todos">Todos los asignados</option>
                  <option value="sin_asignar">Sin asignar</option>
                  <option value="mios">Solo mis pedidos</option>

                  {usuariosProduccion.map((usuario) => (
                    <option key={usuario.uid} value={usuario.uid}>
                      {usuario.nombre || usuario.email || usuario.uid}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="produccion-select-orden">
                  Solo mis pedidos asignados
                </div>
              )}

                {puedeGestionarColumnas && (
                    <button
                        className="btn-produccion-secundario"
                        onClick={() => setMostrarNuevaColumna((prev) => !prev)}
                    >
                        + Columna
                    </button>
                    )}
            </div>
            <div className="produccion-busqueda-wrapper">
              <input
                type="text"
                value={busquedaProduccion}
                onChange={(e) => setBusquedaProduccion(e.target.value)}
                className="produccion-busqueda-input"
                placeholder="Buscar pedido o cliente..."
              />
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
  puedeMoverPedidos={puedeHacerEnProduccion("mover")}
  puedeEditarDetalleManual={puedeHacerEnProduccion("editarDetalle")}
/>
</div>

{pedidoEditandoDetalle && puedeHacerEnProduccion("editarDetalle") && (
  <div className="produccion-modal-overlay" onClick={cerrarDetalleManual}>
    <div
      className="produccion-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <h3>Detalle manual de producción</h3>

      <div className="produccion-modal-section">
      <h4>Notas internas</h4>

      <label>Nota corta</label>
      <input
        type="text"
        maxLength={60}
        value={notaCortaManual}
        onChange={(e) => setNotaCortaManual(e.target.value)}
        className="produccion-modal-input"
        placeholder="Ej: Mandar hoy / Esperar tela / Revisar logo"
      />

      <label>Nota larga</label>

      <textarea
        rows={4}
        value={notaLargaManual}
        onChange={(e) => setNotaLargaManual(e.target.value)}
        className="produccion-modal-input"
        placeholder="Detalle interno para producción..."
        style={{
          resize: "vertical",
          minHeight: 110,
        }}
      />
      </div>

      <div className="produccion-modal-section">
      <h4>Asignación</h4>

      {puedeHacerEnProduccion("asignarUsuario") && (
        <>
          <label>Asignado a</label>
          <div className="produccion-asignacion-box">
            <select
              value={usuarioAsignadoUid}
              onChange={(e) => setUsuarioAsignadoUid(e.target.value)}
              className="produccion-modal-input"
            >
              <option value="">Sin asignar</option>
              {usuariosProduccion.map((usuario) => (
                <option key={usuario.uid} value={usuario.uid}>
                  {usuario.nombre || usuario.email || usuario.uid}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      </div>

      <div className="produccion-modal-section">
        <h4>Etiquetas</h4>

<details className="produccion-etiquetas-details">
  <summary>
    Etiquetas seleccionadas: {etiquetasSeleccionadasIds.length}/4
  </summary>

  <div className="produccion-etiquetas-checklist">
    {etiquetasProduccion.map((etiqueta) => {
      const activa = etiquetasSeleccionadasIds.includes(etiqueta.id);
      const maximoAlcanzado =
        etiquetasSeleccionadasIds.length >= 4 && !activa;

      return (
<div key={etiqueta.id} className="produccion-etiqueta-check-row">
  <label className="produccion-etiqueta-check">
    <input
      type="checkbox"
      checked={activa}
      disabled={maximoAlcanzado}
      onChange={() => {
        setEtiquetasSeleccionadasIds((prev) => {
          if (prev.includes(etiqueta.id)) {
            return prev.filter((id) => id !== etiqueta.id);
          }

          if (prev.length >= 4) return prev;

          return [...prev, etiqueta.id];
        });
      }}
    />

    <span className="produccion-etiqueta-preview">
      {etiqueta.nombre}
    </span>
  </label>

  {puedeHacerEnProduccion("editarDetalle") && (
    <div className="produccion-etiqueta-actions">
      <button
        type="button"
        onClick={() => manejarEditarEtiquetaProduccion(etiqueta)}
      >
        ✎
      </button>

      <button
        type="button"
        onClick={() => manejarEliminarEtiquetaProduccion(etiqueta)}
      >
        ×
      </button>
    </div>
  )}
</div>
      );
    })}
  </div>
</details>

<small className="produccion-hint">
  Podés seleccionar hasta 4 etiquetas por tarjeta.
</small>

{puedeHacerEnProduccion("editarDetalle") && (
  <button
    type="button"
    className="btn-produccion-secundario"
    onClick={() => setMostrarNuevaEtiqueta((prev) => !prev)}
  >
    + Etiqueta
  </button>
  
)}

      {mostrarNuevaEtiqueta && puedeHacerEnProduccion("editarDetalle") && (
        <div className="produccion-etiqueta-nueva-box">
          <input
            type="text"
            maxLength={22}
            value={nuevaEtiquetaNombre}
            onChange={(e) => setNuevaEtiquetaNombre(e.target.value)}
            className="produccion-modal-input"
            placeholder="Nombre de la etiqueta"
          />

          <div className="produccion-colores-box">
            {["amarillo", "verde", "azul", "rojo", "violeta"].map((color) => (
              <button
                key={color}
                type="button"
                className={`produccion-color-btn ${nuevaEtiquetaColor === color ? "activo" : ""}`}
                onClick={() => setNuevaEtiquetaColor(color)}
              >
                {color}
              </button>
            ))}
          </div>



          <div className="produccion-modal-actions">
            <button
              type="button"
              className="btn-produccion-cancelar"
              onClick={() => {
                setMostrarNuevaEtiqueta(false);
                setNuevaEtiquetaNombre("");
                setNuevaEtiquetaColor("rojo");
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="btn-produccion-primario"
              onClick={guardarNuevaEtiquetaProduccion}
              disabled={guardandoEtiqueta}
            >
              {guardandoEtiqueta ? "Guardando..." : "Guardar etiqueta"}
            </button>
          </div>
        </div>
      )}

</div>

<div className="produccion-modal-section">
  <h4>Portada</h4>

 <label>Imagen de portada</label>

<div className="produccion-portada-box">
  {imagenPortadaProduccion ? (
    <>
      <img
        src={imagenPortadaProduccion}
        alt=""
        title="Ver imagen"
        onClick={() => setImagenPreviewProduccion(imagenPortadaProduccion)}
        style={{
          width: "100%",
          maxHeight: 180,
          objectFit: "contain",
          borderRadius: 10,
          marginTop: 6,
          border: "1px solid #e5e7eb",
          cursor: "zoom-in",
        }}
      />

      <div className="produccion-portada-actions">
        <button
          type="button"
          className="btn-produccion-secundario"
          onClick={() => setImagenPreviewProduccion(imagenPortadaProduccion)}
        >
          Ver portada
        </button>

        <button
          type="button"
          className="btn-produccion-secundario"
          onClick={() => setMostrarSelectorPortada((v) => !v)}
        >
          Cambiar portada
          </button>

          <button
            type="button"
            className="btn-produccion-cancelar"
            onClick={() => {
              setImagenPortadaProduccion("");
              setMostrarSelectorPortada(false);
            }}
          >
            Quitar
          </button>
        </div>

        <button
          type="button"
          className="btn-produccion-secundario produccion-btn-full"
          disabled={imagenesPedido.length === 0}
          onClick={() => setMostrarSelectorPortada((v) => !v)}
        >
          {imagenesPedido.length > 0
            ? `Ver imágenes del pedido (${imagenesPedido.length})`
            : "Sin imágenes del pedido"}
        </button>
          </>
        ) : (
        <>
          {imagenesPedido.length > 0 ? (
            <button
              type="button"
              className="btn-produccion-secundario produccion-btn-full"
              onClick={() => setMostrarSelectorPortada((v) => !v)}
            >
              Ver imágenes del pedido ({imagenesPedido.length})
            </button>
          ) : (
            <label className="btn-produccion-secundario produccion-btn-full">
              Subir portada

              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={manejarSubirPortada}
              />
            </label>
          )}
        </>
      )}

  {mostrarSelectorPortada && (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))",
        gap: 10,
        marginTop: 12,
        maxHeight: 220,
        overflowY: "auto",
      }}
    >
      {imagenesPedido.map((img) => (
        <div
          key={img.id}
          style={{
            cursor: "pointer",
            border:
              imagenPortadaProduccion === img.url
                ? "3px solid #00aeef"
                : "1px solid #ddd",
            borderRadius: 10,
            overflow: "hidden",
          }}
          onClick={() => {
            setImagenPortadaProduccion(img.url);
            setMostrarSelectorPortada(false);
          }}
        >
          <img
            src={img.url}
            alt=""
            style={{
              width: "100%",
              height: 90,
              objectFit: "cover",
            }}
          />

          <div className="produccion-img-selector-footer">
            <span>{img.producto}</span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImagenPreviewProduccion(img.url);
              }}
            >
              Ver
            </button>
          </div>
        </div>
      ))}

        {imagenesPedido.length === 0 && (
        <div>

        <div
        style={{
        color:"#666",
        marginBottom:10,
        }}
        >
        Este pedido no tiene imágenes.
        </div>

        <input
        type="file"
        accept="image/*"
        onChange={
        manejarSubirPortada
        }
        />

        {subiendoPortada && (
        <div>
        Subiendo portada...
        </div>
        )}

        </div>
        )}
            </div>
          )}
        </div>

        <div className="produccion-modal-section">
          <h4>Archivos</h4>
        <label>Archivos de producción</label>

        <div className="produccion-archivos-box">
          <input
            type="file"
            multiple
            accept=".pdf,.xls,.xlsx,.doc,.docx,.zip"
            onChange={manejarSubirArchivosProduccion}
            className="produccion-modal-input"
          />

          {subiendoArchivoProduccion && (
            <p className="produccion-historial-empty">Subiendo archivo...</p>
          )}

{archivosProduccion.length > 0 && (
  <div className="produccion-archivos-lista">
    {archivosProduccion.map((archivo) => {
      const ext = archivo.extension || archivo.nombre?.split(".").pop()?.toLowerCase();

      const icono =
        ext === "pdf"
          ? "📕"
          : ["xls", "xlsx"].includes(ext)
          ? "📊"
          : ["doc", "docx"].includes(ext)
          ? "📄"
          : ext === "zip"
          ? "🗜️"
          : "📎";

      return (
        <div key={archivo.id} className="produccion-archivo-item compacto">
          <a
            href={archivo.url}
            target="_blank"
            rel="noreferrer"
            className="produccion-archivo-nombre"
            title={archivo.nombre}
          >
            <span>{icono}</span>
            <span>{archivo.nombre}</span>
          </a>

          <div className="produccion-archivo-acciones">
            <a href={archivo.url} target="_blank" rel="noreferrer">
              Ver
            </a>

            <a href={archivo.url} download={archivo.nombre} title="Descargar">
              ↓
            </a>

            <button
              type="button"
              onClick={() => {
                setArchivosProduccion((prev) =>
                  prev.filter((a) => a.id !== archivo.id)
                );
              }}
              title="Quitar"
            >
              ✕
            </button>
          </div>

        </div>
      );
    })}
  </div>
)}
</div>
</div>
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

    {mostrarHistorialGeneral && (
      <div
        className="produccion-modal-overlay"
        onClick={() => setMostrarHistorialGeneral(false)}
      >
        <div
          className="produccion-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <h3>Historial de producción</h3>

          <p className="produccion-historial-empty">
            Próximo paso: acá vamos a mostrar movimientos recientes de todos los pedidos,
            con filtros por fecha, usuario y columna.
          </p>

          <div className="produccion-modal-actions">
            <button
              type="button"
              className="btn-produccion-cancelar"
              onClick={() => setMostrarHistorialGeneral(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )}
      {imagenPreviewProduccion && (
        <div
          className="produccion-imagen-preview-overlay"
          onClick={() => setImagenPreviewProduccion("")}
        >
          <div
            className="produccion-imagen-preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="produccion-imagen-preview-close"
              onClick={() => setImagenPreviewProduccion("")}
            >
              ×
            </button>

            <img src={imagenPreviewProduccion} alt="" />
          </div>
        </div>
      )}
    </div>
  );
}