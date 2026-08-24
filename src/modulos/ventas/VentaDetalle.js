import React, { useEffect, useMemo, useState } from "react";
import {
collection,
getDocs,
query,
where,
orderBy,
limit,
doc,
getDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  obtenerVentaPorId,
  obtenerItemsDeVenta,
  obtenerPagosDeVenta,
  actualizarPedidoAsociadoDeVenta,
  agregarItemAVenta,
  agregarPagoPosteriorAVenta,
  adjuntarComprobanteAPago,
  obtenerOAsignarNumeroRecibo,
  anularItemDeVenta,
  anularPagoDeVenta,
  anularVenta,
} from "../../firebase/ventas";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { fechaHoyNegocio } from "../../utils/fechas";
import {
  crearPedidoBase,
  crearProductosPedidoDesdeVenta,
} from "../../firebase/pedidos";
import "./VentasPage.css";
import { puedeHacer } from "../../utils/permisos";
import ProductoSelectorModal from "../../components/ProductoSelectorModal/ProductoSelectorModal";
import { Eye, Paperclip, ReceiptText } from "lucide-react";



export default function VentaDetalle({ perfil, ventaId, onVolver, onVerPedido }) {
  const [venta, setVenta] = useState(null);
  const [items, setItems] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [configNegocio, setConfigNegocio] = useState({
  nombreVisible: "",
  logoUrl: "",
});

const [pedidoRefId, setPedidoRefId] = useState("");
const [busquedaPedido, setBusquedaPedido] = useState("");
const [mostrarDropdownPedido, setMostrarDropdownPedido] = useState(false);
const [guardandoPedido, setGuardandoPedido] = useState(false);

const [nuevoItem, setNuevoItem] = useState({
  descripcion: "",
  cantidad: 1,
  precioUnitario: 0,
  excluirDescuento: false,

  origenPrecio: "manual",
  listaPrecioId: "",
  listaPrecioNombre: "",
  productoListaNombre: "",
  productoBaseId: "",
  varianteId: "",
  varianteNombre: "",

  imagenUrl: "",
  imagenThumb: "",

  reglaCantidad: null,
  adicionalesSeleccionados: [],
  precioDetalleInterno: null,
});

const [modalPrecioAbierto, setModalPrecioAbierto] = useState(false);

const [nuevoPago, setNuevoPago] = useState(() => ({
  monto: 0,
  medioPago: "efectivo",
  fechaPago: fechaHoyNegocio(perfil),
  observacion: "",
  fechaComprobanteReal: "",
  comprobanteArchivo: null,
}));

  const [guardandoItem, setGuardandoItem] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [anulandoVenta, setAnulandoVenta] = useState(false);

  const [reciboImpresion, setReciboImpresion] = useState(null);

  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

const puedeVerVentas =
  puedeHacer(perfil, "ventas", "ver");

const puedeEditarVentas =
  puedeHacer(perfil, "ventas", "editar");

const puedeCrearPedidos =
  puedeHacer(perfil, "pedidos", "crear");

const [
  creandoPedidoDesdeVenta,
  setCreandoPedidoDesdeVenta,
] = useState(false);

const [
  mostrarCrearPedidoDesdeVenta,
  setMostrarCrearPedidoDesdeVenta,
] = useState(false);

const [
  fechaEntregaNuevoPedido,
  setFechaEntregaNuevoPedido,
] = useState("");

const puedeAnularVentas =
  puedeHacer(perfil, "ventas", "anular");



  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  const formatearNumeroRecibo = (numero) => {
    const valor = Number(numero || 0);

    if (!valor) return "";

    return `REC-${String(valor).padStart(6, "0")}`;
  };

  const cargarVentaCompleta = async () => {
    try {
      setError("");
      setExito("");

      const [ventaData, itemsData, pagosData] = await Promise.all([
        obtenerVentaPorId(ventaId),
        obtenerItemsDeVenta(ventaId),
        obtenerPagosDeVenta(ventaId),
      ]);

      setVenta(ventaData);
      setItems(itemsData);
      setPagos(pagosData);
      setPedidoRefId(ventaData.pedidoRefId || "");
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la venta.");
    }
  };

  const cargarPedidos = async () => {
    try {
      if (!perfil) return;

      const pedidosRef = collection(db, "pedidos");

      const q =
        perfil.rol === "superadmin"
          ? query(pedidosRef, orderBy("createdAt", "desc"), limit(50))
          : query(
              pedidosRef,
              where("clienteId", "==", perfil.clienteId),
              orderBy("createdAt", "desc"),
              limit(50)
            );

      const snap = await getDocs(q);

      setPedidos(
        snap.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const cargarConfigNegocio = async () => {
  try {
    if (!perfil?.clienteId || perfil?.rol === "superadmin") return;

    const ref = doc(db, "clientes-saas", perfil.clienteId);
    const snap = await getDoc(ref);

    if (!snap.exists()) return;

    const data = snap.data();

    setConfigNegocio({
      nombreVisible: data.nombreVisible || data.nombre || "",
      logoUrl: data.logoUrl || "",
    });
  } catch (err) {
    console.error("Error cargando configuración del negocio:", err);
  }
};

  useEffect(() => {
    if (!ventaId) return;
    cargarVentaCompleta();
    cargarPedidos();
    cargarConfigNegocio();
  }, [ventaId, perfil]);

  const pedidoSeleccionado = useMemo(
    () => pedidos.find((p) => p.firebaseId === pedidoRefId) || null,
    [pedidos, pedidoRefId]
  );

    const pedidosFiltrados = useMemo(() => {
      const texto = (busquedaPedido || "").trim().toLowerCase();

      if (!texto) return pedidos;

      return pedidos.filter((p) => {
        const numero = String(p.id || "").toLowerCase();
        const cliente = String(p.cliente || p.clienteNombre || "").toLowerCase();
        const fecha = String(p.fechaPedido || p.fechaEntrega || "").toLowerCase();

        return (
          numero.includes(texto) ||
          cliente.includes(texto) ||
          fecha.includes(texto)
        );
      });
    }, [pedidos, busquedaPedido]);

    useEffect(() => {
      if (!pedidoRefId) {
        setBusquedaPedido("");
        return;
      }

      const pedido = pedidos.find((p) => p.firebaseId === pedidoRefId);

      if (pedido) {
        setBusquedaPedido(
          `#${pedido.id || "-"} - ${
            pedido.cliente || pedido.clienteNombre || "Sin cliente"
          } - ${pedido.fechaPedido || pedido.fechaEntrega || "-"}`
        );
      }
    }, [pedidoRefId, pedidos]);

    const seleccionarPedidoAsociado = (pedido) => {
      if (!pedido?.firebaseId) return;

      setPedidoRefId(pedido.firebaseId);
      setBusquedaPedido(
        `#${pedido.id || "-"} - ${
          pedido.cliente || pedido.clienteNombre || "Sin cliente"
        } - ${pedido.fechaPedido || pedido.fechaEntrega || "-"}`
      );
      setMostrarDropdownPedido(false);
    };
  const ventaAnulada = (venta?.estadoVenta || "activa") === "anulada";

    const anularItem = async (item) => {
    try {
      if (!puedeAnularVentas) return;
      const motivo = window.prompt("Motivo de anulación del ítem:", "");
      if (motivo === null) return;

      setError("");
      setExito("");

      await anularItemDeVenta({
        perfil,
        ventaId: venta.firebaseId,
        itemId: item.firebaseId,
        motivoAnulacion: motivo,
      });

      await cargarVentaCompleta();
      setExito("Ítem anulado con éxito.");
    } catch (err) {
      console.error(err);
      setError("No se pudo anular el ítem.");
    }
  };

  const anularPago = async (pago) => {
    try {
      if (!puedeAnularVentas) return;
      const motivo = window.prompt("Motivo de anulación del pago:", "");
      if (motivo === null) return;

      setError("");
      setExito("");

      await anularPagoDeVenta({
        perfil,
        ventaId: venta.firebaseId,
        pagoId: pago.firebaseId,
        motivoAnulacion: motivo,
      });

      await cargarVentaCompleta();
      setExito("Pago anulado con éxito.");
    } catch (err) {
      console.error(err);
      setError("No se pudo anular el pago.");
    }
  };

    const handleAnularVenta = async () => {
      try {
        if (!puedeAnularVentas) return;
        if (!venta) return;

        const motivo = window.prompt("Motivo de anulación de la venta:", "");
        if (motivo === null) return;

        const confirmado = window.confirm(
            `¿Seguro que querés anular la venta #${venta.numeroVenta}? Esta acción no borra la venta, solo la deja anulada.`
        );

        if (!confirmado) return;

        setAnulandoVenta(true);
        setError("");
        setExito("");

        await anularVenta({
            perfil,
            ventaId: venta.firebaseId,
            motivoAnulacion: motivo,
        });

        await cargarVentaCompleta();
        await cargarPedidos();

        setExito("Venta anulada con éxito.");
        } catch (err) {
        console.error(err);
        setError(err.message || "No se pudo anular la venta.");
        } finally {
        setAnulandoVenta(false);
        }
    };

const abrirCrearPedidoDesdeVenta = () => {
  if (!venta) return;
  if (!puedeCrearPedidos) return;
  if (ventaAnulada) return;

  if (venta.pedidoRefId) {
    setError(
      "Esta venta ya tiene un pedido asociado."
    );
    return;
  }

  setFechaEntregaNuevoPedido("");
  setError("");
  setExito("");
  setMostrarCrearPedidoDesdeVenta(true);
};

const crearPedidoDesdeVenta = async () => {
  try {
    if (!venta) return;
    if (!puedeCrearPedidos) return;
    if (ventaAnulada) return;

    /*
     * Protección contra duplicados.
     */
    if (venta.pedidoRefId) {
      setMostrarCrearPedidoDesdeVenta(false);

      setError(
        "Esta venta ya tiene un pedido asociado."
      );

      return;
    }

    setCreandoPedidoDesdeVenta(true);
    setError("");
    setExito("");

    const pedidoCreado =
      await crearPedidoBase({
        perfil,

        clienteNombre:
          venta.clienteNombre || "",

        clienteDNI:
          venta.clienteDNI ||
          venta.clienteDocumento ||
          "",

        fechaPedido:
          fechaHoyNegocio(perfil),

        fechaEntrega:
          fechaEntregaNuevoPedido || "",

        origen: "venta",

        ventaRefId:
          venta.firebaseId,

        ventaVisibleId:
          String(
            venta.numeroVenta || ""
          ),
      });

    const resultadoProductos =
      await crearProductosPedidoDesdeVenta({
        pedidoId:
          pedidoCreado.firebaseId,

        ventaId:
          venta.firebaseId,

        itemsVenta:
          items,

        perfil,
      });  

    await actualizarPedidoAsociadoDeVenta({
      ventaId: venta.firebaseId,
      pedidoAsociado: pedidoCreado,
    });

    setMostrarCrearPedidoDesdeVenta(false);
    setFechaEntregaNuevoPedido("");

    await cargarVentaCompleta();
    await cargarPedidos();

    setPedidoRefId(
      pedidoCreado.firebaseId
    );

    setExito(
      resultadoProductos.creados > 0
        ? `Pedido #${pedidoCreado.id} creado con ${resultadoProductos.creados} ${
            resultadoProductos.creados === 1
              ? "producto"
              : "productos"
          }.`
        : `Pedido #${pedidoCreado.id} creado y asociado correctamente.`
    );
  } catch (err) {
    console.error(
      "Error creando pedido desde venta:",
      err
    );

    setError(
      err.message ||
        "No se pudo crear el pedido."
    );
  } finally {
    setCreandoPedidoDesdeVenta(false);
  }
};

  const guardarPedidoAsociado = async () => {
    try {
      if (!puedeEditarVentas) return;
      if (!venta) return;
      setGuardandoPedido(true);
      setError("");
      setExito("");

      await actualizarPedidoAsociadoDeVenta({
        ventaId: venta.firebaseId,
        pedidoAsociado: pedidoSeleccionado,
      });

      await cargarVentaCompleta();
      setExito("Pedido asociado actualizado.");
    } catch (err) {
      console.error(err);
      setError("No se pudo actualizar el pedido asociado.");
    } finally {
      setGuardandoPedido(false);
    }
  };



  const abrirSelectorPrecio = () => {
    setModalPrecioAbierto(true);
    setError("");
  };

  const aplicarProductoSeleccionado = (datosPrecio) => {
    setNuevoItem((prev) => ({
      ...prev,
      ...datosPrecio,
      cantidad: prev.cantidad,
    }));

    setModalPrecioAbierto(false);
    setError("");
  };

  const guardarNuevoItem = async () => {
    try {
      if (!puedeEditarVentas) return;
      if (!venta) return;
      setGuardandoItem(true);
      setError("");
      setExito("");

      await agregarItemAVenta({
        perfil,
        venta,

        descripcion: nuevoItem.descripcion,
        cantidad: Number(nuevoItem.cantidad),
        precioUnitario: Number(nuevoItem.precioUnitario),

        excluirDescuento: nuevoItem.excluirDescuento === true,

        origenPrecio: nuevoItem.origenPrecio || "manual",
        listaPrecioId: nuevoItem.listaPrecioId || "",
        listaPrecioNombre: nuevoItem.listaPrecioNombre || "",
        productoListaNombre: nuevoItem.productoListaNombre || "",
        productoBaseId: nuevoItem.productoBaseId || "",
        varianteId: nuevoItem.varianteId || "",
        varianteNombre: nuevoItem.varianteNombre || "",

        imagenUrl: nuevoItem.imagenUrl || "",
        imagenThumb: nuevoItem.imagenThumb || "",

        reglaCantidad: nuevoItem.reglaCantidad || null,
        adicionalesSeleccionados: nuevoItem.adicionalesSeleccionados || [],
        precioDetalleInterno: nuevoItem.precioDetalleInterno || null,
      });

      setNuevoItem({
        descripcion: "",
        cantidad: 1,
        precioUnitario: 0,
        excluirDescuento: false,

        origenPrecio: "manual",
        listaPrecioId: "",
        listaPrecioNombre: "",
        productoListaNombre: "",
        productoBaseId: "",
        varianteId: "",
        varianteNombre: "",

        imagenUrl: "",
        imagenThumb: "",

        reglaCantidad: null,
        adicionalesSeleccionados: [],
        precioDetalleInterno: null,
      });

      await cargarVentaCompleta();
      setExito("Ítem agregado con éxito.");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo agregar el ítem.");
    } finally {
      setGuardandoItem(false);
    }
  };

  const imprimirReciboPago = async (pago) => {
    try {
      if (!pago?.firebaseId || !venta?.firebaseId) return;

      setError("");

      let numeroRecibo = pago.numeroRecibo || "";

      /*
      * Compatibilidad con pagos históricos:
      * si todavía no tienen recibo, se asigna
      * el siguiente número disponible.
      */
      if (!numeroRecibo) {
        numeroRecibo = await obtenerOAsignarNumeroRecibo({
          perfil,
          ventaId: venta.firebaseId,
          pagoId: pago.firebaseId,
        });

        await cargarVentaCompleta();
      }

      const recibo = {
        ...pago,
        numeroRecibo: String(numeroRecibo),
      };

      setReciboImpresion(recibo);

      const tituloAnterior = document.title;

      const cliente = (venta.clienteNombre || "Cliente")
        .replace(/[\\/:*?"<>|]/g, "")
        .trim();

      document.title =
        `${formatearNumeroRecibo(numeroRecibo)} - ${cliente}`;

      const limpiarDespuesDeImprimir = () => {
        document.title = tituloAnterior;
        setReciboImpresion(null);
      };

      window.addEventListener(
        "afterprint",
        limpiarDespuesDeImprimir,
        { once: true }
      );

      setTimeout(() => {
        window.print();
      }, 50);
    } catch (err) {
      console.error("Error preparando recibo:", err);
      setError("No se pudo preparar el recibo.");
    }
  };

  const seleccionarComprobanteNuevoPago = (archivo) => {
  if (!archivo) return;

  const MAX_BYTES = 2 * 1024 * 1024;

  if (archivo.size > MAX_BYTES) {
    setError("El comprobante no puede superar los 2 MB.");
    return;
  }

  const tiposPermitidos = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const tipoPermitido = tiposPermitidos.includes(archivo.type);

  if (!tipoPermitido) {
    setError("El comprobante debe ser una imagen o un archivo PDF.");
    return;
  }

  setNuevoPago((prev) => ({
    ...prev,
    comprobanteArchivo: archivo,
  }));

  setError("");
};

    const adjuntarComprobantePagoExistente = async (pago, archivo) => {
    if (!archivo || !pago?.firebaseId || !venta?.firebaseId) return;

    const MAX_BYTES = 2 * 1024 * 1024;

    if (archivo.size > MAX_BYTES) {
      setError("El comprobante no puede superar los 2 MB.");
      return;
    }

    const tiposPermitidos = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!tiposPermitidos.includes(archivo.type)) {
      setError("El comprobante debe ser PDF, JPG, PNG o WEBP.");
      return;
    }

    try {
      setError("");

      await adjuntarComprobanteAPago({
        perfil,
        ventaId: venta.firebaseId,
        pagoId: pago.firebaseId,
        archivo,
      });

      await cargarVentaCompleta();

      setExito("Comprobante adjuntado.");
    } catch (err) {
      console.error("Error adjuntando comprobante:", err);
      setError("No se pudo adjuntar el comprobante.");
    }
  };

  const guardarNuevoPago = async () => {
    try {
      if (!puedeEditarVentas) return;
      if (!venta) return;
      setGuardandoPago(true);
      setError("");
      setExito("");

      await agregarPagoPosteriorAVenta({
        perfil,
        venta,
        monto: Number(nuevoPago.monto),
        medioPago: nuevoPago.medioPago,
        fechaPago: nuevoPago.fechaPago,
        fechaComprobanteReal: nuevoPago.fechaComprobanteReal,
        comprobanteArchivo: nuevoPago.comprobanteArchivo || null,
        observacion: nuevoPago.observacion,
      });

      setNuevoPago({
        monto: 0,
        medioPago: "efectivo",
        fechaPago: fechaHoyNegocio(perfil),
        observacion: "",
        fechaComprobanteReal: "",
        comprobanteArchivo: null,
      });

      await cargarVentaCompleta();
      setExito("Pago agregado con éxito.");
      } catch (err) {
        console.error("Error agregando pago:", err);

        if (err?.code === "storage/unauthorized") {
          setError("No se pudo adjuntar el comprobante.");
        } else if (err?.code === "storage/retry-limit-exceeded") {
          setError("No se pudo subir el comprobante. Intentá nuevamente.");
        } else {
          setError("No se pudo agregar el pago.");
        }
      } finally {
      setGuardandoPago(false);
    }
  };

    if (!puedeVerVentas) {
    return (
      <div className="ventas-page">
        <div className="ventas-card">
          <p>No tenés permisos para ver ventas.</p>
        </div>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="ventas-page">
        <div className="ventas-card">
          <p>Cargando detalle de venta...</p>
        </div>
      </div>
    );
  }

  

  return (
    <div
      className={`ventas-page ${
        reciboImpresion ? "ventas-print-recibo-mode" : ""
      }`}
    >
      {reciboImpresion && (
        <section className="ventas-recibo-print">
          <div className="ventas-recibo-header">
            <div className="ventas-recibo-negocio">
              {configNegocio.logoUrl && (
                <img
                  src={configNegocio.logoUrl}
                  alt="Logo negocio"
                />
              )}

              <div>
                <strong>
                  {configNegocio.nombreVisible || "Comprobante de pago"}
                </strong>
                <span>Recibo de pago</span>
              </div>
            </div>

            <div className="ventas-recibo-numero">
              <span>RECIBO</span>
              <strong>
                {formatearNumeroRecibo(
                  reciboImpresion.numeroRecibo
                )}
              </strong>
            </div>
          </div>

          <div className="ventas-recibo-info">
            <div>
              <span>Fecha</span>
              <strong>{reciboImpresion.fechaPago || "-"}</strong>
            </div>

            <div>
              <span>Cliente</span>
              <strong>{venta.clienteNombre || "-"}</strong>
            </div>

            <div>
              <span>Venta asociada</span>
              <strong>#{venta.numeroVenta || "-"}</strong>
            </div>
          </div>

          <div className="ventas-recibo-monto">
            <span>Recibimos la suma de</span>

            <strong>
              {formatearMoneda(
                reciboImpresion.monto,
                configMoneda.moneda,
                configMoneda.localeMoneda
              )}
            </strong>
          </div>

          <div className="ventas-recibo-detalle">
            <div>
              <span>Medio de pago</span>
              <strong>
                {reciboImpresion.medioPago || "-"}
              </strong>
            </div>

            {reciboImpresion.observacion && (
              <div>
                <span>Observación</span>
                <strong>
                  {reciboImpresion.observacion}
                </strong>
              </div>
            )}

            {reciboImpresion.fechaComprobanteReal && (
              <div>
                <span>Fecha real del comprobante</span>
                <strong>
                  {reciboImpresion.fechaComprobanteReal}
                </strong>
              </div>
            )}
          </div>

          {(reciboImpresion.estadoPagoRegistro || "activo") !==
            "activo" && (
            <div className="ventas-recibo-anulado">
              RECIBO ANULADO
            </div>
          )}

          <div className="ventas-recibo-footer">
            <span>
              Este recibo corresponde exclusivamente al pago indicado.
            </span>

            <strong>
              {formatearNumeroRecibo(
                reciboImpresion.numeroRecibo
              )}
            </strong>
          </div>
        </section>
      )}
      <div className="factura-negocio-print">
        {configNegocio.logoUrl && (
          <img
            src={configNegocio.logoUrl}
            alt="Logo negocio"
            className="factura-negocio-logo"
          />
        )}

        <div>
          <h2>{configNegocio.nombreVisible || "Comprobante de venta"}</h2>
          
        </div>
      </div>
      <div className="ventas-topbar">
        <div>
          <h1>Venta #{venta.numeroVenta}</h1>
          <div style={{ marginTop: "6px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span
              className={`ventas-estado-badge ${
                ventaAnulada ? "ventas-estado-anulado" : "ventas-estado-ok"
              }`}
            >
              {ventaAnulada ? "Venta anulada" : "Venta activa"}
            </span>

            {!ventaAnulada && puedeAnularVentas && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={handleAnularVenta}
                disabled={anulandoVenta || !puedeAnularVentas}
              >
                {anulandoVenta ? "Anulando..." : "Anular venta"}
              </button>
            )}
          </div>
        </div>

    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => {
          const cliente = (venta?.clienteNombre || "Cliente")
            .replace(/[\\/:*?"<>|]/g, "")
            .trim();

          const numeroVenta = venta?.numeroVenta || "Factura";

          document.title = `Factura ${numeroVenta} - ${cliente}`;
          window.print();
        }}
      >
        Imprimir factura
      </button>

      <button className="btn btn-secondary" onClick={onVolver}>
        Volver
      </button>
    </div>
      </div>

      {error && <div className="ventas-alert ventas-alert-error">{error}</div>}
      {exito && <div className="ventas-alert ventas-alert-ok">{exito}</div>}

      {ventaAnulada && (
        <div className="ventas-alert ventas-alert-error">
          Esta venta está anulada. Se conserva por trazabilidad y no admite nuevas modificaciones operativas.
        </div>
      )}

      <div className="ventas-layout">
        <section className="ventas-main-column">
          <div className="ventas-top-editable ventas-mt-sm factura-info-grid">
            <div className="ventas-top-editable-item factura-info-item">
              <span>Fecha</span>
              <strong>{venta.fechaVenta || "-"}</strong>
            </div>

            <div className="ventas-top-editable-item factura-info-item">
              <span>Cliente</span>
              <strong>{venta.clienteNombre || "-"}</strong>
            </div>
            <div className="ventas-top-editable-item factura-info-item">
              <span>Vendedor</span>
              <strong>{venta.vendedorNombre || venta.vendedorEmail || "-"}</strong>
            </div>

            <div className="ventas-top-editable-item ventas-top-editable-pedido factura-info-item">
              <span>Pedido asociado</span>
              <strong className="factura-pedido-print">
                {venta.pedidoVisibleId
                  ? `#${venta.pedidoVisibleId}`
                  : pedidoSeleccionado?.id
                  ? `#${pedidoSeleccionado.id}`
                  : venta.pedidoRefId
                  ? "Pedido asociado"
                  : "-"}
              </strong>
              <div className="ventas-top-editable-pedido-row">
              <div className="ventas-pedido-buscador ventas-pedido-buscador-detalle">
                <input
                  value={busquedaPedido}
                  placeholder="Buscar pedido por número, cliente o fecha..."
                  disabled={ventaAnulada || !puedeEditarVentas || !!venta?.pedidoRefId}
                  onFocus={() => {
                    if (!venta?.pedidoRefId) setMostrarDropdownPedido(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setMostrarDropdownPedido(false), 180);
                  }}
                  onChange={(e) => {
                    setBusquedaPedido(e.target.value);
                    setPedidoRefId("");
                    setMostrarDropdownPedido(true);
                  }}
                />

                {mostrarDropdownPedido && !venta?.pedidoRefId && (
                  <div className="ventas-dropdown">
                    {pedidosFiltrados.slice(0, 8).map((p) => (
                      <button
                        key={p.firebaseId}
                        type="button"
                        onClick={() => seleccionarPedidoAsociado(p)}
                      >
                        #{p.id || "-"} - {p.cliente || p.clienteNombre || "Sin cliente"} -{" "}
                        {p.fechaPedido || p.fechaEntrega || "-"}
                      </button>
                    ))}

                    {pedidosFiltrados.length === 0 && (
                      <button type="button" disabled>
                        No se encontraron pedidos
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                onClick={guardarPedidoAsociado}
                disabled={
                  guardandoPedido ||
                  ventaAnulada ||
                  !puedeEditarVentas ||
                  !!venta?.pedidoRefId ||
                  !pedidoRefId
                }
              >
                {guardandoPedido
                  ? "Guardando..."
                  : "Guardar"}
              </button>

              {!venta?.pedidoRefId &&
                puedeCrearPedidos && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={abrirCrearPedidoDesdeVenta}
                    disabled={
                      creandoPedidoDesdeVenta ||
                      ventaAnulada
                    }
                  >
                    Crear pedido
                  </button>
              )}

              {venta?.pedidoRefId && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => onVerPedido && onVerPedido(venta.pedidoRefId)}
                  >
                    Ver pedido
                  </button>
                )}
              </div>
            </div>
          </div>

          <section className="ventas-card ventas-card-lg ventas-bloque">
            <div className="ventas-card-header">
              <h2>Ítems</h2>
            </div>

            <div className="ventas-table-wrap">
              <table className="ventas-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                    <th>Descuento</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const activo = (item.estadoItem || "activo") === "activo";

                    return (
                      <tr
                        key={item.firebaseId}
                        className={!activo ? "ventas-row-anulada" : ""}
                      >
                        <td className="ventas-producto-td">
                          <div className="ventas-producto-row">
                            <div className="ventas-producto-img">
                              {item.imagenThumb || item.imagenUrl ? (
                                <img
                                  src={item.imagenThumb || item.imagenUrl}
                                  alt={item.descripcion || "Producto"}
                                />
                              ) : (
                                <span />
                              )}
                            </div>

                            <div className="ventas-producto-main">
                              <strong className="ventas-producto-nombre">
                                {item.descripcion || "Producto sin descripción"}
                              </strong>

                              {item.origenPrecio === "lista_precio" && (
                                <small className="ventas-item-source">
                                  {item.varianteNombre
                                    ? `Lista de precios · ${item.varianteNombre}`
                                    : "Lista de precios"}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{item.cantidad}</td>
                        <td>{formatearMoneda(item.precioUnitario, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                        <td>{formatearMoneda(item.subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</td>
                        <td>
                          {item.excluirDescuento === true ? (
                            <span className="ventas-estado-badge ventas-estado-anulado">
                              Excluido
                            </span>
                          ) : Number(venta.descuentoPorcentaje || 0) > 0 ? (
                            <span className="ventas-estado-badge ventas-estado-ok">
                              {Number(venta.descuentoPorcentaje)}%
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>  
                        <td>
                          <span className={`ventas-estado-badge ${activo ? "ventas-estado-ok" : "ventas-estado-anulado"}`}>
                            {activo ? "Activo" : "Anulado"}
                          </span>
                        </td>
                        <td>
                          {activo &&
                              !ventaAnulada &&
                              puedeAnularVentas ? (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => anularItem(item)}
                            >
                              Anular
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ventas-subpanel ventas-mt">
              <div className="ventas-card-header">
                <h2>Agregar nuevo ítem</h2>
              </div>

              <div className="ventas-detalle-item-grid">

                <div className="ventas-field ventas-detalle-producto-field">
                  <label>Producto</label>

                  <div className="ventas-descripcion-selector ventas-descripcion-selector-clean">
                    <input
                      value={nuevoItem.descripcion}
                      onChange={(e) =>
                        setNuevoItem((prev) => ({
                          ...prev,
                          descripcion: e.target.value,

                          origenPrecio: "manual",
                          listaPrecioId: "",
                          listaPrecioNombre: "",
                          productoListaNombre: "",
                          productoBaseId: "",
                          varianteId: "",
                          varianteNombre: "",
                          imagenUrl: "",
                          imagenThumb: "",
                          reglaCantidad: null,
                          adicionalesSeleccionados: [],
                          precioDetalleInterno: null,
                        }))
                      }
                      placeholder="Ej: Remera personalizada"
                      disabled={!puedeEditarVentas || ventaAnulada}
                    />

                    <button
                      type="button"
                      className="ventas-selector-precio-btn"
                      onClick={abrirSelectorPrecio}
                      disabled={!puedeEditarVentas || ventaAnulada}
                      title="Agregar desde lista de precios"
                    />
                  </div>

                  {nuevoItem.origenPrecio === "lista_precio" && (
                    <small className="ventas-item-source">
                      {nuevoItem.varianteNombre
                        ? `Lista de precios · ${nuevoItem.varianteNombre}`
                        : "Lista de precios"}
                    </small>
                  )}
                </div>

                <div className="ventas-field ventas-detalle-precio-field">
                  <label>Precio unitario</label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoItem.precioUnitario}
                    onChange={(e) =>
                      setNuevoItem((prev) => ({
                        ...prev,
                        precioUnitario: e.target.value,
                      }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>

                <div className="ventas-field ventas-detalle-cantidad-field">
                  <label>Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={nuevoItem.cantidad}
                    onChange={(e) =>
                      setNuevoItem((prev) => ({
                        ...prev,
                        cantidad: e.target.value,
                      }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>

                <div className="ventas-field ventas-detalle-excluir-field">
                  <label>Excluir dto.</label>

                  <label className="ventas-detalle-excluir">
                    <input
                      type="checkbox"
                      checked={nuevoItem.excluirDescuento === true}
                      onChange={(e) =>
                        setNuevoItem((prev) => ({
                          ...prev,
                          excluirDescuento: e.target.checked,
                        }))
                      }
                      disabled={!puedeEditarVentas || ventaAnulada}
                    />

                    
                  </label>
                </div>

              </div>



              <div className="ventas-actions-row">
                <button
                  className="btn btn-primary"
                  onClick={guardarNuevoItem}
                  disabled={guardandoItem || ventaAnulada || !puedeEditarVentas}
                >
                  {guardandoItem ? "Agregando..." : "Agregar ítem"}
                </button>
              </div>
            </div>
          </section>

          <section className="ventas-card ventas-card-lg ventas-bloque">
            <div className="ventas-card-header">
              <h2>Pagos</h2>
            </div>

            <div className="ventas-table-wrap">
              <table className="ventas-table">
                <thead>
                  <tr>
                    <th>Fecha carga</th>
                    <th>Fecha real comp.</th>
                    <th>Monto</th>
                    <th>Medio</th>
                    <th>Observación</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pago) => {
                    const activo = (pago.estadoPagoRegistro || "activo") === "activo";

                    return (
                      <tr
                        key={pago.firebaseId}
                        className={!activo ? "ventas-row-anulada" : ""}
                      >
                        <td>{pago.fechaPago || "-"}</td>
                        <td>{pago.fechaComprobanteReal || "-"}</td>
                        <td>{formatearMoneda(pago.monto, configMoneda.moneda, configMoneda.localeMoneda)}</td> 
                        <td>{pago.medioPago || "-"}</td>
                        <td>{pago.observacion || "-"}</td>
                        <td>
                          <span className={`ventas-estado-badge ${activo ? "ventas-estado-ok" : "ventas-estado-anulado"}`}>
                            {activo ? "Activo" : "Anulado"}
                          </span>
                        </td>
                      <td>
                        <div className="ventas-pago-acciones">
                          {pago.comprobante?.url ? (
                            <button
                              type="button"
                              className="ventas-pago-icon-btn"
                              title="Ver comprobante"
                              onClick={() =>
                                window.open(
                                  pago.comprobante.url,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                            >
                              <Eye size={15} />
                            </button>
                          ) : (
                            activo &&
                            !ventaAnulada &&
                            puedeEditarVentas && (
                              <label
                                className="ventas-pago-icon-btn"
                                title="Adjuntar comprobante"
                              >
                                <Paperclip size={15} />

                                <input
                                  type="file"
                                  accept=".pdf,image/jpeg,image/png,image/webp"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const archivo = e.target.files?.[0] || null;

                                    adjuntarComprobantePagoExistente(pago, archivo);

                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )
                          )}


                          <button
                            type="button"
                            className="ventas-pago-icon-btn"
                            title={
                              pago.numeroRecibo
                                ? `Imprimir ${formatearNumeroRecibo(pago.numeroRecibo)}`
                                : "Generar e imprimir recibo"
                            }
                            onClick={() => imprimirReciboPago(pago)}
                          >
                            <ReceiptText size={15} />
                          </button>


                          {activo &&
                            !ventaAnulada &&
                            puedeAnularVentas && (
                              <button
                                className="btn btn-secondary btn-xs"
                                onClick={() => anularPago(pago)}
                              >
                                Anular
                              </button>
                            )}
                        </div>
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ventas-subpanel ventas-mt">
              <div className="ventas-card-header">
                <h2>Agregar pago</h2>
              </div>

              <div className="ventas-grid ventas-grid-3">
                <div className="ventas-field">
                  <label>Monto</label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoPago.monto}
                    onChange={(e) =>
                      setNuevoPago((prev) => ({ ...prev, monto: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  />
                </div>

                <div className="ventas-field">
                  <label>Medio de pago</label>
                  <select
                    value={nuevoPago.medioPago}
                    onChange={(e) =>
                      setNuevoPago((prev) => ({ ...prev, medioPago: e.target.value }))
                    }
                    disabled={!puedeEditarVentas || ventaAnulada}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="debito">Débito</option>
                    <option value="credito">Crédito</option>
                    <option value="mp">Mercado Pago</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="ventas-field">
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={nuevoPago.fechaPago}
                    disabled
                  />
                </div>
              </div>

              <div className="ventas-field">
                <label>Observación</label>
                <input
                  value={nuevoPago.observacion}
                  onChange={(e) =>
                    setNuevoPago((prev) => ({ ...prev, observacion: e.target.value }))
                  }
                  disabled={!puedeEditarVentas || ventaAnulada}
                />
              </div>

              <div className="ventas-field">
                <label>Fecha real de comprobante (opcional)</label>
                <input
                  type="date"
                  value={nuevoPago.fechaComprobanteReal}
                  onChange={(e) =>
                    setNuevoPago((prev) => ({
                      ...prev,
                      fechaComprobanteReal: e.target.value,
                    }))
                  }
                  disabled={!puedeEditarVentas || ventaAnulada}
                />
              </div>

              <div className="ventas-pago-comprobante-detalle">
                <label
                  className={`ventas-pago-comprobante-btn ${
                    nuevoPago.comprobanteArchivo ? "is-active" : ""
                  }`}
                  title={
                    nuevoPago.comprobanteArchivo
                      ? nuevoPago.comprobanteArchivo.name
                      : "Adjuntar comprobante (máx. 2 MB)"
                  }
                >
                  <Paperclip size={15} />

                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: "none" }}
                    disabled={!puedeEditarVentas || ventaAnulada}
                    onChange={(e) => {
                      const archivo = e.target.files?.[0] || null;

                      seleccionarComprobanteNuevoPago(archivo);

                      e.target.value = "";
                    }}
                  />
                </label>

                <span>
                  {nuevoPago.comprobanteArchivo
                    ? "Comprobante adjunto"
                    : "Adjuntar comprobante"}
                </span>

                {nuevoPago.comprobanteArchivo && (
                  <button
                    type="button"
                    className="ventas-pago-comprobante-quitar"
                    onClick={() =>
                      setNuevoPago((prev) => ({
                        ...prev,
                        comprobanteArchivo: null,
                      }))
                    }
                    title="Quitar comprobante"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="ventas-actions-row">
                <button
                  className="btn btn-primary"
                  onClick={guardarNuevoPago}
                  disabled={guardandoPago || ventaAnulada || !puedeEditarVentas}
                >
                  {guardandoPago ? "Agregando..." : "Agregar pago"}
                </button>
              </div>
            </div>
          </section>
        </section>

        <aside className="ventas-card ventas-card-sm">
          <div className="ventas-card-header">
            <h2>Resumen</h2>
          </div>

          <div className="ventas-resumen">
            <div className="ventas-resumen-row">
              <span>Cliente</span>
              <strong>{venta.clienteNombre || "-"}</strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Pedido asociado</span>
              <strong>{venta.pedidoVisibleId ? `#${venta.pedidoVisibleId}` : "-"}</strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Subtotal</span>
              <strong>{formatearMoneda(venta.subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</strong>  
            </div>

            <div className="ventas-resumen-row">
              <span>
                Descuento
                {Number(venta.descuentoPorcentaje || 0) > 0
                  ? ` (${Number(venta.descuentoPorcentaje)}%)`
                  : ""}
              </span>

              <strong>
                {formatearMoneda(
                  venta.descuento,
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
            </div>

            <div className="ventas-resumen-row ventas-total">
              <span>Total</span>
              <strong>{formatearMoneda(venta.total, configMoneda.moneda, configMoneda.localeMoneda)}</strong> 
            </div>

            <div className="ventas-resumen-row">
              <span>Total pagado</span>
              <strong>{formatearMoneda(venta.totalPagado, configMoneda.moneda, configMoneda.localeMoneda)}</strong> 
            </div>

            {Number(venta.saldoAFavor || 0) > 0 && (
              <div className="ventas-resumen-row">
                <span>Saldo a favor</span>
                <strong className="ventas-saldo-badge ventas-saldo-favor">
                  {formatearMoneda(venta.saldoAFavor, configMoneda.moneda, configMoneda.localeMoneda)} 
                </strong>
              </div>
            )}

            <div className="ventas-resumen-row">
              <span>Saldo pendiente</span>
              <strong
                className={`ventas-saldo-badge ${
                  Number(venta.saldoPendiente || 0) <= 0
                    ? "ventas-saldo-ok"
                    : "ventas-saldo-pendiente"
                }`}
              >
                {formatearMoneda(venta.saldoPendiente, configMoneda.moneda, configMoneda.localeMoneda)} 
              </strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Estado de venta</span>
              <strong>{venta.estadoVenta || "activa"}</strong>
            </div>

            <div className="ventas-resumen-row">
              <span>Estado de pago</span>
              <strong>{venta.estadoPago || "-"}</strong>
            </div>
          </div>
        </aside>
      </div>

      {mostrarCrearPedidoDesdeVenta && (
        <div
          className="ventas-crear-pedido-overlay"
          onClick={() => {
            if (!creandoPedidoDesdeVenta) {
              setMostrarCrearPedidoDesdeVenta(false);
            }
          }}
        >
          <div
            className="ventas-crear-pedido-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ventas-crear-pedido-header">
              <h3>Crear pedido</h3>

              <p>
                Se creará un nuevo pedido para{" "}
                <strong>
                  {venta.clienteNombre ||
                    "el cliente seleccionado"}
                </strong>
                .
              </p>
            </div>

            <div className="ventas-field">
              <label>Fecha de entrega</label>

              <input
                type="date"
                value={fechaEntregaNuevoPedido}
                min={fechaHoyNegocio(perfil)}
                onChange={(e) =>
                  setFechaEntregaNuevoPedido(
                    e.target.value
                  )
                }
                disabled={creandoPedidoDesdeVenta}
              />

              <small className="ventas-crear-pedido-ayuda">
                Opcional. Podés definirla después.
              </small>
            </div>

            <div className="ventas-crear-pedido-info">
             Se creará en Producción y quedará asociado a la venta.
            </div>

            <div className="ventas-crear-pedido-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={creandoPedidoDesdeVenta}
                onClick={() => {
                  setMostrarCrearPedidoDesdeVenta(false);
                  setFechaEntregaNuevoPedido("");
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={creandoPedidoDesdeVenta}
                onClick={crearPedidoDesdeVenta}
              >
                {creandoPedidoDesdeVenta
                  ? "Creando..."
                  : "Crear pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ProductoSelectorModal
        open={modalPrecioAbierto}
        perfil={perfil}
        configMoneda={configMoneda}
        itemActual={nuevoItem}
        onClose={() => {
          setModalPrecioAbierto(false);
        }}
        onAplicar={aplicarProductoSeleccionado}
      />
    </div>
  );
}