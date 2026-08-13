import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { collection, getDocs, query, where, doc, updateDoc, writeBatch } from "firebase/firestore";
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
import {
  
  escucharSectoresProduccion,
} from "../../firebase/produccionSectores";
import { agruparPedidosPorColumna } from "./produccionUtils";
import ProduccionBoard from "./ProduccionBoard";
import ProduccionHeader from "./ProduccionHeader";
import ProduccionVistaSectores from "./ProduccionVistaSectores";
import DetalleProduccionModal from "./detalle/DetalleProduccionModal";
import NuevoSectorProduccionModal from "./NuevoSectorProduccionModal";
import EtapasVinculadasModal from "./EtapasVinculadasModal";
import ProduccionFlujoVinculado
  from "./ProduccionFlujoVinculado";
import PedidoFormModal from "../pedidos/PedidoFormModal";
import {
  escucharEtiquetasProduccion,
  crearEtiquetaProduccion,
  actualizarEtiquetaProduccion,
  desactivarEtiquetaProduccion,
} from "../../firebase/produccionEtiquetas";
import {
  escucharGruposVinculadosProduccion,
  escucharEtapasVinculadasProduccion,
  crearGrupoVinculadoProduccion,
  moverEtapaVinculadaProduccion,
  finalizarEtapaVinculadaProduccion,
  tomarGrupoVinculadoProduccion,
} from "../../firebase/produccionEtapasVinculadas";
import {
  construirRepresentacionesProduccion,
} from "./produccionRepresentaciones";
import "./produccion.css";
import { puedeHacer } from "../../utils/permisos";
import SearchableSelect from "../../comunes/componentes/SearchableSelect";




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

const [sectoresProduccion, setSectoresProduccion] = useState([]);
const [sectorNuevaColumnaId, setSectorNuevaColumnaId] = useState("");

 

  const [errorNuevaColumna, setErrorNuevaColumna] = useState("");

  const [columnaEditandoId, setColumnaEditandoId] = useState(null);
  const [nombreEditarColumna, setNombreEditarColumna] = useState("");
  const [guardandoEdicionColumna, setGuardandoEdicionColumna] = useState(false);
  const [eliminandoColumnaId, setEliminandoColumnaId] = useState(null);
  const [columnasContraidas, setColumnasContraidas] = useState([]);

  const [ordenTarjetas, setOrdenTarjetas] = useState("normal");
  const [filtroAsignado, setFiltroAsignado] = useState("todos");
  const [busquedaProduccion, setBusquedaProduccion] = useState("");

  const [sectorVistaSeleccionadoId, setSectorVistaSeleccionadoId] =
    useState("");

  const [
    mostrarVistaGeneralSectores,
    setMostrarVistaGeneralSectores,
  ] = useState(false);



  /*
  * Preparado para planes.
  * Hoy queda habilitado para todos para poder desarrollar
  * y validar la función.
  *
  * Más adelante vendrá desde las capacidades del plan.
  */
  const vistaSectoresDisponible = true;

  const [mostrarFiltrosProduccion, setMostrarFiltrosProduccion] =
   useState(false);

   const filtrosProduccionRef = useRef(null);
   const botonFiltrosProduccionRef = useRef(null);
  

 const [pedidoEditandoDetalle, setPedidoEditandoDetalle] = useState(null);
 const [menuDetalleAbierto, setMenuDetalleAbierto] = useState(false);
const [vistaMenuDetalle, setVistaMenuDetalle] = useState("principal");
const [mensajeMenuDetalle, setMensajeMenuDetalle] = useState("");
const [colorTarjetaManual, setColorTarjetaManual] = useState("");
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
 const [mostrarNuevoPedidoProduccion, setMostrarNuevoPedidoProduccion] = useState(false);
const [pedidoNuevoResaltadoId, setPedidoNuevoResaltadoId] = useState(null);


 const [usuariosProduccion, setUsuariosProduccion] = useState([]);
 const [usuarioAsignadoUid, setUsuarioAsignadoUid] = useState("");

 const [notaCortaManual,setNotaCortaManual]=useState("");
  const [notaLargaManual,setNotaLargaManual]=useState("");

  const [mostrarSelectorPortada,setMostrarSelectorPortada]=useState(false);

  const [imagenPortadaProduccion,setImagenPortadaProduccion]=useState("");
  const [imagenPortadaThumbProduccion, setImagenPortadaThumbProduccion] = useState("");
  const [imagenPreviewProduccion, setImagenPreviewProduccion] = useState("");
  const [archivosProduccion, setArchivosProduccion] = useState([]);
  const [subiendoArchivoProduccion, setSubiendoArchivoProduccion] = useState(false);
  const [imagenesPedido,setImagenesPedido]=useState([]);
  const [subiendoPortada, setSubiendoPortada] = useState(false);


  const [mostrarModalNuevoSector, setMostrarModalNuevoSector] =
    useState(false);



  const [
    posicionNuevaColumnaEnSector,
    setPosicionNuevaColumnaEnSector,
  ] = useState("fin");

const [
  gruposVinculadosProduccion,
  setGruposVinculadosProduccion,
] = useState([]);

const [
  etapasVinculadasProduccion,
  setEtapasVinculadasProduccion,
] = useState([]);

const [
  pedidoGestionVinculada,
  setPedidoGestionVinculada,
] = useState(null);

const [
  mostrarModalEtapasVinculadas,
  setMostrarModalEtapasVinculadas,
] = useState(false);

const [
    pedidoFlujoVinculado,
    setPedidoFlujoVinculado,
  ] = useState(null);

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
  const clienteId = perfil?.clienteId;

  if (!clienteId) {
    setGruposVinculadosProduccion([]);
    setEtapasVinculadasProduccion([]);
    return;
  }

  const unsubscribeGrupos =
    escucharGruposVinculadosProduccion(
      clienteId,
      setGruposVinculadosProduccion
    );

  const unsubscribeEtapas =
    escucharEtapasVinculadasProduccion(
      clienteId,
      setEtapasVinculadasProduccion
    );

  return () => {
    unsubscribeGrupos?.();
    unsubscribeEtapas?.();
  };
}, [perfil?.clienteId]);

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
    if (!perfil?.clienteId) return undefined;

    const unsubscribe = escucharSectoresProduccion(
      perfil.clienteId,
      (sectores) => {
        setSectoresProduccion(sectores || []);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
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


    useEffect(() => {
      if (!mostrarFiltrosProduccion) return undefined;

      function cerrarFiltrosAlHacerClickFuera(event) {
        const dentroPopover =
          filtrosProduccionRef.current?.contains(event.target);

        const dentroBoton =
          botonFiltrosProduccionRef.current?.contains(event.target);

        if (!dentroPopover && !dentroBoton) {
          setMostrarFiltrosProduccion(false);
        }
      }

      function cerrarFiltrosConEscape(event) {
        if (event.key === "Escape") {
          setMostrarFiltrosProduccion(false);
        }
      }

      document.addEventListener(
        "mousedown",
        cerrarFiltrosAlHacerClickFuera
      );

      document.addEventListener(
        "touchstart",
        cerrarFiltrosAlHacerClickFuera
      );

      document.addEventListener(
        "keydown",
        cerrarFiltrosConEscape
      );

      return () => {
        document.removeEventListener(
          "mousedown",
          cerrarFiltrosAlHacerClickFuera
        );

        document.removeEventListener(
          "touchstart",
          cerrarFiltrosAlHacerClickFuera
        );

        document.removeEventListener(
          "keydown",
          cerrarFiltrosConEscape
        );
      };
    }, [mostrarFiltrosProduccion]);    

  useEffect(() => {
    if (!sectorVistaSeleccionadoId) return;

    const sigueExistiendo =
      sectoresProduccion.some(
        (sector) =>
          sector.id === sectorVistaSeleccionadoId
      );

    if (!sigueExistiendo) {
      setSectorVistaSeleccionadoId("");
    }
  }, [
    sectoresProduccion,
    sectorVistaSeleccionadoId,
  ]);  

  useEffect(() => {
  if (!mostrarVistaGeneralSectores) return undefined;

  function cerrarVistaGeneralConEscape(event) {
    if (event.key === "Escape") {
      setMostrarVistaGeneralSectores(false);
    }
  }

  document.addEventListener(
    "keydown",
    cerrarVistaGeneralConEscape
  );

  return () => {
    document.removeEventListener(
      "keydown",
      cerrarVistaGeneralConEscape
    );
  };
}, [mostrarVistaGeneralSectores]);


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

const columnasGlobalesOrdenadas = useMemo(() => {
  return [...columnas].sort((a, b) => {
    /*
     * Reglas estructurales:
     *
     * Pendiente siempre primera.
     * Producción finalizada siempre última.
     * Sólo las columnas intermedias obedecen "orden".
     */

    if (a?.esInicial === true) {
      return b?.esInicial === true ? 0 : -1;
    }

    if (b?.esInicial === true) {
      return 1;
    }

    if (a?.esFinal === true) {
      return b?.esFinal === true ? 0 : 1;
    }

    if (b?.esFinal === true) {
      return -1;
    }

    const ordenA = Number(
      a?.orden ?? 0
    );

    const ordenB = Number(
      b?.orden ?? 0
    );

    if (ordenA !== ordenB) {
      return ordenA - ordenB;
    }

    return String(
      a?.id || ""
    ).localeCompare(
      String(b?.id || "")
    );
  });
}, [columnas]);

  const datosVistaSector = useMemo(() => {
  if (!sectorVistaSeleccionadoId) {
    return {
      columnasVisibles: columnasGlobalesOrdenadas,
      columnaEntradaId: "",
      columnaSalidaId: "",
      columnasSectorIds: [],
    };
  }

  const columnasSector =
    columnasGlobalesOrdenadas.filter(
      (columna) =>
        String(columna.sectorId || "") ===
        String(sectorVistaSeleccionadoId)
    );

  if (columnasSector.length === 0) {
    return {
      columnasVisibles: columnasGlobalesOrdenadas,
      columnaEntradaId: "",
      columnaSalidaId: "",
      columnasSectorIds: [],
    };
  }

  const primeraColumnaSector = columnasSector[0];
  const ultimaColumnaSector =
    columnasSector[columnasSector.length - 1];

  const indicePrimera =
    columnasGlobalesOrdenadas.findIndex(
      (columna) =>
        columna.id === primeraColumnaSector.id
    );

  const indiceUltima =
    columnasGlobalesOrdenadas.findIndex(
      (columna) =>
        columna.id === ultimaColumnaSector.id
    );

  const columnaEntrada =
    indicePrimera > 0
      ? columnasGlobalesOrdenadas[indicePrimera - 1]
      : null;

  const columnaSalida =
    indiceUltima !== -1 &&
    indiceUltima <
      columnasGlobalesOrdenadas.length - 1
      ? columnasGlobalesOrdenadas[indiceUltima + 1]
      : null;

  const idsVisibles = new Set([
    ...(columnaEntrada ? [columnaEntrada.id] : []),
    ...columnasSector.map((columna) => columna.id),
    ...(columnaSalida ? [columnaSalida.id] : []),
  ]);

  return {
    columnasVisibles:
      columnasGlobalesOrdenadas.filter((columna) =>
        idsVisibles.has(columna.id)
      ),

    columnaEntradaId: columnaEntrada?.id || "",
    columnaSalidaId: columnaSalida?.id || "",

    columnasSectorIds: columnasSector.map(
      (columna) => columna.id
    ),
  };
}, [
  columnasGlobalesOrdenadas,
  sectorVistaSeleccionadoId,
]);

const columnasVisibles =
  datosVistaSector.columnasVisibles;

const sectorVistaSeleccionado =
  sectoresProduccion.find(
    (sector) =>
      sector.id === sectorVistaSeleccionadoId
  ) || null;



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



const representacionesProduccion =
  construirRepresentacionesProduccion({
    pedidos:
      pedidosFiltradosPorBusqueda,

    gruposVinculados:
      gruposVinculadosProduccion,

    etapasVinculadas:
      etapasVinculadasProduccion,
  });

const agrupadoBase =
  agruparPedidosPorColumna(
    columnas,
    representacionesProduccion
  );

  const columnaFinal = columnas.find((c) => c.esFinal);
  if (!columnaFinal) {
    const agrupadoOrdenado = {};

    Object.keys(agrupadoBase).forEach((colId) => {
      const columna = columnas.find((c) => c.id === colId);
      const ordenManualActivo =
        columna?.ordenManualActivo === true || columna?.tipoOrden === "manual";

      if (ordenManualActivo) {
        agrupadoOrdenado[colId] = [...(agrupadoBase[colId] || [])].sort((a, b) => {
          const ordenA = Number(a.produccionSortOrder ?? 999999);
          const ordenB = Number(b.produccionSortOrder ?? 999999);

          if (ordenA !== ordenB) return ordenA - ordenB;

          return String(a.id || "").localeCompare(String(b.id || ""));
        });
      } else {
        agrupadoOrdenado[colId] = ordenarTarjetas(agrupadoBase[colId] || [], ordenTarjetas);
      }
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
    const columna = columnas.find((c) => c.id === colId);
    const ordenManualActivo =
      columna?.ordenManualActivo === true || columna?.tipoOrden === "manual";

    if (ordenManualActivo) {
      agrupadoOrdenado[colId] = [...(agrupadoBase[colId] || [])].sort((a, b) => {
        const ordenA = Number(a.produccionSortOrder ?? 999999);
        const ordenB = Number(b.produccionSortOrder ?? 999999);

        if (ordenA !== ordenB) return ordenA - ordenB;

        return String(a.id || "").localeCompare(String(b.id || ""));
      });
    } else {
      agrupadoOrdenado[colId] = ordenarTarjetas(agrupadoBase[colId] || [], ordenTarjetas);
    }
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
  gruposVinculadosProduccion,
  etapasVinculadasProduccion,

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

    const destinoTieneOrdenManual =
      columnaDestino?.ordenManualActivo === true ||
      columnaDestino?.tipoOrden === "manual";

    const ultimoOrdenDestino = Math.max(
      0,
      ...pedidos
        .filter((p) => p.columnaProduccionId === columnaDestinoId)
        .map((p) => Number(p.produccionSortOrder || 0))
    );

    const produccionSortOrderNuevo = destinoTieneOrdenManual
      ? ultimoOrdenDestino + 1000
      : null;  

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
              produccionSortOrder: produccionSortOrderNuevo ?? p.produccionSortOrder ?? null,
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

      if (destinoTieneOrdenManual && produccionSortOrderNuevo !== null) {
        await updateDoc(doc(db, "pedidos", pedidoId), {
          produccionSortOrder: produccionSortOrderNuevo,
        });
      }
    } catch (error) {
      console.error("Error moviendo pedido en producción:", error);
      setPedidos(pedidosPrevios);
    } finally {
      setMoviendo(false);
    }
  }

async function manejarMoverEtapaVinculada({
  etapaId,
  columnaDestinoId,
}) {
  if (!etapaId || !columnaDestinoId) {
    return;
  }

  /*
   * Buscamos la rama real.
   *
   * Esto nos permite conocer en qué columna
   * estaba ANTES del movimiento.
   */
  const etapaActual =
    etapasVinculadasProduccion.find(
      (etapa) =>
        String(etapa.id) ===
        String(etapaId)
    );

  if (!etapaActual) {
    return;
  }

  try {
    /*
     * Columna a la que queremos mover
     * la rama.
     */
    const columnaDestino =
      columnasGlobalesOrdenadas.find(
        (columna) =>
          String(columna.id) ===
          String(columnaDestinoId)
      );

    if (!columnaDestino) {
      return;
    }

    /*
     * Columna en la que está actualmente
     * la rama vinculada.
     */
    const columnaOrigen =
      columnasGlobalesOrdenadas.find(
        (columna) =>
          String(columna.id) ===
          String(
            etapaActual.columnaProduccionId
          )
      );

    /*
     * Sector al que pertenece cada columna.
     *
     * Si alguna columna no tiene sector,
     * queda como string vacío.
     */
    const sectorOrigenId =
      columnaOrigen?.sectorId || "";

    const sectorDestinoId =
      columnaDestino?.sectorId || "";

    /*
     * Buscamos los datos completos de los
     * sectores para guardar también su nombre
     * como referencia histórica.
     */
    const sectorOrigen =
      sectoresProduccion.find(
        (sector) =>
          String(sector.id) ===
          String(sectorOrigenId)
      ) || null;

    const sectorDestino =
      sectoresProduccion.find(
        (sector) =>
          String(sector.id) ===
          String(sectorDestinoId)
      ) || null;

    /*
     * Conservamos exactamente la lógica
     * actual de orden manual.
     */
    const destinoTieneOrdenManual =
      columnaDestino.ordenManualActivo ===
        true ||
      columnaDestino.tipoOrden ===
        "manual";

    const tarjetasDestino =
      pedidosPorColumna[
        columnaDestinoId
      ] || [];

    const ultimoOrdenDestino =
      Math.max(
        0,
        ...tarjetasDestino.map(
          (tarjeta) =>
            Number(
              tarjeta.produccionSortOrder ||
                0
            )
        )
      );

    const produccionSortOrderNuevo =
      destinoTieneOrdenManual
        ? ultimoOrdenDestino + 1000
        : null;

    /*
     * Movemos la rama.
     *
     * Además enviamos origen/destino para
     * que el servicio pueda detectar cuando
     * una rama abandona un sector.
     */
    await moverEtapaVinculadaProduccion({
      etapaId,

      columnaDestinoId,

      produccionSortOrder:
        produccionSortOrderNuevo,

      sectorOrigenId,

      sectorOrigenNombre:
        sectorOrigen?.nombre || "",

      sectorDestinoId,

      sectorDestinoNombre:
        sectorDestino?.nombre || "",

      usuarioActor: {
        uid:
          perfil?.uid ||
          perfil?.firebaseUid ||
          "",

        nombre:
          perfil?.nombre ||
          perfil?.email ||
          "Usuario",
      },
    });
  } catch (error) {
    console.error(
      "Error moviendo etapa vinculada:",
      error
    );
  }
}

  if (loading) {
    return <div className="produccion-page">Cargando producción...</div>;
  }


async function manejarCrearColumna() {
  try {
    const nombre = String(nombreNuevaColumna || "").trim();

    if (!nombre) {
      setErrorNuevaColumna(
        "Ingresá un nombre para la columna."
      );
      return;
    }

    if (!perfil?.clienteId) {
      setErrorNuevaColumna(
        "No se encontró la empresa asociada."
      );
      return;
    }

    setGuardandoColumna(true);
    setErrorNuevaColumna("");

    await crearColumnaIntermediaProduccion({
      clienteId: perfil.clienteId,
      nombre,
      sectorId: sectorNuevaColumnaId || "",
      posicionEnSector:
        sectorNuevaColumnaId
          ? posicionNuevaColumnaEnSector
          : "fin",
    });

    await recalcularPedidosPorCambioDeColumnas(
      perfil.clienteId
    );

    setNombreNuevaColumna("");
    setSectorNuevaColumnaId("");
    setPosicionNuevaColumnaEnSector("fin");
    setErrorNuevaColumna("");
    setMostrarNuevaColumna(false);
  } catch (error) {
    console.error(
      "Error creando columna de producción:",
      error
    );

    setErrorNuevaColumna(
      error?.message ||
        "No se pudo crear la columna."
    );
  } finally {
    setGuardandoColumna(false);
  }
}



async function manejarToggleOrdenManualColumna(columna) {
  try {
    if (!puedeGestionarOrdenManual) return;
    if (!columna?.id) return;

    const nuevoActivo = !columna.ordenManualActivo;

    await actualizarColumnaProduccion(columna.id, {
      ordenManualActivo: nuevoActivo,
      tipoOrden: nuevoActivo ? "manual" : "fecha",
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("Error cambiando orden manual de columna:", error);
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

function abrirDetalleManual(pedido) {
  if (
    !puedeHacerEnProduccion(
      "editarDetalle"
    )
  ) {
    return;
  }

  setPedidoEditandoDetalle(pedido);
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

setImagenPortadaThumbProduccion(
  subida.thumbUrl || subida.url
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
produccionImagenPortadaThumb:
imagenPortadaThumbProduccion,

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

const puedeGestionarColumnas = puedeHacerEnProduccion("gestionarColumnas");
const puedeGestionarOrdenManual = puedeHacerEnProduccion("ordenManual");
const puedeCambiarColorTarjeta = puedeHacerEnProduccion("cambiarColorTarjeta");

const cantidadFiltrosProduccionActivos = [
  ordenTarjetas !== "normal",
  filtroAsignado !== "todos",
  filtroEtiquetaId !== "todas",
].filter(Boolean).length;

const puedeCrearPedidoDesdeProduccion =
  puedeHacer(perfil, "pedidos", "crear");

const puedeGestionarEtiquetasProduccion =
  puedeHacerEnProduccion("editarDetalle");

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

async function manejarCambiarColorTarjeta(
  pedidoId,
  color
) {
  try {
    if (
      !puedeCambiarColorTarjeta
    ) {
      return;
    }

    if (!pedidoId) return;

    /*
     * Actualización optimista:
     * la tarjeta cambia inmediatamente.
     */
    setPedidos((prev) =>
      prev.map((pedido) =>
        (
          pedido.firebaseId ||
          pedido.id
        ) === pedidoId
          ? {
              ...pedido,
              produccionColorTarjeta:
                color || "",
            }
          : pedido
      )
    );

    await updateDoc(
      doc(
        db,
        "pedidos",
        pedidoId
      ),
      {
        produccionColorTarjeta:
          color || "",
      }
    );
  } catch (error) {
    console.error(
      "Error cambiando color de tarjeta:",
      error
    );

    throw error;
  }
}

function manejarPedidoCreadoDesdeProduccion(pedidoCreado) {
  const pedidoId = pedidoCreado?.firebaseId || pedidoCreado?.id;

  if (pedidoId) {
    setPedidoNuevoResaltadoId(pedidoId);

    setTimeout(() => {
      setPedidoNuevoResaltadoId(null);
    }, 2600);
  }

  setMostrarNuevoPedidoProduccion(false);
}

async function manejarReordenManualRepresentacion({
  representacionId,
  representacionObjetivoId,
  columnaId,
}) {
  try {
    if (!puedeHacerEnProduccion("mover")) return;

    if (
      !representacionId ||
      !representacionObjetivoId ||
      !columnaId
    ) {
      return;
    }

    if (
      String(representacionId) ===
      String(representacionObjetivoId)
    ) {
      return;
    }

    const columna =
      columnasGlobalesOrdenadas.find(
        (c) => c.id === columnaId
      );

    const ordenManualActivo =
      columna?.ordenManualActivo === true ||
      columna?.tipoOrden === "manual";

    if (!ordenManualActivo) return;

    /*
     * IMPORTANTE:
     * Trabajamos con las representaciones que realmente
     * están visibles en la columna.
     *
     * Acá pueden convivir:
     * - pedidos normales;
     * - ramas vinculadas.
     */
    const tarjetasColumna = [
      ...(pedidosPorColumna[columnaId] || []),
    ].sort((a, b) => {
      const ordenA = Number(
        a.produccionSortOrder ?? 999999
      );

      const ordenB = Number(
        b.produccionSortOrder ?? 999999
      );

      if (ordenA !== ordenB) {
        return ordenA - ordenB;
      }

      const idA =
        a.produccionRepresentacionId ||
        `principal:${
          a.pedidoFirebaseId ||
          a.firebaseId ||
          a.id ||
          ""
        }`;

      const idB =
        b.produccionRepresentacionId ||
        `principal:${
          b.pedidoFirebaseId ||
          b.firebaseId ||
          b.id ||
          ""
        }`;

      return String(idA).localeCompare(
        String(idB)
      );
    });

    const obtenerRepresentacionId = (
      tarjeta
    ) => {
      const pedidoId =
        tarjeta.pedidoFirebaseId ||
        tarjeta.firebaseId ||
        tarjeta.id ||
        "";

      return String(
        tarjeta.produccionRepresentacionId ||
          `principal:${pedidoId}`
      );
    };

    const indexActual =
      tarjetasColumna.findIndex(
        (tarjeta) =>
          obtenerRepresentacionId(
            tarjeta
          ) === String(representacionId)
      );

    const indexObjetivo =
      tarjetasColumna.findIndex(
        (tarjeta) =>
          obtenerRepresentacionId(
            tarjeta
          ) ===
          String(
            representacionObjetivoId
          )
      );

    if (
      indexActual === -1 ||
      indexObjetivo === -1
    ) {
      return;
    }

    const copia = [
      ...tarjetasColumna,
    ];

    const [movida] =
      copia.splice(indexActual, 1);

    copia.splice(
      indexObjetivo,
      0,
      movida
    );

    const batch =
      writeBatch(db);

    copia.forEach(
      (tarjeta, index) => {
        const nuevoOrden =
          (index + 1) * 1000;

        const esVinculada =
          tarjeta
            .produccionRepresentacionTipo ===
            "vinculada";

        /*
         * RAMA VINCULADA
         */
        if (esVinculada) {
          const etapaId =
            tarjeta
              .produccionEtapaVinculadaId ||
            "";

          if (!etapaId) return;

          batch.update(
            doc(
              db,
              "produccion_etapas_vinculadas",
              etapaId
            ),
            {
              produccionSortOrder:
                nuevoOrden,
            }
          );

          return;
        }

        /*
         * PEDIDO NORMAL
         */
        const pedidoId =
          tarjeta.pedidoFirebaseId ||
          tarjeta.firebaseId ||
          tarjeta.id ||
          "";

        if (!pedidoId) return;

        batch.update(
          doc(
            db,
            "pedidos",
            pedidoId
          ),
          {
            produccionSortOrder:
              nuevoOrden,
          }
        );
      }
    );

    /*
     * Optimista para pedidos normales.
     */
    const ordenPedidoPorId =
      new Map();

    /*
     * Optimista para ramas vinculadas.
     */
    const ordenEtapaPorId =
      new Map();

    copia.forEach(
      (tarjeta, index) => {
        const nuevoOrden =
          (index + 1) * 1000;

        if (
          tarjeta
            .produccionRepresentacionTipo ===
          "vinculada"
        ) {
          const etapaId =
            tarjeta
              .produccionEtapaVinculadaId;

          if (etapaId) {
            ordenEtapaPorId.set(
              String(etapaId),
              nuevoOrden
            );
          }

          return;
        }

        const pedidoId =
          tarjeta.pedidoFirebaseId ||
          tarjeta.firebaseId ||
          tarjeta.id;

        if (pedidoId) {
          ordenPedidoPorId.set(
            String(pedidoId),
            nuevoOrden
          );
        }
      }
    );

    setPedidos((prev) =>
      prev.map((pedido) => {
        const pedidoId =
          pedido.firebaseId ||
          pedido.id;

        const nuevoOrden =
          ordenPedidoPorId.get(
            String(pedidoId || "")
          );

        if (
          nuevoOrden === undefined
        ) {
          return pedido;
        }

        return {
          ...pedido,
          produccionSortOrder:
            nuevoOrden,
        };
      })
    );

    setEtapasVinculadasProduccion(
      (prev) =>
        prev.map((etapa) => {
          const nuevoOrden =
            ordenEtapaPorId.get(
              String(etapa.id || "")
            );

          if (
            nuevoOrden === undefined
          ) {
            return etapa;
          }

          return {
            ...etapa,
            produccionSortOrder:
              nuevoOrden,
          };
        })
    );

    await batch.commit();
  } catch (error) {
    console.error(
      "Error reordenando producción manualmente:",
      error
    );
  }
}





  function enfocarTableroProduccion() {
    window.requestAnimationFrame(() => {
      const wrapper = document.querySelector(
        ".produccion-board-wrapper"
      );

      if (!wrapper) return;

      wrapper.scrollTo({
        left: 0,
        behavior: "smooth",
      });
    });
  }

  function manejarSeleccionarVistaSector(sectorId) {
    if (!vistaSectoresDisponible) return;

    setSectorVistaSeleccionadoId(sectorId);
    setMostrarVistaGeneralSectores(false);
    enfocarTableroProduccion();
  }

  function manejarVistaCompletaProduccion() {
    if (!vistaSectoresDisponible) return;

    setSectorVistaSeleccionadoId("");
    setMostrarVistaGeneralSectores(false);
    enfocarTableroProduccion();
  }

function manejarGestionarEtapaVinculada({
  accion,
  pedido,
}) {
  if (!pedido) return;

  if (accion === "crear") {
    setPedidoGestionVinculada(pedido);
    setMostrarModalEtapasVinculadas(true);
    return;
  }

if (accion === "finalizar") {
  manejarFinalizarEtapaVinculada(
    pedido
  );

  return;
}

if (accion === "tomar") {
  manejarTomarGrupoVinculado(
    pedido
  );

  return;
}

if (accion === "ver-flujo") {
  setPedidoFlujoVinculado(
    pedido
  );

  return;
}
}


async function manejarCrearEtapasVinculadas({
  etapas,
  columnaReunionId,
}) {
  if (!pedidoGestionVinculada) return;
  if (!perfil?.clienteId) return;

  const pedidoId =
    pedidoGestionVinculada.pedidoFirebaseId ||
    pedidoGestionVinculada.firebaseId ||
    pedidoGestionVinculada.id;

  if (!pedidoId) return;

  await crearGrupoVinculadoProduccion({
    clienteId:
      perfil.clienteId,

    pedidoId,

    columnaOrigenId:
      pedidoGestionVinculada
        .columnaProduccionId || "",

    columnaReunionId,

    etapas,

    usuarioActor: {
      uid:
        perfil?.uid ||
        perfil?.firebaseUid ||
        "",

      nombre:
        perfil?.nombre ||
        perfil?.email ||
        "Usuario",
    },
  });

  setMostrarModalEtapasVinculadas(
    false
  );

  setPedidoGestionVinculada(null);
}

async function manejarFinalizarEtapaVinculada(
  pedido
) {
  if (!pedido) return;

  const etapaId =
    pedido.produccionEtapaVinculadaId ||
    "";

  const grupoVinculadoId =
    pedido.produccionGrupoVinculadoId ||
    "";

  const pedidoId =
    pedido.pedidoFirebaseId ||
    pedido.firebaseId ||
    pedido.id ||
    "";

  if (
    !etapaId ||
    !grupoVinculadoId ||
    !pedidoId
  ) {
    return;
  }

  try {
    const resultado =
      await finalizarEtapaVinculadaProduccion({
        etapaId,
        grupoVinculadoId,
        pedidoId,

        usuarioActor: {
          uid:
            perfil?.uid ||
            perfil?.firebaseUid ||
            "",

          nombre:
            perfil?.nombre ||
            perfil?.email ||
            "Usuario",
        },
      });

    console.log(
      "Etapa vinculada finalizada:",
      resultado
    );
  } catch (error) {
    console.error(
      "Error finalizando etapa vinculada:",
      error
    );
  }
}

async function manejarTomarGrupoVinculado(
  pedido
) {
  if (!pedido) return;

  const grupoVinculadoId =
    pedido.produccionGrupoVinculadoId ||
    "";

  const pedidoId =
    pedido.pedidoFirebaseId ||
    pedido.firebaseId ||
    pedido.id ||
    "";

  if (
    !grupoVinculadoId ||
    !pedidoId
  ) {
    return;
  }

  try {
    const grupo =
      gruposVinculadosProduccion.find(
        (item) =>
          String(item.id) ===
          String(grupoVinculadoId)
      );

    if (!grupo) {
      return;
    }

    if (
      grupo.estado !==
      "listo_reunion"
    ) {
      return;
    }

    const columnaReunionId =
      grupo.columnaReunionId || "";

    const columnaReunion =
      columnasGlobalesOrdenadas.find(
        (columna) =>
          String(columna.id) ===
          String(columnaReunionId)
      );

    if (!columnaReunion) {
      return;
    }

    const destinoTieneOrdenManual =
      columnaReunion.ordenManualActivo ===
        true ||
      columnaReunion.tipoOrden ===
        "manual";

    const tarjetasDestino =
      pedidosPorColumna[
        columnaReunionId
      ] || [];

    const ultimoOrdenDestino =
      Math.max(
        0,
        ...tarjetasDestino.map(
          (tarjeta) =>
            Number(
              tarjeta.produccionSortOrder ||
                0
            )
        )
      );

    const produccionSortOrderNuevo =
      destinoTieneOrdenManual
        ? ultimoOrdenDestino + 1000
        : null;

    await tomarGrupoVinculadoProduccion({
      grupoVinculadoId,

      pedidoId,

      produccionSortOrder:
        produccionSortOrderNuevo,

      usuarioActor: {
        uid:
          perfil?.uid ||
          perfil?.firebaseUid ||
          "",

        nombre:
          perfil?.nombre ||
          perfil?.email ||
          "Usuario",
      },
    });
  } catch (error) {
    console.error(
      "Error tomando pedido en punto de reunión:",
      error
    );
  }
}

  return (
    <div className="produccion-page">
      <ProduccionHeader
        busqueda={busquedaProduccion}
        onCambiarBusqueda={setBusquedaProduccion}

        cantidadFiltrosActivos={cantidadFiltrosProduccionActivos}
        filtrosAbiertos={mostrarFiltrosProduccion}
        filtrosTriggerRef={botonFiltrosProduccionRef}
        onToggleFiltros={() =>
          setMostrarFiltrosProduccion((prev) => !prev)
        }

        puedeCrearPedido={puedeCrearPedidoDesdeProduccion}
        onCrearPedido={() =>
          setMostrarNuevoPedidoProduccion(true)
        }

        puedeGestionarColumnas={puedeGestionarColumnas}
        onCrearColumna={() => {
          setErrorNuevaColumna("");
          setMostrarFiltrosProduccion(false);
          setMostrarNuevaColumna(true);
        }}

        onAbrirHistorial={() =>
          setMostrarHistorialGeneral(true)
        }

        puedeGestionarEtiquetas={
          puedeGestionarEtiquetasProduccion
        }
        onGestionarEtiquetas={() => {
          setMostrarFiltrosProduccion(false);

          if (!pedidoEditandoDetalle) {
            setMensajeMenuDetalle(
              "Las etiquetas se gestionan desde el detalle de una tarjeta."
            );
          }
        }}

        puedeUsarVistaSectores={
          sectoresProduccion.length > 0
        }

        vistaSectoresDisponible={
          vistaSectoresDisponible
        }

        sectorVistaNombre={
          sectorVistaSeleccionado?.nombre || ""
        }

        onAbrirVistaSectores={() => {
          setMostrarFiltrosProduccion(false);
          setMostrarVistaGeneralSectores(true);
        }}
      />

      {mostrarFiltrosProduccion && (
        <div
          ref={filtrosProduccionRef}
          className="produccion-filtros-popover"
        >
          <div className="produccion-filtro-campo">
            <label>Orden</label>

            <select
              value={ordenTarjetas}
              onChange={(e) =>
                setOrdenTarjetas(e.target.value)
              }
            >
              <option value="normal">Orden actual</option>
              <option value="entrega-asc">
                Entrega más próxima
              </option>
              <option value="entrega-desc">
                Entrega más lejana
              </option>
            </select>
          </div>

          {!debeVerSoloAsignados && (
            <div className="produccion-filtro-campo">
              <label>Asignado</label>

            <SearchableSelect
              value={filtroAsignado}
              onChange={setFiltroAsignado}
              placeholder="Todos los usuarios"
              searchPlaceholder="Buscar usuario..."
              allowClear={false}
              options={[
                {
                  value: "todos",
                  label: "Todos los usuarios",
                },
                ...(uidActual
                  ? [
                      {
                        value: "mios",
                        label: "Mis pedidos",
                      },
                    ]
                  : []),
                {
                  value: "sin_asignar",
                  label: "Sin asignar",
                },
                ...usuariosProduccion.map((usuario) => ({
                  value: usuario.uid,
                  label:
                    usuario.nombre ||
                    usuario.email ||
                    "Usuario",
                })),
              ]}
            />
            </div>
          )}

          <div className="produccion-filtro-campo">
            <label>Etiqueta</label>

            <SearchableSelect
              value={filtroEtiquetaId}
              onChange={setFiltroEtiquetaId}
              placeholder="Todas las etiquetas"
              searchPlaceholder="Buscar etiqueta..."
              options={[
                {
                  value: "todas",
                  label: "Todas las etiquetas",
                },
                {
                  value: "sin_etiqueta",
                  label: "Sin etiqueta",
                },
                ...etiquetasProduccion.map((etiqueta) => ({
                  value: etiqueta.id,
                  label: etiqueta.nombre,
                })),
              ]}
            />
          </div>

          {cantidadFiltrosProduccionActivos > 0 && (
            <button
              type="button"
              className="produccion-filtros-limpiar"
              onClick={() => {
                setOrdenTarjetas("normal");
                setFiltroAsignado("todos");
                setFiltroEtiquetaId("todas");
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {mostrarVistaGeneralSectores && (
        <div
          className="produccion-vista-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMostrarVistaGeneralSectores(false);
            }
          }}
        >
          <div
            className="produccion-vista-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="produccion-vista-modal-titulo"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="produccion-vista-modal-header">
              <div>
                <span className="produccion-vista-modal-kicker">
                  Flujo de producción
                </span>

                <h3 id="produccion-vista-modal-titulo">
                  Visión general por sectores
                </h3>

              
              </div>

              <button
                type="button"
                className="produccion-vista-modal-cerrar"
                onClick={() => {
                  setMostrarVistaGeneralSectores(false);
                }}
                aria-label="Cerrar visión general"
              >
                ×
              </button>
            </div>

            <div className="produccion-vista-modal-body">
              <ProduccionVistaSectores
                sectores={sectoresProduccion}
                columnas={columnasGlobalesOrdenadas}
           

                

               
                sectorSeleccionadoId={
                  sectorVistaSeleccionadoId
                }
                onSeleccionarSector={
                  manejarSeleccionarVistaSector
                }
                onVistaCompleta={
                  manejarVistaCompletaProduccion
                }
                disponible={vistaSectoresDisponible}
                motivoBloqueo="Disponible a partir del plan Pro"
              />
            </div>
          </div>
        </div>
      )}

      <div className="produccion-board-wrapper">
        <ProduccionBoard
          columnas={columnasVisibles}
          columnasGlobales={columnasGlobalesOrdenadas}

          sectores={sectoresProduccion}
          sectorSeleccionadoId={sectorVistaSeleccionadoId}
          sectorSeleccionadoNombre={
            sectorVistaSeleccionado?.nombre || ""
          }

          columnaEntradaId={
            datosVistaSector.columnaEntradaId
          }

          columnaSalidaId={
            datosVistaSector.columnaSalidaId
          }

          columnasSectorIds={
            datosVistaSector.columnasSectorIds
          }




        pedidosPorColumna={pedidosPorColumna}
        onMoverPedido={manejarMoverPedido}
        onMoverEtapaVinculada={
          manejarMoverEtapaVinculada
        }
        puedeGestionarOrdenManual={puedeGestionarOrdenManual}
        puedeCambiarColorTarjeta={puedeCambiarColorTarjeta}
        onReordenarRepresentacionManual={
          manejarReordenManualRepresentacion
        }
        onReordenarRepresentacionManual={
          manejarReordenManualRepresentacion
        }
        onCambiarColorTarjeta={manejarCambiarColorTarjeta}
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
        onGestionarEtapaVinculada={
          manejarGestionarEtapaVinculada
        }
        puedeGestionarColumnas={puedeGestionarColumnas}
        onMoverColumna={manejarMoverColumna}
        onToggleOrdenManualColumna={manejarToggleOrdenManualColumna}
        ahoraTick={ahoraTick}
        puedeMoverPedidos={puedeHacerEnProduccion("mover")}
        puedeEditarDetalleManual={puedeHacerEnProduccion("editarDetalle")}
        pedidoNuevoResaltadoId={pedidoNuevoResaltadoId}
        
      /> 
     
      </div>

      {mostrarModalEtapasVinculadas &&
        pedidoGestionVinculada && (
          <EtapasVinculadasModal
            pedido={
              pedidoGestionVinculada
            }

            columnas={
              columnasGlobalesOrdenadas
            }

            sectores={
              sectoresProduccion
            }

            onCerrar={() => {
              setMostrarModalEtapasVinculadas(
                false
              );

              setPedidoGestionVinculada(
                null
              );
            }}

            onGuardar={
              manejarCrearEtapasVinculadas
            }
          />
        )}

      {pedidoFlujoVinculado && (
        <ProduccionFlujoVinculado
          pedido={
            pedidoFlujoVinculado
          }
          columnas={
            columnasGlobalesOrdenadas
          }
          onCerrar={() => {
            setPedidoFlujoVinculado(
              null
            );
          }}
        />
      )}  

      {mostrarNuevoPedidoProduccion && (
        <PedidoFormModal
          perfil={perfil}
          onClose={() => setMostrarNuevoPedidoProduccion(false)}
          onPedidoCreado={manejarPedidoCreadoDesdeProduccion}
        />
)}

    {pedidoEditandoDetalle &&
      puedeHacerEnProduccion(
        "editarDetalle"
      ) && (
        <DetalleProduccionModal
          key={
            pedidoEditandoDetalle
              .pedidoFirebaseId ||
            pedidoEditandoDetalle
              .firebaseId ||
            pedidoEditandoDetalle.id
          }

          pedido={
            pedidoEditandoDetalle
          }

          perfil={perfil}

          columnas={
            columnasGlobalesOrdenadas
          }

          usuarios={
            usuariosProduccion
          }

          etiquetasDisponibles={
            etiquetasProduccion
          }

          puedeAsignarUsuario={
            puedeHacerEnProduccion(
              "asignarUsuario"
            )
          }

          puedeCambiarColorTarjeta={
            puedeCambiarColorTarjeta
          }

          onCerrar={
            cerrarDetalleManual
          }

          onMoverPedido={
            manejarMoverPedido
          }

          onCambiarColorTarjeta={
            manejarCambiarColorTarjeta
          }
        />
      )}  



    {mostrarNuevaColumna && (
      <div
        className="produccion-mini-modal-overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setMostrarNuevaColumna(false);
            setNombreNuevaColumna("");
            setSectorNuevaColumnaId("");
            setPosicionNuevaColumnaEnSector("fin");
            setErrorNuevaColumna("");
          }
        }}
      >
        <div
          className="produccion-mini-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-nueva-columna"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="produccion-mini-modal-header">
            <div>
              <h3 id="titulo-nueva-columna">
                Nueva columna
              </h3>

              <p>
                Definí su nombre, sector y ubicación en el flujo.
              </p>
            </div>

            <button
              type="button"
              className="produccion-mini-modal-cerrar"
              onClick={() => {
                setMostrarNuevaColumna(false);
                setNombreNuevaColumna("");
                setSectorNuevaColumnaId("");
                setPosicionNuevaColumnaEnSector("fin");
                setErrorNuevaColumna("");
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="produccion-mini-modal-body">
            <div className="produccion-mini-modal-campo">
              <label htmlFor="produccion-columna-nombre">
                Nombre de la columna
              </label>

              <input
                id="produccion-columna-nombre"
                type="text"
                value={nombreNuevaColumna}
                onChange={(e) =>
                  setNombreNuevaColumna(e.target.value)
                }
                placeholder="Ej: Control de calidad"
                autoFocus
              />
            </div>

            <div className="produccion-mini-modal-campo">
              <label>Sector</label>

              <SearchableSelect
                value={sectorNuevaColumnaId}
                onChange={(nuevoSectorId) => {
                  setSectorNuevaColumnaId(nuevoSectorId);

                  if (!nuevoSectorId) {
                    setPosicionNuevaColumnaEnSector("fin");
                  }
                }}
                placeholder="Seleccionar sector"
                searchPlaceholder="Buscar sector..."
                allowClear
                clearLabel="Sin sector"
                options={sectoresProduccion.map((sector) => ({
                  value: sector.id,
                  label: sector.nombre,
                }))}
                footer={
                  <button
                    type="button"
                    className="produccion-sector-crear-desde-select"
                    onClick={() => {
                      setMostrarModalNuevoSector(true);
                    }}
                  >
                    Crear nuevo sector
                  </button>
                }
              />
            </div>

            {sectorNuevaColumnaId && (
              <div className="produccion-mini-modal-campo">
                <label>Ubicación dentro del sector</label>

                <div className="produccion-posicion-sector">
                  <button
                    type="button"
                    className={
                      posicionNuevaColumnaEnSector === "inicio"
                        ? "activo"
                        : ""
                    }
                    onClick={() =>
                      setPosicionNuevaColumnaEnSector("inicio")
                    }
                  >
                    Al principio
                  </button>

                  <button
                    type="button"
                    className={
                      posicionNuevaColumnaEnSector === "fin"
                        ? "activo"
                        : ""
                    }
                    onClick={() =>
                      setPosicionNuevaColumnaEnSector("fin")
                    }
                  >
                    Al final
                  </button>
                </div>

                <small>
                  La nueva columna se agregará dentro del bloque de este
                  sector.
                </small>
              </div>
            )}

            {errorNuevaColumna && (
              <div className="produccion-mini-modal-error">
                {errorNuevaColumna}
              </div>
            )}
          </div>

          <div className="produccion-mini-modal-footer">
            <button
              type="button"
              className="produccion-mini-modal-btn-cancelar"
              onClick={() => {
                setMostrarNuevaColumna(false);
                setNombreNuevaColumna("");
                setSectorNuevaColumnaId("");
                setPosicionNuevaColumnaEnSector("fin");
                setErrorNuevaColumna("");
              }}
              disabled={guardandoColumna}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="produccion-mini-modal-btn-guardar"
              onClick={manejarCrearColumna}
              disabled={
                guardandoColumna ||
                !nombreNuevaColumna.trim()
              }
            >
              {guardandoColumna
                ? "Creando..."
                : "Crear columna"}
            </button>
          </div>
        </div>
      </div>
    )}

    <NuevoSectorProduccionModal
      abierto={mostrarModalNuevoSector}

      clienteId={perfil?.clienteId || ""}

      ultimoOrdenSector={Math.max(
        0,
        ...sectoresProduccion.map((sector) =>
          Number(sector?.orden || 0)
        )
      )}

      onCerrar={() => {
        setMostrarModalNuevoSector(false);
      }}

      onSectorCreado={(sectorCreado) => {
        /*
        * Seleccionamos inmediatamente el sector nuevo
        * en el modal de creación de columna.
        */
        setSectorNuevaColumnaId(
          sectorCreado?.id || ""
        );

        setPosicionNuevaColumnaEnSector("fin");
      }}
    />

    {mostrarHistorialGeneral && (
      <div
        className="produccion-modal-overlay"
        onClick={() => setMostrarHistorialGeneral(false)}
      >
        <div
          className="produccion-modal"
          onClick={(e) => {
            e.stopPropagation();
            setMenuDetalleAbierto(false);
          }}
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



    </div>
  );
}