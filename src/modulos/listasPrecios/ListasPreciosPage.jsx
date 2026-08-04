import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Plus,
  Search,
  Tags,
  Package,
  Layers,
  Pencil,
  Trash2,
  Power,
  ArrowLeft,
  BadgeDollarSign,
  Copy,
  Star,
  MoreVertical,
  Trash,
  
} from "lucide-react";

import {
  obtenerListasPrecios,
  crearListaPrecio,
  actualizarListaPrecio,
  eliminarListaPrecio,
  obtenerProductosBase,
  marcarListaPrecioPredeterminada,
  duplicarListaPrecio,
  subirImagenProductoBase,
} from "../../firebase/listasPrecios";
import useToast from "../../comunes/hooks/useToast";
import useDialog from "../../comunes/hooks/useDialog";
import "./ListasPreciosPage.css";


const varianteVacia = () => ({
  id: crypto.randomUUID(),
  nombre: "General",
  talles: [],
  precioBase: "",
  reglasCantidad: [],
  adicionales: [],
  imagenUrl: "",
  imagenThumb: "",
  activa: true,
});

const productoVacio = {
  productoBaseId: "",
  nombre: "",
  tipoProducto: "personalizado",
  variantes: [varianteVacia()],
  activo: true,
};

const normalizarVariantesProducto = (producto = {}) => {
  const productoSeguro = producto || {};

  if (
    Array.isArray(productoSeguro.variantes) &&
    productoSeguro.variantes.length > 0
  ) {
    return productoSeguro.variantes.map((v, index) => ({
      id: v.id || `variante-${index}`,
      nombre: v.nombre || "General",
      talles: Array.isArray(v.talles) ? v.talles : [],
      precioBase: Number(v.precioBase || 0),
      reglasCantidad: Array.isArray(v.reglasCantidad) ? v.reglasCantidad : [],
      adicionales: Array.isArray(v.adicionales) ? v.adicionales : [],
      imagenUrl: v.imagenUrl || "",
      imagenThumb: v.imagenThumb || "",
      activa: v.activa !== false,
    }));
  }

  return [
    {
      id: "general",
      nombre: "General",
      talles: [],
      precioBase: Number(productoSeguro.precioBase || 0),
      reglasCantidad: Array.isArray(productoSeguro.reglasCantidad)
        ? productoSeguro.reglasCantidad
        : [],
      adicionales: Array.isArray(productoSeguro.adicionales)
        ? productoSeguro.adicionales
        : [],
      imagenUrl: productoSeguro.imagenUrl || "",
      imagenThumb: productoSeguro.imagenThumb || "",
      activa: true,
    },
  ];
};

export default function ListasPreciosPage({ perfil }) {
  const toast = useToast();
  const { confirm, openFormDialog } = useDialog();
  const accionesEnCursoRef = useRef(new Set());

  const ejecutarUnaVez = async (clave, operacion) => {
    if (accionesEnCursoRef.current.has(clave)) {
      return {
        ejecutada: false,
        resultado: undefined,
      };
    }

    accionesEnCursoRef.current.add(clave);

    try {
      const resultado = await operacion();

      return {
        ejecutada: true,
        resultado,
      };
    } finally {
      accionesEnCursoRef.current.delete(clave);
    }
  };
  const puedeCrear = perfil?.rol === "admin" || perfil?.rol === "superadmin" || perfil?.permisos?.listasPrecios?.crear === true;
  const puedeEditar = perfil?.rol === "admin" || perfil?.rol === "superadmin" || perfil?.permisos?.listasPrecios?.editar === true;
  const puedeEliminar = perfil?.rol === "admin" || perfil?.rol === "superadmin" || perfil?.permisos?.listasPrecios?.eliminar === true;  
  const [listas, setListas] = useState([]);
  const [productosBase, setProductosBase] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaGlobalProducto, setBusquedaGlobalProducto] = useState("");
  const [cargando, setCargando] = useState(true);

  const [modalLista, setModalLista] = useState(false);
  const [listaEditando, setListaEditando] = useState(null);
  const [formLista, setFormLista] = useState({
    nombre: "",
    descripcion: "",
  });

  const [listaSeleccionada, setListaSeleccionada] = useState(null);
  const [productoSeleccionadoIndex, setProductoSeleccionadoIndex] = useState(null);
  const [busquedaProductoLista, setBusquedaProductoLista] = useState("");
    const [adicionalesSimulados, setAdicionalesSimulados] = useState([]);
    const [reglaSeleccionadaIndex, setReglaSeleccionadaIndex] = useState(null);
    const [menuListaAbierto, setMenuListaAbierto] = useState(false);
    const [varianteSeleccionadaIndex, setVarianteSeleccionadaIndex] = useState(0);

    const [menuProductoAbierto, setMenuProductoAbierto] = useState(null);




  const [modalProducto, setModalProducto] = useState(false);
  const [productoEditandoIndex, setProductoEditandoIndex] = useState(null);
  const [formProducto, setFormProducto] = useState(productoVacio);
  const [varianteEditandoIndex, setVarianteEditandoIndex] = useState(0);

  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const cargarDatos = async () => {
    try {
      if (!perfil?.clienteId) return;

      setCargando(true);

      const [listasDb, productosDb] = await Promise.all([
        obtenerListasPrecios(perfil.clienteId),
        obtenerProductosBase(perfil.clienteId),
      ]);

      setListas(listasDb);
      setProductosBase(productosDb);

      if (!listaSeleccionada && listasDb.length > 0) {
        setListaSeleccionada(listasDb[0]);
      }
    } catch (error) {
      console.error("Error cargando listas de precios:", error);

      toast.error("No se pudieron cargar las listas de precios.", {
        accionId: "listasPrecios.cargar",
      });
    } finally {
      setCargando(false);
    }
  };



useEffect(() => {
  if (!perfil?.clienteId) return;

  setCargando(true);

const qListas = query(
  collection(db, "listasPrecios"),
  where("clienteId", "==", perfil.clienteId)
);

  const qProductos = query(
    collection(db, "productosBase"),
    where("clienteId", "==", perfil.clienteId)
  );

  const unsubListas = onSnapshot(
    qListas,
    (snap) => {
      const listasDb = snap.docs.map((d) => ({
        firebaseId: d.id,
        ...d.data(),
      }));

      setListas(listasDb);
      setCargando(false);
    },
    (error) => {
      console.error("Error escuchando listas de precios:", error);

      toast.error(
        "Se perdió la conexión con las listas de precios. Verificá internet y volvé a intentar.",
        {
          accionId: "listasPrecios.listenerListas",
          duracion: 7000,
        }
      );

      setCargando(false);
    }
  );

  const unsubProductos = onSnapshot(
    qProductos,
    (snap) => {
      const productosDb = snap.docs.map((d) => ({
        firebaseId: d.id,
        ...d.data(),
      }));

      setProductosBase(productosDb);
    },
    (error) => {
      console.error("Error escuchando productos base:", error);

      toast.error(
        "No se pudieron actualizar los productos disponibles.",
        {
          accionId: "listasPrecios.listenerProductos",
          duracion: 7000,
        }
      );
    }
  );

  return () => {
    unsubListas();
    unsubProductos();
  };
}, [perfil?.clienteId]);






useEffect(() => {
  setListaSeleccionada((prev) => {
    if (!listas.length) return null;

    if (!prev?.firebaseId) {
      return listas[0];
    }

    const actualizada = listas.find(
      (l) => l.firebaseId === prev.firebaseId
    );

    return actualizada || listas[0];
  });
}, [listas]);

useEffect(() => {
  const cerrar = () => setMenuProductoAbierto(null);

  window.addEventListener("click", cerrar);

  return () => {
    window.removeEventListener("click", cerrar);
  };
}, []);


const productosGlobalesFiltrados = useMemo(() => {
  const texto = busquedaGlobalProducto.trim().toLowerCase();

  if (!texto) return [];

  return listas
    .flatMap((lista) =>
      (lista.productos || []).map((producto, index) => ({
        lista,
        producto,
        indexOriginal: index,
      }))
    )
    .filter(({ lista, producto }) => {
      return (
        (producto.nombre || "").toLowerCase().includes(texto) ||
        (lista.nombre || "").toLowerCase().includes(texto) ||
        (producto.adicionales || []).some((a) =>
          (a.nombre || "").toLowerCase().includes(texto)
        )
      );
    });
}, [listas, busquedaGlobalProducto]);

  const listasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return listas.filter((l) =>
      (l.nombre || "").toLowerCase().includes(texto)
    );
  }, [listas, busqueda]);

  const productosLista = listaSeleccionada?.productos || [];

    const productosListaFiltrados = useMemo(() => {
    const texto = busquedaProductoLista.trim().toLowerCase();

    if (!texto) {
      return productosLista.map((producto, index) => ({ producto, indexOriginal: index }));
    }

    return productosLista
      .map((producto, index) => ({ producto, indexOriginal: index }))
      .filter(({ producto }) =>
        (producto.nombre || "").toLowerCase().includes(texto)
      );
  }, [productosLista, busquedaProductoLista]);

  const productoSeleccionado =
    productoSeleccionadoIndex !== null
      ? productosLista[productoSeleccionadoIndex]
      : productosListaFiltrados[0]?.producto || productosLista[0] || null;

   const productoActivoIndex =
    productoSeleccionadoIndex !== null
      ? productoSeleccionadoIndex
      : productosListaFiltrados[0]?.indexOriginal ?? 0;

   const productoBaseSeleccionado = productosBase.find(
        (p) => p.firebaseId === productoSeleccionado?.productoBaseId
    );

  const variantesProductoSeleccionado = normalizarVariantesProducto(productoSeleccionado);

  const varianteSeleccionada =
    variantesProductoSeleccionado[varianteSeleccionadaIndex] ||
    variantesProductoSeleccionado[0] ||
    null;

    const imagenProductoSeleccionado =
    productoBaseSeleccionado?.imagenUrl ||
    productoSeleccionado?.imagenUrl ||
    "";

    const productoBaseFormSeleccionado = productosBase.find(
      (p) => p.firebaseId === formProducto?.productoBaseId
    );

  const tallesDisponiblesForm = (() => {
    if (Array.isArray(productoBaseFormSeleccionado?.talles)) {
      return productoBaseFormSeleccionado.talles;
    }

    if (productoBaseFormSeleccionado?.tallesPorDefecto) {
      return Object.keys(productoBaseFormSeleccionado.tallesPorDefecto);
    }

    if (Array.isArray(productoBaseFormSeleccionado?.detallesTalle)) {
      return productoBaseFormSeleccionado.detallesTalle.map((d) =>
        typeof d === "string" ? d : d?.nombre
      ).filter(Boolean);
    }

    return [];
  })();

    const obtenerImagenProducto = (producto) => {
    const base = productosBase.find(
        (p) => p.firebaseId === producto?.productoBaseId
    );

    return base?.imagenUrl || producto?.imagenUrl || "";
    };   

  const abrirNuevaLista = () => {
    setListaEditando(null);
    setFormLista({
      nombre: "",
      descripcion: "",
    });
    setModalLista(true);
  };

  const abrirEditarLista = (lista) => {
    setListaEditando(lista);
    setFormLista({
      nombre: lista.nombre || "",
      descripcion: lista.descripcion || "",
    });
    setModalLista(true);
  };

const guardarLista = async () => {
  const claveAccion = listaEditando?.firebaseId
    ? `listasPrecios.guardarLista.${listaEditando.firebaseId}`
    : "listasPrecios.crearLista";

  const ejecucion = await ejecutarUnaVez(
    claveAccion,
    async () => {
      try {
        const nombre = formLista.nombre.trim();

        if (!nombre) {
          toast.warning("Ingresá un nombre para la lista.", {
            accionId: "listasPrecios.validarNombre",
          });

          return false;
        }

        if (listaEditando?.firebaseId) {
          await actualizarListaPrecio(
            listaEditando.firebaseId,
            {
              nombre,
              descripcion:
                formLista.descripcion || "",
            }
          );
        } else {
          await crearListaPrecio(perfil, {
            nombre,
            descripcion:
              formLista.descripcion || "",
          });
        }

        setModalLista(false);
        await cargarDatos();

        toast.success(
          listaEditando
            ? "Lista actualizada correctamente."
            : "Lista creada correctamente.",
          {
            accionId: listaEditando
              ? "listasPrecios.actualizar"
              : "listasPrecios.crear",
          }
        );

        return true;
      } catch (error) {
        console.error("Error guardando lista:", error);

        toast.error("No se pudo guardar la lista.", {
          accionId: "listasPrecios.guardar",
        });

        return false;
      }
    }
  );

  if (!ejecucion.ejecutada) {
    toast.info(
      "La lista ya se está guardando. Esperá un momento.",
      {
        accionId:
          "listasPrecios.guardarDuplicado",
      }
    );
  }
};

 const desactivarLista = async (lista) => {
  try {
    if (!lista?.firebaseId) return;

    const vaAActivar = lista.activa === false;

    const confirmado = await confirm({
      titulo: vaAActivar ? "Activar lista" : "Desactivar lista",
      mensaje: vaAActivar
        ? `¿Querés activar la lista "${lista.nombre}"? Volverá a estar disponible para su uso.`
        : `¿Querés desactivar la lista "${lista.nombre}"? La lista dejará de estar disponible hasta que vuelvas a activarla.`,
      textoConfirmar: vaAActivar ? "Activar" : "Desactivar",
      textoCancelar: "Cancelar",
      variante: vaAActivar ? "success" : "warning",
      cerrarConEscape: true,
      cerrarAlHacerClickFuera: false,
      accionId: vaAActivar
        ? "listasPrecios.activar"
        : "listasPrecios.desactivar",
    });

    if (!confirmado) return;

    await actualizarListaPrecio(lista.firebaseId, {
      activa: vaAActivar,
    });

    await cargarDatos();

    if (listaSeleccionada?.firebaseId === lista.firebaseId) {
      setListaSeleccionada((prev) => ({
        ...prev,
        activa: vaAActivar,
      }));
    }

    toast.success(
      vaAActivar
        ? "Lista activada correctamente."
        : "Lista desactivada correctamente.",
      {
        accionId: vaAActivar
          ? "listasPrecios.activar"
          : "listasPrecios.desactivar",
      }
    );
  } catch (error) {
    console.error("Error cambiando estado de la lista:", error);

    toast.error(
      lista?.activa === false
        ? "No se pudo activar la lista."
        : "No se pudo desactivar la lista.",
      {
        accionId:
          lista?.activa === false
            ? "listasPrecios.activar"
            : "listasPrecios.desactivar",
      }
    );
  }
};

const borrarLista = async (lista) => {
  try {
    if (lista?.activa !== false) {
      toast.warning(
        "Solo se pueden eliminar listas inactivas. Primero desactivá la lista.",
        {
          accionId: "listasPrecios.eliminarListaActiva",
        }
      );

      return;
    }

    if (!lista?.firebaseId) return;

    const confirmado = await confirm({
      titulo: "Eliminar lista",
      mensaje: `¿Seguro querés eliminar la lista "${lista.nombre}"? Esta acción no se puede deshacer.`,
      textoConfirmar: "Eliminar",
      textoCancelar: "Cancelar",
      variante: "danger",
      cerrarConEscape: true,
      cerrarAlHacerClickFuera: false,
      accionId: "listasPrecios.eliminar",
    });

    if (!confirmado) return;

    await eliminarListaPrecio(lista.firebaseId);

    if (
      listaSeleccionada?.firebaseId === lista.firebaseId
    ) {
      setListaSeleccionada(null);
      setProductoSeleccionadoIndex(null);
    }

    await cargarDatos();

    toast.success("Lista eliminada correctamente.", {
      accionId: "listasPrecios.eliminar",
    });
  } catch (error) {
    console.error("Error eliminando lista:", error);

    toast.error("No se pudo eliminar la lista.", {
      accionId: "listasPrecios.eliminar",
    });
  }
};

const marcarComoPredeterminada = async (lista) => {
  try {
    if (!perfil?.clienteId || !lista?.firebaseId) {
      return;
    }

    const claveAccion =
      `listasPrecios.predeterminada.${lista.firebaseId}`;

    const ejecucion = await ejecutarUnaVez(
      claveAccion,
      async () => {
        await marcarListaPrecioPredeterminada(
          perfil.clienteId,
          lista.firebaseId
        );

        const listasActualizadas = listas.map(
          (item) => ({
            ...item,
            predeterminada:
              item.firebaseId === lista.firebaseId,
          })
        );

        setListas(listasActualizadas);

        setListaSeleccionada((prev) =>
          prev?.firebaseId === lista.firebaseId
            ? {
                ...prev,
                predeterminada: true,
              }
            : prev
        );

        toast.success(
          "Lista marcada como predeterminada.",
          {
            accionId:
              "listasPrecios.marcarPredeterminada",
          }
        );

        return true;
      }
    );

    if (!ejecucion.ejecutada) {
      toast.info(
        "La lista ya se está actualizando.",
        {
          accionId:
            "listasPrecios.predeterminadaDuplicada",
        }
      );
    }
  } catch (error) {
    console.error(
      "Error marcando lista predeterminada:",
      error
    );

    toast.error(
      "No se pudo marcar la lista como predeterminada.",
      {
        accionId:
          "listasPrecios.marcarPredeterminada",
      }
    );
  }
};

const duplicarLista = async (lista) => {
  if (!lista?.firebaseId) return;

  const claveAccion =
    `listasPrecios.duplicar.${lista.firebaseId}`;

  const ejecucion = await ejecutarUnaVez(
    claveAccion,
    async () => {
      try {
        await duplicarListaPrecio(perfil, lista);
        await cargarDatos();

        toast.success(
          "Lista duplicada correctamente.",
          {
            accionId: "listasPrecios.duplicar",
          }
        );

        return true;
      } catch (error) {
        console.error(
          "Error duplicando lista:",
          error
        );

        toast.error(
          "No se pudo duplicar la lista.",
          {
            accionId:
              "listasPrecios.duplicar",
          }
        );

        return false;
      }
    }
  );

  if (!ejecucion.ejecutada) {
    toast.info(
      "La lista ya se está duplicando.",
      {
        accionId:
          "listasPrecios.duplicarDuplicado",
      }
    );
  }
};

  const abrirDetalleLista = (lista) => {
    setListaSeleccionada(lista);
    setProductoSeleccionadoIndex(null);
    setBusquedaProductoLista("");
    setAdicionalesSimulados([]);
    setReglaSeleccionadaIndex(null);
    setMenuListaAbierto(false);
    setVarianteSeleccionadaIndex(0);
  };

const abrirNuevoProducto = () => {
  setProductoEditandoIndex(null);
  setFormProducto({
    ...productoVacio,
    variantes: [varianteVacia()],
  });
  setVarianteEditandoIndex(0);
  setModalProducto(true);
};

const abrirEditarProducto = (producto, index) => {
  const variantes = normalizarVariantesProducto(producto);

  setProductoEditandoIndex(index);
  setFormProducto({
    ...productoVacio,
    ...producto,
    variantes,
  });
  setVarianteEditandoIndex(0);
  setModalProducto(true);
};

  const productoYaExisteEnLista = (productoBaseId) => {
    if (!productoBaseId) return false;

    return (listaSeleccionada?.productos || []).some((producto, index) => {
      if (productoEditandoIndex === index) return false;
      return producto.productoBaseId === productoBaseId;
    });
  };

  const seleccionarProductoBase = (productoBaseId) => {
    const producto = productosBase.find((p) => p.firebaseId === productoBaseId);

    setFormProducto((prev) => ({
      ...prev,
      productoBaseId,
      nombre: producto?.nombre || "",
      tipoProducto: "personalizado",
    }));
  };

const agregarVariante = async () => {
  try {
    const variantesActuales =
      normalizarVariantesProducto(formProducto);

    const resultado = await openFormDialog({
      titulo: "Nueva variante",
      mensaje:
        "Ingresá el nombre de la variante y elegí si querés copiar una configuración existente.",
      textoConfirmar: "Crear variante",
      textoCancelar: "Cancelar",
      cerrarConEscape: true,
      cerrarAlHacerClickFuera: false,
      accionId: "listasPrecios.crearVariante",

      valoresIniciales: {
        nombre: "Nueva variante",
        copiarConfiguracion:
          variantesActuales.length > 0,
        varianteOrigenId:
          variantesActuales[0]?.id || "",
      },

      campos: [
        {
          nombre: "nombre",
          tipo: "text",
          etiqueta: "Nombre",
          placeholder: "Ej: Adulto",
          requerido: true,
          mensajeRequerido:
            "Ingresá un nombre para la variante.",
          maxLength: 80,
          autoFocus: true,
        },
        {
          nombre: "copiarConfiguracion",
          tipo: "checkbox",
          etiqueta:
            "Copiar configuración desde otra variante",
          disabled: variantesActuales.length === 0,
        },
        {
          nombre: "varianteOrigenId",
          tipo: "select",
          etiqueta: "Variante de origen",
          placeholder: "Seleccioná una variante",
          requerido: true,
          opciones: variantesActuales.map(
            (variante, index) => ({
              valor:
                variante.id ||
                `variante-origen-${index}`,
              etiqueta:
                variante.nombre || "General",
            })
          ),

          ocultoCuando: (valores) =>
            valores.copiarConfiguracion !== true,
        },
      ],

      validar: (valores) => {
        const errores = {};
        const nombreNormalizado =
          String(valores.nombre || "").trim();

        const nombreRepetido =
          variantesActuales.some(
            (variante) =>
              String(variante.nombre || "")
                .trim()
                .toLowerCase() ===
              nombreNormalizado.toLowerCase()
          );

        if (nombreRepetido) {
          errores.nombre =
            "Ya existe una variante con ese nombre.";
        }

        if (
          valores.copiarConfiguracion === true &&
          !valores.varianteOrigenId
        ) {
          errores.varianteOrigenId =
            "Seleccioná la variante que querés copiar.";
        }

        return errores;
      },
    });

    if (!resultado.confirmado) return;

    const nombre =
      String(resultado.valores?.nombre || "").trim();

    if (!nombre) {
      toast.warning(
        "Ingresá un nombre para la variante.",
        {
          accionId:
            "listasPrecios.validarNuevaVariante",
        }
      );

      return;
    }

    let varianteBase = null;

    if (
      resultado.valores?.copiarConfiguracion === true
    ) {
      varianteBase = variantesActuales.find(
        (variante, index) =>
          (
            variante.id ||
            `variante-origen-${index}`
          ) === resultado.valores.varianteOrigenId
      );

      if (!varianteBase) {
        toast.error(
          "No se encontró la variante seleccionada para copiar.",
          {
            accionId:
              "listasPrecios.varianteOrigenNoEncontrada",
          }
        );

        return;
      }
    }

    const nuevaVariante = varianteBase
      ? {
          ...varianteBase,
          id: crypto.randomUUID(),
          nombre,
          precioBase: "",
          reglasCantidad: (
            varianteBase.reglasCantidad || []
          ).map((regla) => ({
            ...regla,
            precio: "",
          })),
          adicionales: (
            varianteBase.adicionales || []
          ).map((adicional) => ({
            ...adicional,
            id: crypto.randomUUID(),
          })),
        }
      : {
          ...varianteVacia(),
          nombre,
        };

    const nuevasVariantes = [
      ...variantesActuales,
      nuevaVariante,
    ];

    setFormProducto((prev) => ({
      ...prev,
      variantes: nuevasVariantes,
    }));

    setVarianteEditandoIndex(
      nuevasVariantes.length - 1
    );

    toast.success(
      varianteBase
        ? `Variante "${nombre}" creada copiando la configuración de "${varianteBase.nombre || "General"}".`
        : `Variante "${nombre}" creada correctamente.`,
      {
        accionId:
          "listasPrecios.crearVariante",
      }
    );
  } catch (error) {
    console.error(
      "Error creando variante:",
      error
    );

    toast.error(
      "No se pudo crear la variante.",
      {
        accionId:
          "listasPrecios.crearVariante",
      }
    );
  }
};

const actualizarVariante = (index, campo, valor) => {
  setFormProducto((prev) => {
    const variantes = [...(prev.variantes || [])];

    variantes[index] = {
      ...variantes[index],
      [campo]: valor,
    };

    return {
      ...prev,
      variantes,
    };
  });
};

const toggleTalleVariante = (indexVariante, talle) => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const varianteActual = variantes[indexVariante];

    if (!varianteActual) return prev;

    const tallesActuales = Array.isArray(varianteActual.talles)
      ? varianteActual.talles
      : [];

    const yaExiste = tallesActuales.includes(talle);

    variantes[indexVariante] = {
      ...varianteActual,
      talles: yaExiste
        ? tallesActuales.filter((t) => t !== talle)
        : [...tallesActuales, talle],
    };

    return {
      ...prev,
      variantes,
    };
  });
};

const quitarVariante = async (index) => {
  const variantes = normalizarVariantesProducto(formProducto);
  const variante = variantes[index];

  if (!variante) {
    toast.error("No se encontró la variante seleccionada.", {
      accionId: "listasPrecios.varianteNoEncontrada",
    });

    return;
  }

  if (index === 0 || variante.id === "general") {
    toast.warning("La variante General no se puede eliminar.", {
      accionId: "listasPrecios.varianteGeneral",
    });

    return;
  }

  if (variantes.length <= 1) {
    toast.warning("El producto debe tener al menos una variante.", {
      accionId: "listasPrecios.minimoVariantes",
    });

    return;
  }

  const confirmado = await confirm({
    titulo: "Eliminar variante",
    mensaje: `¿Querés eliminar la variante "${variante.nombre || "Sin nombre"}"? También se quitarán sus precios, reglas por cantidad y adicionales.`,
    textoConfirmar: "Eliminar variante",
    textoCancelar: "Cancelar",
    variante: "danger",
    cerrarConEscape: true,
    cerrarAlHacerClickFuera: false,
    accionId: "listasPrecios.eliminarVariante",
  });

  if (!confirmado) return;

  const nuevasVariantes = variantes.filter(
    (_, i) => i !== index
  );

  setFormProducto((prev) => ({
    ...prev,
    variantes: nuevasVariantes,
  }));

  setVarianteEditandoIndex((indiceActual) => {
    if (indiceActual === index) {
      return Math.max(0, index - 1);
    }

    if (indiceActual > index) {
      return indiceActual - 1;
    }

    return indiceActual;
  });

  toast.success("Variante eliminada correctamente.", {
    accionId: "listasPrecios.eliminarVariante",
  });
};

const agregarReglaCantidad = () => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const index = varianteEditandoIndex;

    variantes[index] = {
      ...variantes[index],
      reglasCantidad: [
        ...(variantes[index].reglasCantidad || []),
        { desde: "", hasta: "", precio: "" },
      ],
    };

    return { ...prev, variantes };
  });
};

const actualizarRegla = (indexRegla, campo, valor) => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const indexVariante = varianteEditandoIndex;
    const reglas = [...(variantes[indexVariante].reglasCantidad || [])];

    reglas[indexRegla] = {
      ...reglas[indexRegla],
      [campo]: valor,
    };

    variantes[indexVariante] = {
      ...variantes[indexVariante],
      reglasCantidad: reglas,
    };

    return { ...prev, variantes };
  });
};

const quitarRegla = (indexRegla) => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const indexVariante = varianteEditandoIndex;

    variantes[indexVariante] = {
      ...variantes[indexVariante],
      reglasCantidad: (variantes[indexVariante].reglasCantidad || []).filter(
        (_, i) => i !== indexRegla
      ),
    };

    return { ...prev, variantes };
  });
};

const agregarAdicional = () => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const indexVariante = varianteEditandoIndex;

    variantes[indexVariante] = {
      ...variantes[indexVariante],
      adicionales: [
        ...(variantes[indexVariante].adicionales || []),
        {
          id: crypto.randomUUID(),
          nombre: "",
          tipoCalculo: "por_unidad",
          precio: "",
          activo: true,
        },
      ],
    };

    return { ...prev, variantes };
  });
};

const actualizarAdicional = (indexAdicional, campo, valor) => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const indexVariante = varianteEditandoIndex;
    const adicionales = [...(variantes[indexVariante].adicionales || [])];

    adicionales[indexAdicional] = {
      ...adicionales[indexAdicional],
      [campo]: valor,
    };

    variantes[indexVariante] = {
      ...variantes[indexVariante],
      adicionales,
    };

    return { ...prev, variantes };
  });
};

const quitarAdicional = (indexAdicional) => {
  setFormProducto((prev) => {
    const variantes = normalizarVariantesProducto(prev);
    const indexVariante = varianteEditandoIndex;

    variantes[indexVariante] = {
      ...variantes[indexVariante],
      adicionales: (variantes[indexVariante].adicionales || []).filter(
        (_, i) => i !== indexAdicional
      ),
    };

    return { ...prev, variantes };
  });
};

  const guardarProductoEnLista = async () => {
    try {
      if (!listaSeleccionada?.firebaseId) return;

      if (!formProducto.nombre.trim()) {
        toast.warning("Seleccioná o ingresá un producto.", {
          accionId: "listasPrecios.validarProducto",
        });

        return;
      }

      if (
        formProducto.productoBaseId &&
        productoYaExisteEnLista(formProducto.productoBaseId)
      ) {
        toast.info(
          "Este producto ya está agregado en esta lista. Si necesitás otra configuración de precio, creá una lista alternativa.",
          {
            accionId: "listasPrecios.productoDuplicado",
            duracion: 7000,
          }
        );

        return;
      }

    let variantesBase = normalizarVariantesProducto(formProducto);

      const tieneGeneral = variantesBase.some(
        (v) => v.id === "general" || v.nombre === "General"
      );

      if (!tieneGeneral) {
        variantesBase = [
          {
            ...varianteVacia(),
            id: "general",
            nombre: "General",
          },
          ...variantesBase,
        ];
      }

      const variantesNormalizadas = variantesBase.map((v) => ({
      ...v,
      nombre: (v.nombre || "General").trim(),
      precioBase: Number(v.precioBase || 0),
      reglasCantidad: (v.reglasCantidad || []).map((r) => ({
        desde: Number(r.desde || 0),
        hasta: r.hasta === "" || r.hasta === null ? null : Number(r.hasta),
        precio: Number(r.precio || 0),
      })),
      adicionales: (v.adicionales || []).map((a) => ({
        ...a,
        nombre: (a.nombre || "").trim(),
        precio: Number(a.precio || 0),
        activo: a.activo !== false,
      })),
      activa: v.activa !== false,
    }));

    const varianteGeneral = variantesNormalizadas[0] || varianteVacia();

    const productoNormalizado = {
      ...formProducto,
      nombre: formProducto.nombre.trim(),

      // Compatibilidad vieja
      precioBase: Number(varianteGeneral.precioBase || 0),
      reglasCantidad: varianteGeneral.reglasCantidad || [],
      adicionales: varianteGeneral.adicionales || [],

      // Nueva arquitectura
      variantes: variantesNormalizadas,

      activo: true,
    };

      const productosActuales = listaSeleccionada.productos || [];
      let nuevosProductos = [];

      if (productoEditandoIndex !== null) {
        nuevosProductos = productosActuales.map((p, index) =>
          index === productoEditandoIndex ? productoNormalizado : p
        );
      } else {
        nuevosProductos = [...productosActuales, productoNormalizado];
      }

      await actualizarListaPrecio(listaSeleccionada.firebaseId, {
        productos: nuevosProductos,
      });

      const listaActualizada = {
        ...listaSeleccionada,
        productos: nuevosProductos,
      };

      setModalProducto(false);
      setListaSeleccionada(listaActualizada);
      setProductoSeleccionadoIndex(
        productoEditandoIndex !== null
          ? productoEditandoIndex
          : nuevosProductos.length - 1
      );

      await cargarDatos();

      toast.success(
        productoEditandoIndex !== null
          ? "Producto actualizado correctamente."
          : "Producto agregado correctamente.",
        {
          accionId:
            productoEditandoIndex !== null
              ? "listasPrecios.actualizarProducto"
              : "listasPrecios.agregarProducto",
        }
      );
    } catch (error) {
      console.error("Error guardando producto en lista:", error);

      toast.error("No se pudo guardar el producto.", {
        accionId: "listasPrecios.guardarProducto",
      });
    }
  };

const quitarProductoDeLista = async (indexProducto) => {
  try {
    if (!listaSeleccionada?.firebaseId) return;

    const producto =
      (listaSeleccionada.productos || [])[indexProducto];

    if (!producto) {
      toast.error("No se encontró el producto seleccionado.", {
        accionId: "listasPrecios.quitarProductoNoEncontrado",
      });

      return;
    }

    const confirmado = await confirm({
      titulo: "Quitar producto",
      mensaje: `¿Querés quitar "${producto.nombre || "este producto"}" de la lista "${listaSeleccionada.nombre}"? Se eliminará su configuración de precios dentro de esta lista.`,
      textoConfirmar: "Quitar producto",
      textoCancelar: "Cancelar",
      variante: "danger",
      cerrarConEscape: true,
      cerrarAlHacerClickFuera: false,
      accionId: "listasPrecios.quitarProducto",
    });

    if (!confirmado) return;

    const nuevosProductos = (
      listaSeleccionada.productos || []
    ).filter((_, index) => index !== indexProducto);

    await actualizarListaPrecio(
      listaSeleccionada.firebaseId,
      {
        productos: nuevosProductos,
      }
    );

    setListaSeleccionada((prev) => ({
      ...prev,
      productos: nuevosProductos,
    }));

    setProductoSeleccionadoIndex(null);
    setVarianteSeleccionadaIndex(0);
    setReglaSeleccionadaIndex(null);
    setAdicionalesSimulados([]);

    await cargarDatos();

    toast.success("Producto quitado de la lista correctamente.", {
      accionId: "listasPrecios.quitarProducto",
    });
  } catch (error) {
    console.error(
      "Error quitando producto de la lista:",
      error
    );

    toast.error("No se pudo quitar el producto de la lista.", {
      accionId: "listasPrecios.quitarProducto",
    });
  }
};

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat(perfil?.localeMoneda || "es-AR", {
      style: "currency",
      currency: perfil?.moneda || "ARS",
      minimumFractionDigits: 0,
    }).format(Number(valor || 0));
  };

  const toggleAdicionalSimulado = (adicionalId) => {
    setAdicionalesSimulados((prev) =>
      prev.includes(adicionalId)
        ? prev.filter((id) => id !== adicionalId)
        : [...prev, adicionalId]
    );
  };

const precioFinalSeleccionado = useMemo(() => {
  if (!productoSeleccionado || !varianteSeleccionada) return 0;

  const reglas = Array.isArray(varianteSeleccionada.reglasCantidad)
    ? varianteSeleccionada.reglasCantidad
    : [];

  const reglaSeleccionada =
    reglaSeleccionadaIndex !== null ? reglas[reglaSeleccionadaIndex] : null;

  const precioBaseAplicado = Number(
    reglaSeleccionada?.precio || varianteSeleccionada.precioBase || 0
  );

  const adicionales = Array.isArray(varianteSeleccionada.adicionales)
    ? varianteSeleccionada.adicionales
    : [];

  const totalAdicionales = adicionales
    .filter((a, index) => {
      const id = a.id || `adicional-${index}`;
      return adicionalesSimulados.includes(id);
    })
    .reduce((acc, a) => acc + Number(a.precio || 0), 0);

  return precioBaseAplicado + totalAdicionales;
}, [
  productoSeleccionado,
  varianteSeleccionada,
  adicionalesSimulados,
  reglaSeleccionadaIndex,
]);

const composicionPrecioSeleccionado = useMemo(() => {
  if (!productoSeleccionado || !varianteSeleccionada) return [];

  const chips = [];

  chips.push(varianteSeleccionada.nombre || "General");

  const reglas = Array.isArray(varianteSeleccionada.reglasCantidad)
    ? varianteSeleccionada.reglasCantidad
    : [];

  const reglaSeleccionada =
    reglaSeleccionadaIndex !== null ? reglas[reglaSeleccionadaIndex] : null;

  if (reglaSeleccionada) {
    chips.push(
      `${reglaSeleccionada.desde || 0} a ${
        reglaSeleccionada.hasta || "sin límite"
      } un.`
    );
  } else {
    chips.push("Precio base");
  }

  const adicionales = Array.isArray(varianteSeleccionada.adicionales)
    ? varianteSeleccionada.adicionales
    : [];

  adicionales
    .filter((a, index) => {
      const id = a.id || `adicional-${index}`;
      return adicionalesSimulados.includes(id);
    })
    .forEach((a) => {
      if (a.nombre) chips.push(a.nombre);
    });

  return chips;
}, [
  productoSeleccionado,
  varianteSeleccionada,
  reglaSeleccionadaIndex,
  adicionalesSimulados,
]);

  const totalProductos = productosLista.length;
  const totalReglas = productosLista.reduce(
    (acc, p) => acc + (p.reglasCantidad || []).length,
    0
  );
  const totalAdicionales = productosLista.reduce(
    (acc, p) => acc + (p.adicionales || []).length,
    0
  );

  const cambiarImagenProducto = async (e) => {
  try {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    if (!productoSeleccionado?.productoBaseId) {
      toast.warning("Este producto no está vinculado a un producto base.", {
        accionId: "listasPrecios.imagenSinProductoBase",
      });

      return;
    }

    setSubiendoImagen(true);

    await subirImagenProductoBase(
      perfil.clienteId,
      productoSeleccionado.productoBaseId,
      archivo
    );

    await cargarDatos();

    toast.success("Imagen actualizada correctamente.", {
      accionId: "listasPrecios.subirImagen",
    });
  } catch (error) {
    console.error("Error subiendo imagen:", error);

    toast.error("No se pudo subir la imagen.", {
      accionId: "listasPrecios.subirImagen",
    });
  } finally {
    setSubiendoImagen(false);
    e.target.value = "";
  }
};

  return (
    <div className="listas-precios-page">
      <div className="lp-topbar">
        <div>
          <span className="lp-kicker">Configuración comercial</span>
          <h1>Listas de precios</h1>
          
        </div>

        {puedeCrear && (
          <button className="lp-btn-principal" onClick={abrirNuevaLista}>
            <Plus size={18} />
            Nueva lista
          </button>
        )}
      </div>

      <div className="lp-buscador-global-productos">
        <Search size={18} />

        <input
            value={busquedaGlobalProducto}
            onChange={(e) => setBusquedaGlobalProducto(e.target.value)}
            placeholder="Buscar producto en todas las listas..."
        />

        {busquedaGlobalProducto.trim() && (
            <div className="lp-resultados-globales">
            {productosGlobalesFiltrados.length === 0 ? (
                <div className="lp-global-empty">
                No se encontraron productos.
                </div>
            ) : (
                productosGlobalesFiltrados.slice(0, 10).map(
                ({ lista, producto, indexOriginal }) => (
                    <button
                    type="button"
                    key={`${lista.firebaseId}-${producto.nombre}-${indexOriginal}`}
                    onClick={() => {
                        abrirDetalleLista(lista);
                        setProductoSeleccionadoIndex(indexOriginal);
                        setAdicionalesSimulados([]);
                        setReglaSeleccionadaIndex(null);
                        setBusquedaGlobalProducto("");
                    }}
                    >
                    <strong>{producto.nombre}</strong>
                    <span>
                        {lista.nombre} · {formatearMoneda(producto.precioBase)}
                    </span>
                    </button>
                )
                )
            )}
            </div>
        )}
        </div>

      <div className="lp-layout-pro">
        <aside className="lp-sidebar-listas">
          <div className="lp-sidebar-title">
            <div>
              <h2>Listas</h2>
              <span>{listas.length} configuradas</span>
            </div>
            <Tags size={20} />
          </div>

          <div className="lp-search">
            <Search size={17} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar lista..."
            />
          </div>

          <div className="lp-listas-scroll">
            {cargando ? (
              <p className="lp-empty">Cargando listas...</p>
            ) : listasFiltradas.length === 0 ? (
              <div className="lp-empty-box">
                <Tags size={24} />
                <strong>Sin listas</strong>
                <span>Creá tu primera lista de precios.</span>
              </div>
            ) : (
              listasFiltradas.map((lista) => (
                <button
                  key={lista.firebaseId}
                  className={`lp-lista-item ${
                    listaSeleccionada?.firebaseId === lista.firebaseId ? "activa" : ""
                  }`}
                  onClick={() => abrirDetalleLista(lista)}
                >
                  <div className="lp-lista-icon">
                    <BadgeDollarSign size={18} />
                  </div>

                  <div className="lp-lista-info">
                    <strong>{lista.nombre}</strong>
                    <span>
                        {(lista.productos || []).length} productos ·{" "}
                        {lista.moneda || perfil?.moneda || "ARS"}
                        {lista.predeterminada ? " · Predeterminada" : ""}
                    </span>
                  </div>

                  <span
                    className={`lp-dot ${
                      lista.activa === false ? "inactiva" : "activa"
                    }`}
                  />
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="lp-panel-detalle">
          {!listaSeleccionada ? (
            <div className="lp-empty-state">
              <Tags size={42} />
              <h2>Seleccioná una lista</h2>
              <p>Desde acá vas a administrar los productos y precios.</p>
            </div>
          ) : (
            <>
              <div className="lp-detalle-header lp-detalle-header-limpio">
                <div>
                  <span className="lp-kicker">Lista seleccionada</span>

                  <div className="lp-title-row">
                    <h2>{listaSeleccionada.nombre}</h2>

                    {listaSeleccionada.predeterminada && (
                      <span className="lp-badge-star">
                        <Star size={14} />
                        Predeterminada
                      </span>
                    )}
                  </div>

                  <p>
                    {(listaSeleccionada.productos || []).length} productos configurados
                  </p>
                </div>

                <div className="lp-menu-wrapper">
                  <button
                    type="button"
                    className="lp-icon-btn"
                    onClick={() => setMenuListaAbierto((prev) => !prev)}
                  >
                    <MoreVertical size={20} />
                  </button>

                  {menuListaAbierto && (
                    <div className="lp-menu-acciones">
                      {puedeEditar && !listaSeleccionada.predeterminada && (
                        <button
                          type="button"
                          onClick={() => {
                            marcarComoPredeterminada(listaSeleccionada);
                            setMenuListaAbierto(false);
                          }}
                        >
                          <Star size={16} />
                          Marcar predeterminada
                        </button>
                      )}

                      {puedeCrear && (
                        <button
                          type="button"
                          onClick={() => {
                            duplicarLista(listaSeleccionada);
                            setMenuListaAbierto(false);
                          }}
                        >
                          <Copy size={16} />
                          Duplicar lista
                        </button>
                      )}

                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => {
                            abrirEditarLista(listaSeleccionada);
                            setMenuListaAbierto(false);
                          }}
                        >
                          <Pencil size={16} />
                          Editar lista
                        </button>
                      )}

                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => {
                            desactivarLista(listaSeleccionada);
                            setMenuListaAbierto(false);
                          }}
                        >
                          <Power size={16} />
                          {listaSeleccionada.activa === false
                            ? "Activar lista"
                            : "Desactivar lista"}
                        </button>
                      )}

                        {puedeEliminar && listaSeleccionada.activa === false && (
                        <button
                            type="button"
                            className="danger"
                            onClick={() => {
                            borrarLista(listaSeleccionada);
                            setMenuListaAbierto(false);
                            }}
                        >
                            <Trash2 className="lp-trash-svg" size={16} strokeWidth={2.4} />
                            Eliminar lista
                        </button>
                        )}
                    </div>
                  )}
                </div>
              </div>

              <div className="lp-productos-layout">
                <div className="lp-productos-lista">
                  <div className="lp-section-head">
                    <div>
                      <h3>Productos de la lista</h3>
                     
                    </div>

                    {puedeEditar && (
                    <button className="lp-btn-principal" onClick={abrirNuevoProducto}>
                        <Plus size={17} />
                        Agregar
                    </button>
                    )}
                  </div>

                  {productosLista.length === 0 ? (
                    <div className="lp-empty-box">
                      <Package size={26} />
                      <strong>Sin productos</strong>
                      <span>Agregá el primer producto a esta lista.</span>
                    </div>
                ) : (
                    <>
                      <div className="lp-search-productos">
                        <Search size={17} />
                        <input
                        value={busquedaProductoLista}
                        onChange={(e) => {
                          setBusquedaProductoLista(e.target.value);
                          setProductoSeleccionadoIndex(null);
                          setAdicionalesSimulados([]);
                          setReglaSeleccionadaIndex(null);
                          setVarianteSeleccionadaIndex(0);
                        }}
                        placeholder="Buscar producto en esta lista..."
                      />
                    </div>

                    
                    <div className="lp-product-card-list">
                      {productosListaFiltrados.map(({ producto, indexOriginal }) => (
                       <div
                          key={`${producto.nombre}-${indexOriginal}`}
                          className={`lp-product-row-wrap ${
                            productoActivoIndex === indexOriginal ? "activo" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="lp-product-row"
                            onClick={() => {
                              setProductoSeleccionadoIndex(indexOriginal);
                              setAdicionalesSimulados([]);
                              setReglaSeleccionadaIndex(null);
                              setVarianteSeleccionadaIndex(0);
                              setMenuProductoAbierto(null);
                            }}
                          >
                            <div className="lp-product-thumb">
                              {obtenerImagenProducto(producto) ? (
                                <img
                                  src={obtenerImagenProducto(producto)}
                                  alt={producto.nombre}
                                />
                              ) : (
                                <Package size={22} />
                              )}
                            </div>

                            <div className="lp-product-main">
                              <span>{producto.nombre}</span>
                              <small>{formatearMoneda(producto.precioBase)}</small>
                            </div>
                          </button>

                          <button
                            type="button"
                            className="lp-product-row-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuProductoAbierto((prev) =>
                                prev === indexOriginal ? null : indexOriginal
                              );
                            }}
                          >
                            <MoreVertical size={18} />
                          </button>

                          {menuProductoAbierto === indexOriginal && (
                            <div
                              className="lp-product-row-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuProductoAbierto(null);
                                  abrirEditarProducto(producto, indexOriginal);
                                }}
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                className="danger"
                                onClick={() => {
                                  setMenuProductoAbierto(null);
                                  quitarProductoDeLista(indexOriginal);
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                </>
                  )}
                  
                </div>

                <div className="lp-product-preview">
                  {!productoSeleccionado ? (
                    <div className="lp-empty-state compact">
                      <Layers size={34} />
                      <h3>Sin producto seleccionado</h3>
                      <p>Elegí un producto para ver su composición.</p>
                    </div>
                  ) : (
                    <>
                      <div className="lp-preview-hero">
                        <label className="lp-preview-image lp-preview-image-upload">
                        {imagenProductoSeleccionado ? (
                            <img src={imagenProductoSeleccionado} alt={productoSeleccionado.nombre} />
                        ) : (
                            <Package size={48} />
                        )}

                        <span className="lp-image-overlay">
                            {subiendoImagen
                            ? "Subiendo..."
                            : imagenProductoSeleccionado
                            ? "Cambiar imagen"
                            : "Agregar imagen"}
                        </span>

                        <input
                            type="file"
                            accept="image/*"
                            onChange={cambiarImagenProducto}
                            disabled={subiendoImagen}
                        />
                        </label>

                        <div className="lp-preview-info">
                          <h3>{productoSeleccionado.nombre}</h3>

                          <strong>{formatearMoneda(precioFinalSeleccionado)}</strong>

                          <div className="lp-price-chips">
                            {composicionPrecioSeleccionado.map((chip, index) => (
                              <span key={`${chip}-${index}`} className="lp-price-chip">
                                {chip}
                              </span>
                            ))}
                          </div>
                          
                        </div>
                      </div>

                      {variantesProductoSeleccionado.length > 1 && (
                        <div className="lp-preview-section">
                          <h4>Variantes</h4>

                          <div className="lp-mini-table">
                            {variantesProductoSeleccionado.map((variante, index) => (
                              <button
                                key={variante.id || index}
                                type="button"
                                className={`lp-mini-row lp-adicional-row ${
                                  varianteSeleccionadaIndex === index ? "activo" : ""
                                }`}
                                onClick={() => {
                                  setVarianteSeleccionadaIndex(index);
                                  setReglaSeleccionadaIndex(null);
                                  setAdicionalesSimulados([]);
                                }}
                              >
                                <span className="lp-check-circle" />
                                <span>{variante.nombre || "General"}</span>
                                <strong>
                                  {formatearMoneda(
                                    varianteSeleccionadaIndex === index
                                      ? precioFinalSeleccionado
                                      : variante.precioBase || 0
                                  )}
                                </strong>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="lp-preview-actions">



                      </div>

                      <div className="lp-preview-section">
                        <h4>Reglas por cantidad</h4>

                        {(varianteSeleccionada?.reglasCantidad || []).length === 0 ? (
                            <p className="lp-empty">Sin reglas por cantidad.</p>
                        ) : (
                            <div className="lp-mini-table">
                            {(varianteSeleccionada?.reglasCantidad || []).map((regla, index) => {
                                const activo = reglaSeleccionadaIndex === index;

                                return (
                                <button
                                    type="button"
                                    className={`lp-mini-row lp-adicional-row ${activo ? "activo" : ""}`}
                                    key={index}
                                    onClick={() =>
                                    setReglaSeleccionadaIndex((prev) =>
                                        prev === index ? null : index
                                    )
                                    }
                                >
                                    <span className="lp-check-circle" />

                                    <span>
                                    {regla.desde || 0} a {regla.hasta || "sin límite"}
                                    </span>

                                    <strong>{formatearMoneda(regla.precio)}</strong>
                                </button>
                                );
                            })}
                            </div>
                        )}
                        </div>

                      <div className="lp-preview-section">
                        <h4>Adicionales</h4>

                        {(varianteSeleccionada?.adicionales || []).length === 0 ? (
                          <p className="lp-empty">Sin adicionales cargados.</p>
                        ) : (
                          <div className="lp-mini-table">
                            {(varianteSeleccionada?.adicionales || []).map((adicional, index) => {
                              const id = adicional.id || `adicional-${index}`;
                              const activo = adicionalesSimulados.includes(id);

                              return (
                                <button
                                  type="button"
                                  className={`lp-mini-row lp-adicional-row ${
                                    activo ? "activo" : ""
                                  }`}
                                  key={id}
                                  onClick={() => toggleAdicionalSimulado(id)}
                                >
                                    <span className="lp-check-circle" />

                                  <span>
                                    {adicional.nombre} ·{" "}
                                    {adicional.tipoCalculo === "por_pedido"
                                      ? "por pedido"
                                      : "por unidad"}
                                  </span>

                                  <strong>{formatearMoneda(adicional.precio)}</strong>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="lp-precio-final-card">
                        <span>Precio final</span>
                        <strong>{formatearMoneda(precioFinalSeleccionado)}</strong>
                      </div>

                    </>
                  )}
                </div>
              </div>

            </>
          )}
        </section>
      </div>

      {modalLista && (
        <div className="lp-modal-backdrop">
          <div className="lp-modal">
            <h2>{listaEditando ? "Editar lista" : "Nueva lista"}</h2>

            <label>Nombre</label>
            <input
              value={formLista.nombre}
              onChange={(e) =>
                setFormLista((prev) => ({
                  ...prev,
                  nombre: e.target.value,
                }))
              }
              placeholder="Ej: Minorista"
            />

            <label>Descripción</label>
            <textarea
              value={formLista.descripcion}
              onChange={(e) =>
                setFormLista((prev) => ({
                  ...prev,
                  descripcion: e.target.value,
                }))
              }
              placeholder="Opcional"
            />

            <div className="lp-modal-actions">
              <button
                className="lp-btn-secundario"
                onClick={() => setModalLista(false)}
              >
                Cancelar
              </button>
              <button className="lp-btn-principal" onClick={guardarLista}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalProducto && (
        <div className="lp-modal-backdrop">
          <div className="lp-modal lp-modal-grande">
            <div className="lp-modal-head">
              <button
                className="lp-icon-btn"
                onClick={() => setModalProducto(false)}
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h2>
                  {productoEditandoIndex !== null
                    ? "Editar producto"
                    : "Agregar producto"}
                </h2>
                <p>Configurá precio base, reglas y adicionales.</p>
              </div>
            </div>

            <div className="lp-form-grid">
              <div>
                <label>Producto personalizado</label>
                <select
                  value={formProducto.productoBaseId ?? ""}
                  onChange={(e) => seleccionarProductoBase(e.target.value)}
                >
                  <option value="">Seleccionar producto...</option>
                    {productosBase.map((p) => {
                      const yaExiste = productoYaExisteEnLista(p.firebaseId);

                      return (
                        <option
                          key={p.firebaseId}
                          value={p.firebaseId}
                          disabled={yaExiste}
                        >
                          {p.nombre}
                          {yaExiste ? " — ya agregado" : ""}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label>Nombre visible</label>
                <input
                  value={formProducto.nombre ?? ""}
                  onChange={(e) =>
                    setFormProducto((prev) => ({
                      ...prev,
                      nombre: e.target.value,
                    }))
                  }
                  placeholder="Ej: Camiseta"
                />
              </div>


            </div>

            <div className="lp-section-title">
              <div>
                <h3>Variantes</h3>
                <p>Creá precios separados por talle. (ej. Talle especial, Niños.)</p>
              </div>

              <button type="button" onClick={agregarVariante}>
                <Plus size={16} />
                Variante
              </button>
            </div>

            <div className="lp-variantes-editor">
              {normalizarVariantesProducto(formProducto).map((variante, index) => (
                <button
                  key={variante.id || index}
                  type="button"
                  className={`lp-variante-chip ${
                    varianteEditandoIndex === index ? "activo" : ""
                  }`}
                  onClick={() => setVarianteEditandoIndex(index)}
                >
                  {variante.nombre || "General"}
                </button>
              ))}
            </div>

              <div className="lp-variante-linea">
                <div className="lp-variante-campo nombre">
                  <label>Nombre de variante</label>
                  <input
                    value={
                      normalizarVariantesProducto(formProducto)[varianteEditandoIndex]
                        ?.nombre ?? ""
                    }
                    onChange={(e) =>
                      actualizarVariante(varianteEditandoIndex, "nombre", e.target.value)
                    }
                    placeholder="Ej: Adulto"
                  />
                </div>

                <div className="lp-variante-campo precio">
                  <label>Precio base</label>
                  <input
                    type="number"
                    value={
                      normalizarVariantesProducto(formProducto)[varianteEditandoIndex]
                        ?.precioBase ?? ""
                    }
                    onChange={(e) =>
                      actualizarVariante(varianteEditandoIndex, "precioBase", e.target.value)
                    }
                    placeholder="0"
                  />
                </div>

                <div className="lp-variante-campo talles">
                  <label>Talles asociados</label>

                  {varianteEditandoIndex === 0 ? (
                    <span className="lp-talles-ayuda">
                      General aplica a talles no asignados.
                    </span>
                  ) : tallesDisponiblesForm.length === 0 ? (
                    <span className="lp-talles-ayuda">Sin talles configurados.</span>
                  ) : (
                    <details className="lp-talles-dropdown">
                      <summary>
                        Seleccionar talles
                        <span>
                          {(
                            normalizarVariantesProducto(formProducto)[varianteEditandoIndex]
                              ?.talles || []
                          ).length} seleccionados
                        </span>
                      </summary>

                      <div className="lp-talles-dropdown-list">
                        {tallesDisponiblesForm.map((talle) => {
                          const tallesVariante =
                            normalizarVariantesProducto(formProducto)[varianteEditandoIndex]
                              ?.talles || [];

                          const activo = tallesVariante.includes(talle);

                          return (
                            <label key={talle} className="lp-talle-dropdown-item">
                              <input
                                type="checkbox"
                                checked={activo}
                                onChange={() =>
                                  toggleTalleVariante(varianteEditandoIndex, talle)
                                }
                              />
                              <span>{talle}</span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>

                <div className="lp-variante-campo accion">
                  <label>Acción</label>
                  <button
                    type="button"
                    className="lp-icon-danger"
                    onClick={() => quitarVariante(varianteEditandoIndex)}
                    disabled={
                      varianteEditandoIndex === 0 ||
                      normalizarVariantesProducto(formProducto)[varianteEditandoIndex]?.id === "general" ||
                      normalizarVariantesProducto(formProducto).length <= 1
}
                    title="Quitar variante"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>

            <div className="lp-section-title">
              <div>
                <h3>Reglas por cantidad</h3>
                <p>Definí precios especiales según cantidad.</p>
              </div>
              <button type="button" onClick={agregarReglaCantidad}>
                <Plus size={16} />
                Regla
              </button>
            </div>

            {(
                normalizarVariantesProducto(formProducto)[varianteEditandoIndex]
                  ?.reglasCantidad || []
              ).map((regla, index) => (
              <div className="lp-grid-4" key={index}>
                <input
                  type="number"
                  placeholder="Desde"
                  value={regla.desde ?? ""}
                  onChange={(e) => actualizarRegla(index, "desde", e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Hasta"
                  value={regla.hasta ?? ""}
                  onChange={(e) => actualizarRegla(index, "hasta", e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={regla.precio ?? ""}
                  onChange={(e) => actualizarRegla(index, "precio", e.target.value)}
                />
                <button type="button" onClick={() => quitarRegla(index)}>
                  Quitar
                </button>
              </div>
            ))}

            <div className="lp-section-title">
              <div>
                <h3>Adicionales</h3>
                <p>Agregá cargos por unidad.</p>
              </div>
              <button type="button" onClick={agregarAdicional}>
                <Plus size={16} />
                Adicional
              </button>
            </div>

            {(
              normalizarVariantesProducto(formProducto)[varianteEditandoIndex]
                ?.adicionales || []
            ).map((adicional, index) => (
              <div className="lp-grid-4" key={adicional.id || index}>
                <input
                  placeholder="Nombre"
                  value={adicional.nombre ?? ""}
                  onChange={(e) =>
                    actualizarAdicional(index, "nombre", e.target.value)
                  }
                />
                <select
                  value={adicional.tipoCalculo ?? "por_unidad"}
                  onChange={(e) =>
                    actualizarAdicional(index, "tipoCalculo", e.target.value)
                  }
                >
                  <option value="por_unidad">Por unidad</option>
                  <option value="por_pedido">Por pedido</option>
                </select>
                <input
                  type="number"
                  placeholder="Precio"
                  value={adicional.precio ?? ""}
                  onChange={(e) =>
                    actualizarAdicional(index, "precio", e.target.value)
                  }
                />
                <button type="button" onClick={() => quitarAdicional(index)}>
                  Quitar
                </button>
              </div>
            ))}

            <div className="lp-modal-actions">
              <button
                className="lp-btn-secundario"
                onClick={() => setModalProducto(false)}
              >
                Cancelar
              </button>
              <button className="lp-btn-principal" onClick={guardarProductoEnLista}>
                Guardar producto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}