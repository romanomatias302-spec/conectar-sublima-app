import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import ProductoFormModal from "./ProductoFormModal";
import ActionMenu from "../../comunes/componentes/ActionMenu";
import "./PedidoDetalle.css";
import { puedeHacer } from "../../utils/permisos";
import {
  getColumnasDetallePedidoDefault,
  normalizarColumnasDetallePedido,
} from "../../utils/detallePedidoColumnas";
import ColumnasDetallePedidoModal from "./ColumnasDetallePedidoModal";
import {
collection,
getDocs,
deleteDoc,
doc,
setDoc,
onSnapshot,
query,
where,
limit,
} from "firebase/firestore";


const FORMATOS_IMPRESION = {
  a4: {
    label: "A4",
    tipo: "a4",
    ancho: 210,
    alto: 297,
  },

  ticket58: {
    label: "Ticket 58 × 100 mm",
    tipo: "ticket",
    ancho: 58,
    alto: 100,
  },

  ticket80: {
    label: "Ticket 80 × 100 mm",
    tipo: "ticket",
    ancho: 80,
    alto: 100,
  },

  ticket100: {
    label: "Ticket 100 × 100 mm",
    tipo: "ticket",
    ancho: 100,
    alto: 100,
  },

  personalizado: {
    label: "Formato personalizado",
    tipo: "ticket",
    ancho: 100,
    alto: 100,
  },
};


export default function PedidoDetalle({
  pedido,
  onVolver,
  perfil,
  onVerVenta,
  onCrearVentaDesdePedido,
}) {
  const [productos, setProductos] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [soloVer, setSoloVer] = useState(false);
  const [columnasDetalle, setColumnasDetalle] = useState(getColumnasDetallePedidoDefault());
  const [mostrarConfigColumnas, setMostrarConfigColumnas] = useState(false);
  const [esMobile, setEsMobile] = useState(window.innerWidth <= 768);
  const [productosAbiertos, setProductosAbiertos] = useState({});
  const [abriendoVentaId, setAbriendoVentaId] = useState(null);
  const [imagenPreviewTabla, setImagenPreviewTabla] = useState(null);
  const [clienteDetalle, setClienteDetalle] = useState(null);
const [mostrandoClienteDetalle, setMostrandoClienteDetalle] = useState(false);
const [mostrarModalImpresion, setMostrarModalImpresion] = useState(false);
const [formatoImpresion, setFormatoImpresion] = useState("a4");
const [anchoPersonalizado, setAnchoPersonalizado] = useState(100);
const [altoPersonalizado, setAltoPersonalizado] = useState(100);
const [errorImpresion, setErrorImpresion] = useState("");


  const esAdmin = perfil?.rol === "admin" || perfil?.rol === "superadmin";
  const puedeEditarPedidos = puedeHacer(perfil, "pedidos", "editar");

  // 🔹 Cargar productos del pedido
  const cargarProductos = async () => {
    if (!pedido?.firebaseId) return;

    const snapshot = await getDocs(
      collection(db, `pedidos/${pedido.firebaseId}/productos`)
    );

    const lista = snapshot.docs.map((docu) => ({
      id: docu.id,
      ...docu.data(),
    }));

    setProductos(lista);
  };

useEffect(() => {
  cargarProductos();
}, [pedido]);

useEffect(() => {
  if (!perfil?.clienteId) return;

  const ref = doc(
    db,
    `clientes-saas/${perfil.clienteId}/configuracion`,
    "pedidos_detalle"
  );

  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();

        if (data?.columnas) {
          setColumnasDetalle(
            normalizarColumnasDetallePedido(data.columnas)
          );
        } else {
          setColumnasDetalle(getColumnasDetallePedidoDefault());
        }
      } else {
        setColumnasDetalle(getColumnasDetallePedidoDefault());
      }
    },
    (error) => {
      console.error("Error escuchando columnas detalle:", error);
    }
  );

  return () => unsubscribe();
}, [perfil?.clienteId]);

useEffect(() => {
  const controlarMobile = () => {
    setEsMobile(window.innerWidth <= 768);
  };

  controlarMobile();
  window.addEventListener("resize", controlarMobile);

  return () => {
    window.removeEventListener("resize", controlarMobile);
  };
}, []);

useEffect(() => {
  const tituloOriginal = document.title;

  const limpiarImpresion = () => {
    document.title = tituloOriginal;

    document.body.classList.remove(
      "printing-pedido-a4",
      "printing-pedido-ticket"
    );

    document
      .getElementById("zalfro-pedido-print-size")
      ?.remove();
  };

  window.addEventListener("afterprint", limpiarImpresion);

  return () => {
    window.removeEventListener("afterprint", limpiarImpresion);
    limpiarImpresion();
  };
}, []);

  // 👁️ Ver producto
  const manejarVerProducto = (producto) => {
    setProductoEditando(producto);
    setSoloVer(true);
    setMostrarModal(true);
  };

  // ✏️ Editar producto
  const manejarEditarProducto = (producto) => {
    if (!puedeEditarPedidos) return;

    setProductoEditando(producto);
    setSoloVer(false);
    setMostrarModal(true);
  };

  // 🗑️ Eliminar producto
  const manejarEliminarProducto = async (id) => {
    if (!puedeEditarPedidos) return;

    if (window.confirm("¿Seguro que querés eliminar este producto?")) {
      await deleteDoc(doc(db, `pedidos/${pedido.firebaseId}/productos`, id));
      cargarProductos();
    }
  };

  // ➕ Nuevo producto
  const abrirModal = () => {
    if (!puedeEditarPedidos) return;

    setProductoEditando(null);
    setSoloVer(false);
    setMostrarModal(true);
  };

const obtenerZonasUsadas = (producto) => {
  const zonas = producto?.zonas || {};

  return Object.entries(zonas)
    .filter(([, valor]) => String(valor || "").trim() !== "")
    .map(([codigo, valor]) => ({
      codigo,
      valor: String(valor).trim(),
    }));
};

const resumirZonas = (producto) => {
  const usadas = obtenerZonasUsadas(producto);

  return usadas.length
    ? usadas.map((zona) => `${zona.codigo}: ${zona.valor}`).join(" | ")
    : "-";
};

const resumirTalles = (producto) => {
  const talles = producto?.talles || {};
  const detallePorTalle = producto?.detallePorTalle || {};

  const ordenTalles = Array.isArray(producto?.ordenTalles)
    ? producto.ordenTalles
    : [];

  const indiceOrden = new Map(
    ordenTalles.map((talle, index) => [talle, index])
  );

  const usados = Object.entries(talles)
    .filter(([talle, cantidad]) => {
      const qty = Number(cantidad) || 0;
      const detalle = String(detallePorTalle[talle] || "").trim();

      return qty > 0 || detalle !== "";
    })
    .map(([talle, cantidad]) => {
      const qty = Number(cantidad) || 0;
      const detalle = String(detallePorTalle[talle] || "").trim();

      return {
        talle,
        qty,
        detalle,
      };
    })
    .sort((a, b) => {
      const indiceA = indiceOrden.has(a.talle)
        ? indiceOrden.get(a.talle)
        : Number.MAX_SAFE_INTEGER;

      const indiceB = indiceOrden.has(b.talle)
        ? indiceOrden.get(b.talle)
        : Number.MAX_SAFE_INTEGER;

      if (indiceA !== indiceB) {
        return indiceA - indiceB;
      }

      return 0;
    });

  return usados;
};

  const manejarCrearVentaDesdePedido = () => {
  if (!pedido?.firebaseId) return;

  if (!productos.length) {
    alert("Este pedido no tiene productos cargados para facturar.");
    return;
  }

  if (onCrearVentaDesdePedido) {
    onCrearVentaDesdePedido(pedido, productos);
  }
};

  const obtenerImagenPortada = (producto) => {
    const imagenes = producto?.imagenes || [];

    const portada = imagenes.find((img) => {
      if (typeof img === "string") return false;
      return img?.tipo === "storage" && img?.portada === true && String(img?.url || "").trim() !== "";
    });

    return portada?.url || "";
  };

  const toggleProducto = (id) => {
  setProductosAbiertos((prev) => ({
    ...prev,
    [id]: !prev[id],
  }));
};

  const obtenerObservaciones = (producto) => {
    const atributos = producto?.atributosExtra || {};
    return (
      atributos.Observaciones ||
      atributos.observaciones ||
      producto?.observaciones ||
      "-"
    );
  };

   const resumirDetallesCostura = (producto) => {
    const detalles = producto?.detallesCostura || {};

    const usados = Object.entries(detalles)
      .filter(([, valor]) => String(valor || "").trim() !== "")
      .map(([nombre, valor]) => ({
        nombre,
        valor,
      }));

    return usados.length ? usados : [];
  };

  const abrirDetalleCliente = async () => {
  try {
    if (!pedido?.cliente || !perfil?.clienteId) return;

    const clientesRef = collection(db, "clientes");

    let q;

    if (pedido?.clienteDNI) {
      q = query(
        clientesRef,
        where("clienteId", "==", perfil.clienteId),
        where("dni", "==", String(pedido.clienteDNI)),
        limit(1)
      );
    } else {
      q = query(
        clientesRef,
        where("clienteId", "==", perfil.clienteId),
        where("nombre", "==", pedido.cliente),
        limit(1)
      );
    }

    const snap = await getDocs(q);

    if (!snap.empty) {
      const d = snap.docs[0];
      setClienteDetalle({
        firebaseId: d.id,
        ...d.data(),
      });
    } else {
      setClienteDetalle({
        nombre: pedido.cliente || "-",
        dni: pedido.clienteDNI || "",
      });
    }

    setMostrandoClienteDetalle(true);
  } catch (error) {
    console.error("Error cargando cliente:", error);
    setClienteDetalle({
      nombre: pedido.cliente || "-",
      dni: pedido.clienteDNI || "",
    });
    setMostrandoClienteDetalle(true);
  }
};

  const renderCeldaProducto = (producto, columnaKey) => {
    switch (columnaKey) {
      case "producto":
        return producto.productoNombre || producto.producto || "-";

      case "color":
        return producto.color || "-";

case "detalle": {
  const detalle = producto?.detalle || "-";

  return (
    <div
      className="celda-texto-controlado"
      title={detalle !== "-" ? detalle : ""}
    >
      {detalle}
    </div>
  );
}

case "observaciones": {
  const observaciones = obtenerObservaciones(producto);

  return (
    <div
      className="celda-texto-controlado"
      title={observaciones !== "-" ? observaciones : ""}
    >
      {observaciones}
    </div>
  );
}

case "zonasResumen": {
  const zonas = resumirZonas(producto);

  return (
    <div
      className="celda-texto-controlado"
      title={zonas !== "-" ? zonas : ""}
    >
      {zonas}
    </div>
  );
}

case "tallesResumen": {
  const talles = resumirTalles(producto);

  if (!talles.length) return "-";



  return (
    <div className="detalle-talles-resumen">
      {talles.map((item, index) => (
        <React.Fragment key={`${item.talle}-${index}`}>
          <span className="detalle-talle-chip">
            <span className="detalle-talle-nombre">{item.talle}</span>
            <span className="detalle-talle-sep">·</span>
            <span className="detalle-talle-cantidad">
              {item.qty} <span className="detalle-talle-unit">uni.</span>
            </span>
            {item.detalle ? (
              <>
                <span className="detalle-talle-sep">·</span>
                <span className="detalle-talle-detalle">{item.detalle}</span>
              </>
            ) : null}
          </span>


        </React.Fragment>
      ))}
    </div>
  );
}

      case "detallesCosturaResumen": {
        const detalles = resumirDetallesCostura(producto);

        if (!detalles.length) return "-";

        return (
          <div className="detalle-costura-resumen">
            {detalles.map((item, index) => (
              <div key={`${item.nombre}-${index}`} className="detalle-costura-item">
                <span className="detalle-costura-nombre">{item.nombre}:</span>
                <span className="detalle-costura-valor">{item.valor}</span>
              </div>
            ))}
          </div>
        );
      }

      case "imagenesResumen": {
        const portadaUrl = obtenerImagenPortada(producto);

        if (!portadaUrl) return "-";

          return (
            <div className="detalle-imagen-portada-wrap">
              <img
                src={portadaUrl}
                alt="Portada"
                className="detalle-imagen-portada-thumb"
                onMouseEnter={(e) =>
                  setImagenPreviewTabla({
                    url: portadaUrl,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseMove={(e) =>
                  setImagenPreviewTabla({
                    url: portadaUrl,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
                onMouseLeave={() => setImagenPreviewTabla(null)}
              />
            </div>
          );
      }

      case "cantidad":
        return producto.totalTalles || producto.cantidad || "-";

      case "acciones":
        return (
          <ActionMenu
            onVer={() => manejarVerProducto(producto)}
            onEditar={puedeEditarPedidos ? () => manejarEditarProducto(producto) : undefined}
            onEliminar={puedeEditarPedidos ? () => manejarEliminarProducto(producto.id) : undefined}
          />
        );

      default:
        return "-";
    }
  };

  const columnasVisibles = columnasDetalle.filter((col) => col.visible);

const columnasImprimiblesBase = columnasVisibles.filter(
  (col) => col.key !== "acciones" && col.key !== "imagenesResumen"
);

const columnaTieneContenido = (columnaKey) => {
  // Estas columnas deben permanecer aunque algún pedido puntual no tenga datos.
  if (columnaKey === "producto" || columnaKey === "cantidad") {
    return true;
  }

  return productos.some((producto) => {
    switch (columnaKey) {
      case "color":
        return String(producto?.color || "").trim() !== "";

      case "detalle":
        return String(producto?.detalle || "").trim() !== "";

      case "observaciones": {
        const observaciones = obtenerObservaciones(producto);
        return String(observaciones || "").trim() !== "" && observaciones !== "-";
      }

      case "zonasResumen": {
        const zonas = resumirZonas(producto);
        return String(zonas || "").trim() !== "" && zonas !== "-";
      }

      case "tallesResumen":
        return resumirTalles(producto).length > 0;

      case "detallesCosturaResumen":
        return resumirDetallesCostura(producto).length > 0;

      default:
        return true;
    }
  });
};

const columnasImprimibles =
  productos.length === 0
    ? columnasImprimiblesBase
    : columnasImprimiblesBase.filter((col) =>
        columnaTieneContenido(col.key)
      );

      const obtenerTextoColumnaImpresion = (producto, columnaKey) => {
  switch (columnaKey) {
    case "producto":
      return String(
        producto?.productoNombre ||
        producto?.producto ||
        ""
      );

    case "color":
      return String(producto?.color || "");

    case "detalle":
      return String(producto?.detalle || "");

    case "observaciones": {
      const valor = obtenerObservaciones(producto);
      return valor === "-" ? "" : String(valor || "");
    }

    case "zonasResumen": {
      const valor = resumirZonas(producto);
      return valor === "-" ? "" : String(valor || "");
    }

    case "tallesResumen":
      return resumirTalles(producto)
        .map((t) => `${t.talle} ${t.qty} ${t.detalle || ""}`)
        .join(" ");

    case "detallesCosturaResumen":
      return resumirDetallesCostura(producto)
        .map((d) => `${d.nombre} ${d.valor}`)
        .join(" ");

    case "cantidad":
      return String(
        producto?.totalTalles ||
        producto?.cantidad ||
        ""
      );

    default:
      return "";
  }
};

const limitesColumnasImpresion = {
  producto: {
    minimo: 11,
    maximo: 18,
    base: 12,
  },

  color: {
    minimo: 6,
    maximo: 9,
    base: 6,
  },

  detalle: {
    minimo: 10,
    maximo: 24,
    base: 12,
  },

  observaciones: {
    minimo: 11,
    maximo: 24,
    base: 13,
  },

  zonasResumen: {
    minimo: 9,
    maximo: 18,
    base: 11,
  },

  tallesResumen: {
    minimo: 16,
    maximo: 34,
    base: 20,
  },

  detallesCosturaResumen: {
    minimo: 11,
    maximo: 23,
    base: 14,
  },

cantidad: {
  minimo: 10,
  maximo: 11,
  base: 10,
},
};

const calcularPesoColumnaImpresion = (columnaKey) => {
  const limites =
    limitesColumnasImpresion[columnaKey] || {
      minimo: 9,
      maximo: 20,
      base: 11,
    };

  if (columnaKey === "cantidad") {
    return limites.base;
  }

  const longitudes = productos.map((producto) => {
    const texto = obtenerTextoColumnaImpresion(
      producto,
      columnaKey
    );

    return texto.trim().length;
  });

  const longitudMaxima = longitudes.length
    ? Math.max(...longitudes)
    : 0;

  const promedio = longitudes.length
    ? longitudes.reduce((total, valor) => total + valor, 0) /
      longitudes.length
    : 0;

  /*
   * Usamos logaritmo para que un texto enorme aumente el ancho,
   * pero no se quede con toda la hoja.
   */
  const intensidadContenido =
    Math.log2(1 + promedio) * 1.4 +
    Math.log2(1 + longitudMaxima) * 0.8;

  const pesoCalculado =
    limites.base + intensidadContenido;

  return Math.min(
    limites.maximo,
    Math.max(limites.minimo, pesoCalculado)
  );
};

const anchoPortadaImpresion = 10;

const pesosColumnasImpresion =
  columnasImprimibles.map((col) => ({
    key: col.key,
    peso: calcularPesoColumnaImpresion(col.key),
  }));

const pesoTotalColumnas = pesosColumnasImpresion.reduce(
  (total, columna) => total + columna.peso,
  0
);

const espacioDisponibleColumnas =
  100 - anchoPortadaImpresion;

const anchosColumnasImpresion =
  pesosColumnasImpresion.reduce(
    (resultado, columna) => {
      resultado[columna.key] =
        pesoTotalColumnas > 0
          ? (columna.peso / pesoTotalColumnas) *
            espacioDisponibleColumnas
          : espacioDisponibleColumnas /
            Math.max(columnasImprimibles.length, 1);

      return resultado;
    },
    {}
  );

const obtenerCantidadProducto = (producto) => {
  const totalTalles = Number(producto?.totalTalles) || 0;
  const cantidad = Number(producto?.cantidad) || 0;

  return totalTalles > 0 ? totalTalles : cantidad;
};

const cantidadTotalPedido = productos.reduce(
  (total, producto) => total + obtenerCantidadProducto(producto),
  0
);

const obtenerNombreProducto = (producto) =>
  String(
    producto?.productoNombre ||
      producto?.producto ||
      "Producto"
  ).trim();

const obtenerLimiteLineasTicket = (anchoMm, altoMm) => {
  const ancho = Number(anchoMm) || 100;
  const alto = Number(altoMm) || 100;

  /*
   * Espacio reservado para:
   * pedido, cliente, entrega, separadores y cantidad total.
   */
  const altoUtil = Math.max(alto - 40, 20);

  let altoPorLinea = 5.8;
  let limiteMaximo = 16;

  if (ancho <= 60) {
    altoPorLinea = 5.9;
    limiteMaximo = 10;
  } else if (ancho <= 80) {
    altoPorLinea = 5.8;
    limiteMaximo = 12;
  }

  const lineasPorAlto = Math.floor(
    altoUtil / altoPorLinea
  );

  return Math.max(
    3,
    Math.min(lineasPorAlto, limiteMaximo)
  );
};

const estimarLineasProductoTicket = (producto, anchoMm) => {
  const nombre = obtenerNombreProducto(producto);

  let caracteresPorLinea = 30;

  if (Number(anchoMm) <= 60) {
    caracteresPorLinea = 18;
  } else if (Number(anchoMm) <= 80) {
    caracteresPorLinea = 24;
  }

  return Math.max(
    1,
    Math.ceil(nombre.length / caracteresPorLinea)
  );
};

const obtenerProductosTicket = (anchoMm, altoMm) => {
  const limiteLineas = obtenerLimiteLineasTicket(
    anchoMm,
    altoMm
  );

  const visibles = [];
  let lineasOcupadas = 0;

  for (const producto of productos) {
    const lineasProducto = estimarLineasProductoTicket(
      producto,
      anchoMm
    );

    if (
      visibles.length > 0 &&
      lineasOcupadas + lineasProducto > limiteLineas
    ) {
      break;
    }

    visibles.push(producto);
    lineasOcupadas += lineasProducto;
  }

  return {
    visibles,
    restantes: Math.max(
      productos.length - visibles.length,
      0
    ),
  };
};

const formatoSeleccionado =
  FORMATOS_IMPRESION[formatoImpresion] ||
  FORMATOS_IMPRESION.a4;

const medidasTicket =
  formatoImpresion === "personalizado"
    ? {
        ancho: Number(anchoPersonalizado),
        alto: Number(altoPersonalizado),
      }
    : {
        ancho: formatoSeleccionado.ancho,
        alto: formatoSeleccionado.alto,
      };

const resumenProductosTicket = obtenerProductosTicket(
  medidasTicket.ancho,
  medidasTicket.alto
);

const abrirSelectorImpresion = () => {
  setFormatoImpresion("a4");
  setErrorImpresion("");
  setMostrarModalImpresion(true);
};

const cerrarSelectorImpresion = () => {
  setMostrarModalImpresion(false);
  setErrorImpresion("");
};

const confirmarImpresion = () => {
  const cliente =
    pedido?.cliente
      ?.replace(/[\\/:*?"<>|]/g, "")
      ?.trim() || "Cliente";

  const numeroPedido =
    pedido?.id ||
    pedido?.numeroPedido ||
    pedido?.visibleId ||
    "Pedido";

  document.body.classList.remove(
    "printing-pedido-a4",
    "printing-pedido-ticket"
  );

  document
    .getElementById("zalfro-pedido-print-size")
    ?.remove();

  if (formatoImpresion === "a4") {
    document.title = `Pedido ${numeroPedido} - ${cliente}`;
    document.body.classList.add("printing-pedido-a4");

    setMostrarModalImpresion(false);

    requestAnimationFrame(() => {
      window.print();
    });

    return;
  }

  const ancho = Number(medidasTicket.ancho);
  const alto = Number(medidasTicket.alto);

  if (!Number.isFinite(ancho) || ancho < 40 || ancho > 300) {
    setErrorImpresion(
      "El ancho debe estar entre 40 y 300 mm."
    );
    return;
  }

  if (!Number.isFinite(alto) || alto < 40 || alto > 1000) {
    setErrorImpresion(
      "El alto debe estar entre 40 y 1000 mm."
    );
    return;
  }

  const printStyle = document.createElement("style");

  printStyle.id = "zalfro-pedido-print-size";
  printStyle.innerHTML = `
    @media print {
      @page {
        size: ${ancho}mm ${alto}mm;
        margin: 3mm;
      }
    }
  `;

  document.head.appendChild(printStyle);

  document.title = `Ticket Pedido ${numeroPedido} - ${cliente}`;
  document.body.classList.add("printing-pedido-ticket");

  setMostrarModalImpresion(false);

  requestAnimationFrame(() => {
    window.print();
  });
}; 

if (!pedido) {
  return null;
}
  

  return (
      <div className="pedido-detalle">
    <h1>
      Pedido #{pedido?.id || pedido?.numeroPedido || pedido?.visibleId || "-"}
    </h1>


      {/* 🔹 Contenedor gris claro para datos del pedido */}
      {/* 🔹 Header del pedido (theme-aware) */}
<div className="pedido-header-bar">
  <div className="pedido-header-item">
    <span className="pedido-header-label">Cliente:</span>
        <button
      type="button"
      className="pedido-cliente-link"
      onClick={abrirDetalleCliente}
    >
      {pedido?.cliente || "-"}
    </button>
  </div>

  <div className="pedido-header-item">
    <span className="pedido-header-label">Estado:</span>
    <span
      className={`pedido-status-badge estado-${(pedido?.estado || "en-proceso")
        .toLowerCase()
        .replace(/\s+/g, "-")}`}
    >
      {pedido?.estado || "En proceso"}
    </span>
  </div>

  <div className="pedido-header-item">
    <span className="pedido-header-label">Fecha de Pedido:</span>
    <span className="pedido-header-value">{pedido?.fechaPedido || "-"}</span>
  </div>

  <div className="pedido-header-item">
    <span className="pedido-header-label">Fecha de Entrega:</span>
    <span className="pedido-header-value">{pedido?.fechaEntrega || "-"}</span>
  </div>
</div>


      {/* 🔹 Estado de factura asociada */}
      <div
        style={{
          marginTop: "16px",
          marginBottom: "16px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
{!pedido?.ventaRefId && (
  <>
    <div
      style={{
        background: "rgba(220, 53, 69, 0.10)",
        color: "#b02a37",
        padding: "10px 14px",
        borderRadius: "10px",
        fontWeight: 600,
      }}
    >
      Este pedido no tiene factura asociada
    </div>

    <button
      type="button"
      onClick={manejarCrearVentaDesdePedido}
      style={{
        background: "#0d6efd",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "10px",
        fontWeight: 700,
        border: "none",
        cursor: "pointer",
      }}
    >
      Crear / asociar factura
    </button>
  </>
)}

        {pedido?.ventaRefId && (pedido?.ventaEstado || "activa") === "activa" && (
          <button
            type="button"
            disabled={abriendoVentaId === pedido.ventaRefId}
            onClick={async () => {
              if (!onVerVenta || !pedido.ventaRefId) return;

              try {
                setAbriendoVentaId(pedido.ventaRefId);
                await onVerVenta(pedido.ventaRefId);
              } finally {
                setAbriendoVentaId(null);
              }
            }}
            style={{
              background: "rgba(25, 135, 84, 0.10)",
              color: "#146c43",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 700,
              border: "none",
              cursor: abriendoVentaId === pedido.ventaRefId ? "wait" : "pointer",
              opacity: abriendoVentaId === pedido.ventaRefId ? 0.7 : 1,
            }}
          >
            {abriendoVentaId === pedido.ventaRefId
              ? "Abriendo..."
              : `Ver factura #${pedido?.ventaVisibleId || "-"}`}
          </button>
        )}

        {pedido?.ventaRefId && pedido?.ventaEstado === "anulada" && (
          <button
            type="button"
            onClick={() => onVerVenta && onVerVenta(pedido.ventaRefId)}
            style={{
              background: "rgba(108, 117, 125, 0.14)",
              color: "#495057",
              padding: "10px 14px",
              borderRadius: "10px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Ver factura anulada #{pedido?.ventaVisibleId || "-"}
          </button>
        )}
      </div>

      {/* 🔹 Área exclusiva para impresión */}
      <div className="pedido-print-area">
        <section className="pedido-print-products">
          <h2 className="pedido-print-section-title">
            Productos del pedido
          </h2>

        <table className="pedido-print-table">
          <colgroup>
            <col
              className="pedido-print-col-portada"
              style={{ width: `${anchoPortadaImpresion}%` }}
            />

            {columnasImprimibles.map((col) => (
              <col
                key={col.key}
                className={`pedido-print-col-${col.key}`}
                style={{
                  width: `${anchosColumnasImpresion[col.key]}%`,
                }}
              />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="pedido-print-col-portada">
                Imagen
              </th>

              {columnasImprimibles.map((col) => (
                  <th
                    key={col.key}
                    className={`pedido-print-col-${col.key}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const tallesImpresion = resumirTalles(p);
                const costurasImpresion = resumirDetallesCostura(p);
                const portadaImpresion = obtenerImagenPortada(p);
                const zonasImpresion = obtenerZonasUsadas(p);

                return (
                  <tr key={p.id}>
                    <td className="pedido-print-col-portada">
                      {portadaImpresion ? (
                        <img
                          src={portadaImpresion}
                          alt=""
                          className="pedido-print-portada-img"
                        />
                      ) : (
                        <span className="pedido-print-sin-portada">-</span>
                      )}
                    </td>

                    {columnasImprimibles.map((col) => (
                      <td
                        key={col.key}
                        className={`pedido-print-col-${col.key}`}
                      >
                        {col.key === "producto" &&
                          (p.productoNombre || p.producto || "-")}

                        {col.key === "color" && (p.color || "-")}

                        {col.key === "detalle" && (p.detalle || "-")}

                        {col.key === "observaciones" &&
                          obtenerObservaciones(p)}

                        {col.key === "zonasResumen" &&
                          (zonasImpresion.length ? (
                            <div className="pedido-print-zonas-list">
                              {zonasImpresion.map((zona, index) => (
                                <div
                                  key={`${zona.codigo}-${index}`}
                                  className="pedido-print-zona-item"
                                >
                                  <strong className="pedido-print-zona-codigo">
                                    {zona.codigo}:
                                  </strong>{" "}
                                  <span className="pedido-print-zona-valor">
                                    {zona.valor}
                                  </span>

                                  {index < zonasImpresion.length - 1 ? (
                                    <span className="pedido-print-zona-separador">
                                      {" "}|
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "-"
                          ))}

                        {col.key === "tallesResumen" &&
                          (tallesImpresion.length ? (
                            <div
                              className={`pedido-print-talles-list ${
                                tallesImpresion.length > 10
                                  ? "pedido-print-talles-list-2cols"
                                  : ""
                              }`}
                            >
                              {tallesImpresion.map((t, index) => (
                                <div
                                key={`${t.talle}-${index}`}
                                className="pedido-print-talle-item"
                              >
                                <strong>{t.talle}:</strong>{" "}
                                <span className="pedido-print-talle-cantidad">
                                  ({t.qty} uni.)
                                </span>

                                {t.detalle ? (
                                  <span> — {t.detalle}</span>
                                ) : null}
                              </div>
                              ))}
                            </div>
                          ) : (
                            "-"
                          ))}

                        {col.key === "detallesCosturaResumen" &&
                          (costurasImpresion.length ? (
                            <div className="pedido-print-costura-list">
                              {costurasImpresion.map((d, index) => (
                                <div
                                  key={`${d.nombre}-${index}`}
                                  className="pedido-print-costura-item"
                                >
                                  <strong>{d.nombre}:</strong> {d.valor}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "-"
                          ))}

                        {col.key === "cantidad" &&
                          (p.totalTalles || p.cantidad || "-")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      {/* Área exclusiva para impresión ticket */}
        <div className="pedido-ticket-print-area">
          <div className="pedido-ticket-header">
            <div className="pedido-ticket-numero">
              Pedido #
              {pedido?.id ||
                pedido?.numeroPedido ||
                pedido?.visibleId ||
                "-"}
            </div>

            <div className="pedido-ticket-cliente">
              {pedido?.cliente || "Cliente sin nombre"}
            </div>

            <div className="pedido-ticket-entrega">
              Entrega: {pedido?.fechaEntrega || "-"}
            </div>
          </div>

          <div className="pedido-ticket-separador" />

          <div className="pedido-ticket-productos">
            {resumenProductosTicket.visibles.map((producto) => (
              <div
                key={producto.id}
                className="pedido-ticket-producto"
              >
                <span className="pedido-ticket-producto-nombre">
                  {obtenerNombreProducto(producto)}
                </span>

                <strong className="pedido-ticket-producto-cantidad">
                  {obtenerCantidadProducto(producto)} uni.
                </strong>
              </div>
            ))}

            {resumenProductosTicket.restantes > 0 ? (
              <div className="pedido-ticket-restantes">
                + {resumenProductosTicket.restantes}{" "}
                {resumenProductosTicket.restantes === 1
                  ? "producto más"
                  : "productos más"}
              </div>
            ) : null}
          </div>

          <div className="pedido-ticket-separador" />

          <div className="pedido-ticket-total">
            <span>Cantidad total</span>
            <strong>{cantidadTotalPedido} uni.</strong>
          </div>
        </div>

      {/* 🔹 Acciones principales */}
      <div className="acciones-detalle">
        {puedeEditarPedidos && (
          <button className="btn-nuevo" onClick={abrirModal}>
            + Agregar Producto
          </button>
        )}

        {esAdmin && (
          <button
            className="btn-config-columnas"
            onClick={() => setMostrarConfigColumnas(true)}
            type="button"
          >
            Configurar columnas
          </button>
        )}

        <button
          className="btn-imprimir-pedido"
          type="button"
          onClick={abrirSelectorImpresion}
        >
          Imprimir Detalle
        </button>

        <button className="btn-volver" onClick={onVolver}>
          Volver
        </button>
      </div>

        {esMobile && (
        <div className="productos-mobile-list">
          {productos.map((p) => {

            const abierto = productosAbiertos[p.id];
            const talles = resumirTalles(p);
            const portadaUrl = obtenerImagenPortada(p);
            const observaciones = obtenerObservaciones(p);

            return (
              <div
                key={p.id}
                className="producto-mobile-card"
              >

                <div
                  className="producto-mobile-header"
                  onClick={() => toggleProducto(p.id)}
                >

                  <div className="producto-mobile-header-left">
                    <strong>
                      {p.productoNombre || p.producto}
                    </strong>

                    <span>
                      {p.totalTalles || p.cantidad || 0} uni.
                    </span>
                  </div>

                  <div className="producto-mobile-arrow">
                    {abierto ? "⌃" : "⌄"}
                  </div>

                </div>

                {abierto && (

        <>
        {portadaUrl && (
        <img
        src={portadaUrl}
        alt=""
        className="producto-mobile-img"
        />
        )}

        {!!p.detalle && (
        <div className="producto-mobile-line">
        <small>Detalle:</small>
        <p>{p.detalle}</p>
        </div>
        )}

        {!!observaciones && observaciones !== "-" && (
        <div className="producto-mobile-line">
        <small>Obs:</small>
        <p>{observaciones}</p>
        </div>
        )}

        {!!talles.length && (
        <div className="producto-mobile-talles">

        {talles.map((t,index)=>(
        <span key={index}>
        {t.talle} · {t.qty}
        </span>
        ))}

        </div>
        )}

        <div
        className="producto-mobile-actions"
        onClick={(e)=>e.stopPropagation()}
        >

        <button onClick={()=>manejarVerProducto(p)}>
        Ver
        </button>

        {puedeEditarPedidos && (
        <button
        onClick={()=>manejarEditarProducto(p)}
        >
        Editar
        </button>
        )}

        </div>

        </>

        )}

              </div>
            );
          })}
        </div>
        )}

      
{!esMobile && (
  <>
    {/* 🔹 Tabla de productos */}
    <div className="tabla-productos-scroll">
    <table
      className="tabla-productos tabla-productos-desktop"
      style={{
        "--cantidad-columnas": columnasVisibles.length,
      }}
    >
        <thead>
          <tr>
            {columnasVisibles.map((col) => (
              <th
                key={col.key}
                className={[
                  "tabla-col",
                  `tabla-col-${col.key}`,
                ].join(" ")}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr
              key={p.id}
              className="fila-producto"
              onClick={() => manejarVerProducto(p)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  manejarVerProducto(p);
                }
              }}
            >
              {columnasVisibles.map((col) => (
                <td
                  key={col.key}
                    className={[
                      "tabla-col",
                      `tabla-col-${col.key}`,
                      col.key === "imagenesResumen" ? "td-imagenes-resumen" : "",
                      col.key === "tallesResumen" ? "td-talles-resumen" : "",
                      col.key === "detallesCosturaResumen" ? "td-costura-resumen" : "",
                      col.key === "cantidad" ? "td-cantidad" : "",
                      col.key === "acciones" ? "td-acciones" : "",
                    ].join(" ").trim()}
                  onClick={col.key === "acciones" ? (e) => e.stopPropagation() : undefined}
                >
                  {renderCeldaProducto(p, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
        </>
)}

      {productos.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "20px", color: "#888" }}>
          No hay productos cargados en este pedido.
        </p>
      )}

      {/* 🔹 Modal de productos */}
      {mostrarModal && (
        <ProductoFormModal
          pedidoId={pedido.firebaseId}
          pedido={pedido}
          productoEditando={productoEditando}
          onClose={() => {
            setMostrarModal(false);
            setProductoEditando(null);
          }}
          onProductoGuardado={cargarProductos}
          soloVer={soloVer}
          perfil={perfil}
        />
      )}

      {imagenPreviewTabla && (
        <div
          className="detalle-imagen-preview-fixed"
          style={{
            left: imagenPreviewTabla.x - 260,
            top: imagenPreviewTabla.y - 110,
          }}
        >
          <img
            src={imagenPreviewTabla.url}
            alt="Vista previa"
            className="detalle-imagen-preview-fixed-img"
          />
        </div>
      )}

      <ColumnasDetallePedidoModal
        open={mostrarConfigColumnas}
        columnas={columnasDetalle}
        onClose={() => setMostrarConfigColumnas(false)}
        onGuardar={async (nuevasColumnas) => {
          const columnasNormalizadas = normalizarColumnasDetallePedido(nuevasColumnas);
          setColumnasDetalle(columnasNormalizadas);

          try {
            if (!perfil?.clienteId) return;

            const ref = doc(
              db,
              `clientes-saas/${perfil.clienteId}/configuracion`,
              "pedidos_detalle"
            );

            await setDoc(
              ref,
              { columnas: columnasNormalizadas },
              { merge: true }
            );
          } catch (error) {
            console.error("Error guardando columnas:", error);
          }
        }}
      />
     {mostrandoClienteDetalle && (
      <div
        className="cliente-detalle-overlay"
        onClick={() => setMostrandoClienteDetalle(false)}
      >
        <div
          className="cliente-detalle-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cliente-detalle-header">
            <h3>Datos del cliente</h3>
            <button
              type="button"
              onClick={() => setMostrandoClienteDetalle(false)}
            >
              ✕
            </button>
          </div>

          <div className="cliente-detalle-grid">
            <div>
              <span>Nombre</span>
              <strong>{clienteDetalle?.nombre || "-"}</strong>
            </div>

            <div>
              <span>Documento</span>
              <strong>{clienteDetalle?.dni || "-"}</strong>
            </div>

            <div>
              <span>Teléfono</span>
              <strong>{clienteDetalle?.telefono || "-"}</strong>
            </div>

            <div>
              <span>Email</span>
              <strong>{clienteDetalle?.email || "-"}</strong>
            </div>

            <div>
              <span>Dirección</span>
              <strong>{clienteDetalle?.direccion || "-"}</strong>
            </div>

            <div>
              <span>Localidad</span>
              <strong>{clienteDetalle?.localidad || "-"}</strong>
            </div>

            <div>
              <span>Provincia</span>
              <strong>{clienteDetalle?.provincia || "-"}</strong>
            </div>
          </div>
        </div>
      </div>

    )}

    {mostrarModalImpresion && (
      <div
        className="pedido-print-modal-overlay"
        onMouseDown={cerrarSelectorImpresion}
      >
        <div
          className="pedido-print-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="pedido-print-modal-header">
            <div>
              <h3>Imprimir detalle</h3>
              <p>Elegí el formato de papel.</p>
            </div>

            <button
              type="button"
              className="pedido-print-modal-close"
              onClick={cerrarSelectorImpresion}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="pedido-print-modal-field">
            <label htmlFor="formato-impresion-pedido">
              Formato
            </label>

            <select
              id="formato-impresion-pedido"
              value={formatoImpresion}
              onChange={(e) => {
                setFormatoImpresion(e.target.value);
                setErrorImpresion("");
              }}
            >
              {Object.entries(FORMATOS_IMPRESION).map(
                ([value, formato]) => (
                  <option key={value} value={value}>
                    {formato.label}
                  </option>
                )
              )}
            </select>
          </div>

          {formatoImpresion === "personalizado" ? (
            <div className="pedido-print-medidas-grid">
              <div className="pedido-print-modal-field">
                <label htmlFor="pedido-print-ancho">
                  Ancho
                </label>

                <div className="pedido-print-medida-control">
                  <input
                    id="pedido-print-ancho"
                    type="number"
                    min="40"
                    max="300"
                    step="0.1"
                    value={anchoPersonalizado}
                    onChange={(e) => {
                      setAnchoPersonalizado(e.target.value);
                      setErrorImpresion("");
                    }}
                  />
                  <span>mm</span>
                </div>
              </div>

              <div className="pedido-print-modal-field">
                <label htmlFor="pedido-print-alto">
                  Alto
                </label>

                <div className="pedido-print-medida-control">
                  <input
                    id="pedido-print-alto"
                    type="number"
                    min="40"
                    max="1000"
                    step="0.1"
                    value={altoPersonalizado}
                    onChange={(e) => {
                      setAltoPersonalizado(e.target.value);
                      setErrorImpresion("");
                    }}
                  />
                  <span>mm</span>
                </div>
              </div>
            </div>
          ) : null}



          {errorImpresion ? (
            <div className="pedido-print-modal-error">
              {errorImpresion}
            </div>
          ) : null}

          <div className="pedido-print-modal-actions">
            <button
              type="button"
              className="pedido-print-modal-cancelar"
              onClick={cerrarSelectorImpresion}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="pedido-print-modal-confirmar"
              onClick={confirmarImpresion}
            >
              Aceptar e imprimir
            </button>
          </div>
        </div>
      </div>
    )}
    </div>

  );
}
