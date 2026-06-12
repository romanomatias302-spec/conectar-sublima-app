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
} from "firebase/firestore";


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

  const restaurarTitulo = () => {
    document.title = tituloOriginal;
  };

  window.addEventListener("afterprint", restaurarTitulo);

  return () => {
    window.removeEventListener("afterprint", restaurarTitulo);
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

    const resumirZonas = (producto) => {
    const zonas = producto?.zonas || {};
    const usadas = Object.entries(zonas)
      .filter(([, valor]) => String(valor || "").trim() !== "")
      .map(([codigo, valor]) => `${codigo}: ${valor}`);

    return usadas.length ? usadas.join(" | ") : "-";
  };

  const resumirTalles = (producto) => {
    const talles = producto?.talles || {};
    const detallePorTalle = producto?.detallePorTalle || {};

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
  });

return usados.length ? usados : [];

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

  const renderCeldaProducto = (producto, columnaKey) => {
    switch (columnaKey) {
      case "producto":
        return producto.productoNombre || producto.producto || "-";

      case "color":
        return producto.color || "-";

      case "detalle":
        return <div className="celda-texto-resumen">{producto.detalle || "-"}</div>;

      case "observaciones":
        return <div className="celda-texto-resumen">{obtenerObservaciones(producto)}</div>;

      case "zonasResumen":
        return <div className="celda-texto-resumen">{resumirZonas(producto)}</div>;

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

          {index < talles.length - 1 ? (
            <span className="detalle-talle-divider">|</span>
          ) : null}
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


  

if (!pedido) {
  return null;
}
  

  return (
      <div className="pedido-detalle">
    <h1>Detalles del Pedido #{pedido.id}</h1>


      {/* 🔹 Contenedor gris claro para datos del pedido */}
      {/* 🔹 Header del pedido (theme-aware) */}
<div className="pedido-header-bar">
  <div className="pedido-header-item">
    <span className="pedido-header-label">Cliente:</span>
    <span className="pedido-header-value">{pedido?.cliente || "-"}</span>
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

          <div className="pedido-print-area">
            <h2>Productos del pedido</h2>

            <table className="pedido-print-table">
              <thead>
                <tr>
                  {columnasVisibles
                    .filter((col) => col.key !== "acciones" && col.key !== "imagenesResumen")
                    .map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                </tr>
              </thead>

              <tbody>
                {productos.map((p) => (
                  <tr key={p.id}>
                    {columnasVisibles
                      .filter((col) => col.key !== "acciones" && col.key !== "imagenesResumen")
                      .map((col) => (
                        <td key={col.key}>
                          {col.key === "producto" && (p.productoNombre || p.producto || "-")}
                          {col.key === "color" && (p.color || "-")}
                          {col.key === "detalle" && (p.detalle || "-")}
                          {col.key === "observaciones" && obtenerObservaciones(p)}
                          {col.key === "zonasResumen" && resumirZonas(p)}
                          {col.key === "tallesResumen" &&
                            (resumirTalles(p).length
                              ? resumirTalles(p)
                                  .map((t) => `${t.talle}: ${t.qty}${t.detalle ? ` (${t.detalle})` : ""}`)
                                  .join(" | ")
                              : "-")}
                          {col.key === "detallesCosturaResumen" &&
                            (resumirDetallesCostura(p).length
                              ? resumirDetallesCostura(p)
                                  .map((d) => `${d.nombre}: ${d.valor}`)
                                  .join(" | ")
                              : "-")}
                          {col.key === "cantidad" && (p.totalTalles || p.cantidad || "-")}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
          onClick={() => {
            const cliente =
              pedido?.cliente
                ?.replace(/[\\/:*?"<>|]/g, "")
                ?.trim() || "Cliente";

            const numeroPedido =
              pedido?.id ||
              pedido?.numeroPedido ||
              pedido?.visibleId ||
              "Pedido";

            document.title = `Pedido ${numeroPedido} - ${cliente}`;

            window.print();
          }}
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
    <table className="tabla-productos tabla-productos-desktop">
        <thead>
          <tr>
            {columnasVisibles.map((col) => (
              <th key={col.key}>{col.label}</th>
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
    
    </div>

  );
}
