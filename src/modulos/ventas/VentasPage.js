import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { crearVenta } from "../../firebase/ventas";
import { formatearMoneda, obtenerConfigMonedaDesdePerfil } from "../../utils/moneda";
import { fechaHoyNegocio } from "../../utils/fechas";
import "./VentasPage.css";
import ProductoSelectorModal from "../../components/ProductoSelectorModal/ProductoSelectorModal";
import {
  CalendarDays,
  User,
  Search,
  ClipboardList,
  MessageSquareText,
  BriefcaseBusiness,
  Plus,
  Trash2,
  ShieldCheck,
  Paperclip,
} from "lucide-react";
import { puedeHacer } from "../../utils/permisos";
import { obtenerUsuariosPorCliente } from "../../firebase/usuariosConfig";
import { marcarCotizacionConvertida } from "../../firebase/cotizaciones";


const itemVacio = () => ({
  descripcion: "",
  cantidad: 1,
  precioUnitario: 0,
  excluirDescuento: false,

  origenPrecio: "manual",
  listaPrecioId: "",
  listaPrecioNombre: "",
  productoListaNombre: "",
  productoBaseId: "",
  imagenUrl: "",
  imagenThumb: "",
  reglaCantidad: null,
  adicionalesSeleccionados: [],
  precioDetalleInterno: null,
});

function obtenerCantidadProductoPedido(producto) {
  return Number(producto.totalTalles || producto.cantidad || 1);
}

function buscarProductoEnLista(productoPedido, lista) {
  const productosLista = Array.isArray(lista?.productos) ? lista.productos : [];

  const nombrePedido = String(
    productoPedido.productoNombre ||
      productoPedido.producto ||
      ""
  )
    .trim()
    .toLowerCase();

  return productosLista.find((item) => {
    const nombreLista = String(item.nombre || item.productoListaNombre || "")
      .trim()
      .toLowerCase();

    return nombreLista && nombrePedido && nombreLista === nombrePedido;
  });
}

function normalizarVariantesProductoLista(productoLista = {}) {
  if (
    Array.isArray(productoLista.variantes) &&
    productoLista.variantes.length > 0
  ) {
    return productoLista.variantes.map((v, index) => ({
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
      precioBase: Number(productoLista.precioBase || 0),
      reglasCantidad: Array.isArray(productoLista.reglasCantidad)
        ? productoLista.reglasCantidad
        : [],
      adicionales: Array.isArray(productoLista.adicionales)
        ? productoLista.adicionales
        : [],
      imagenUrl: productoLista.imagenUrl || "",
      imagenThumb: productoLista.imagenThumb || "",
      activa: true,
    },
  ];
}

function obtenerPrecioPorCantidad(variante, cantidad) {
  const reglas = Array.isArray(variante?.reglasCantidad)
    ? variante.reglasCantidad
    : [];

  const regla = reglas.find((r) => {
    const desde = Number(r.desde || 0);
    const hasta = r.hasta === null || r.hasta === "" ? null : Number(r.hasta);

    return cantidad >= desde && (hasta === null || cantidad <= hasta);
  });

  return {
    precio: Number(regla?.precio || variante?.precioBase || 0),
    regla: regla || null,
  };
}

function obtenerVarianteGeneral(productoLista) {
  const variantes = normalizarVariantesProductoLista(productoLista);

  return (
    variantes.find((v) => v.id === "general") ||
    variantes.find((v) => String(v.nombre || "").toLowerCase() === "general") ||
    variantes[0] ||
    null
  );
}

function normalizarTalle(valor) {
  return String(valor || "").trim().toLowerCase();
}

function extraerTallesProductoPedido(producto = {}) {
  const posibles =
    producto.talles ||
    producto.tallesSeleccionados ||
    producto.detallesTalle ||
    producto.detallesPorTalle ||
    producto.cantidadesPorTalle ||
    [];

  if (Array.isArray(posibles)) {
    return posibles
      .map((t) => {
        if (typeof t === "string") {
          return { talle: t, cantidad: 1 };
        }

        return {
          talle: t.talle || t.nombre || t.label || t.valor || "",
          cantidad: Number(t.cantidad || t.cant || t.total || 0),
        };
      })
      .filter((t) => t.talle && t.cantidad > 0);
  }

  if (posibles && typeof posibles === "object") {
    return Object.entries(posibles)
      .map(([talle, cantidad]) => ({
        talle,
        cantidad: Number(cantidad || 0),
      }))
      .filter((t) => t.talle && t.cantidad > 0);
  }

  return [];
}

function obtenerVarianteParaTalle(productoLista, talle) {
  const variantes = normalizarVariantesProductoLista(productoLista);
  const talleNormalizado = normalizarTalle(talle);

  const varianteDetectada = variantes.find((v) => {
    if (v.id === "general") return false;
    if (String(v.nombre || "").toLowerCase() === "general") return false;

    return (v.talles || []).some(
      (t) => normalizarTalle(t) === talleNormalizado
    );
  });

  if (varianteDetectada) return varianteDetectada;

  return (
    variantes.find((v) => v.id === "general") ||
    variantes.find((v) => String(v.nombre || "").toLowerCase() === "general") ||
    variantes[0] ||
    null
  );
}

function armarItemVentaDesdeVariante({
  productoLista,
  listaSeleccionada,
  variante,
  cantidad,
  cantidadTotalParaRegla,
  descripcionBase,
  productosBase = [],
}) {
  const precioCalc = obtenerPrecioPorCantidad(variante, cantidadTotalParaRegla);

  const nombreVariante =
    variante?.nombre && variante.nombre !== "General"
      ? variante.nombre
      : "";

  const descripcion = nombreVariante
    ? `${productoLista.nombre || descripcionBase} - ${nombreVariante}`
    : productoLista.nombre || descripcionBase;

const productoBase = productosBase.find(
  (p) => p.firebaseId === productoLista.productoBaseId
);

const imagen =
  variante?.imagenThumb ||
  variante?.imagenUrl ||
  productoLista.imagenThumb ||
  productoLista.imagenUrl ||
  productoBase?.imagenThumb ||
  productoBase?.imagenUrl ||
  "";

  return {
    descripcion,
    cantidad,
    precioUnitario: precioCalc.precio,
    excluirDescuento: false,

    origenPrecio: "lista_precio",
    listaPrecioId: listaSeleccionada.firebaseId || "",
    listaPrecioNombre: listaSeleccionada.nombre || "",
    productoListaNombre: productoLista.nombre || descripcionBase,
    productoBaseId: productoLista.productoBaseId || "",

    varianteId: variante?.id || "general",
    varianteNombre: variante?.nombre || "General",

    imagenUrl: imagen,
    imagenThumb: imagen,

    reglaCantidad: precioCalc.regla,
    adicionalesSeleccionados: [],
    precioDetalleInterno: {
      origen: "pedido_importado",
      listaPrecioId: listaSeleccionada.firebaseId || "",
      listaPrecioNombre: listaSeleccionada.nombre || "",
      productoListaNombre: productoLista.nombre || descripcionBase,
      varianteId: variante?.id || "general",
      varianteNombre: variante?.nombre || "General",
      precioBase: Number(variante?.precioBase || 0),
      precioFinalUnitario: precioCalc.precio,
      cantidadTotalParaRegla,
      reglaCantidad: precioCalc.regla,
      adicionales: [],
    },
  };
}

function convertirProductosPedidoAVenta(
  productos = [],
  listaSeleccionada = null,
  productosBase = []
) {
  return productos.flatMap((producto) => {
    const cantidadTotal = obtenerCantidadProductoPedido(producto);

    const descripcion =
      producto.productoNombre ||
      producto.producto ||
      "";

    const productoLista = listaSeleccionada
      ? buscarProductoEnLista(producto, listaSeleccionada)
      : null;

    if (!productoLista) {
      return [{
        descripcion,
        cantidad: cantidadTotal,
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
      }];
    }

    const tallesPedido = extraerTallesProductoPedido(producto);

    if (!tallesPedido.length) {
      const variante = obtenerVarianteGeneral(productoLista);

      return [
        armarItemVentaDesdeVariante({
          productoLista,
          listaSeleccionada,
          variante,
          cantidad: cantidadTotal,
          cantidadTotalParaRegla: cantidadTotal,
          descripcionBase: descripcion,
          productosBase,
         
        }),
      ];
    }

    const grupos = new Map();

    tallesPedido.forEach(({ talle, cantidad }) => {
      const variante = obtenerVarianteParaTalle(productoLista, talle);
      const key = variante?.id || "general";

      const actual = grupos.get(key) || {
        variante,
        cantidad: 0,
      };

      actual.cantidad += Number(cantidad || 0);
      grupos.set(key, actual);
    });

    return Array.from(grupos.values()).map(({ variante, cantidad }) =>
      armarItemVentaDesdeVariante({
        productoLista,
        listaSeleccionada,
        variante,
        cantidad,
        cantidadTotalParaRegla: cantidadTotal,
        descripcionBase: descripcion,
        productosBase,
        
      })
    );
  });
}

const clienteRapidoInicial = {
  nombre: "",
  dni: "",
  telefono: "",
};

export default function VentasPage({
  perfil,
  pedidoInicial = null,
  productosPedido = [],
  cotizacionInicial = null,
  itemsCotizacion = [],
}) {
  const [clientes, setClientes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  
  const [usuarios, setUsuarios] = useState([]);
const [vendedorUid, setVendedorUid] = useState("");

const [busquedaCliente, setBusquedaCliente] = useState("");
const [mostrarDropdownCliente, setMostrarDropdownCliente] = useState(false);
const [clienteRefId, setClienteRefId] = useState("");

const [busquedaPedido, setBusquedaPedido] = useState("");
const [mostrarDropdownPedido, setMostrarDropdownPedido] = useState(false);
const [pedidoRefId, setPedidoRefId] = useState("");

  const [fechaVenta, setFechaVenta] = useState(() => fechaHoyNegocio(perfil));
  const [items, setItems] = useState([itemVacio()]);
  const [descuento, setDescuento] = useState(0);
  const [pagosIniciales, setPagosIniciales] = useState([
    {
      monto: 0,
      medioPago: "efectivo",
      comprobanteArchivo: null,
    },
  ]);
  const [observaciones, setObservaciones] = useState("");

  const [mostrarClienteRapido, setMostrarClienteRapido] = useState(false);
  const [clienteRapido, setClienteRapido] = useState(clienteRapidoInicial);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [ventaCreada, setVentaCreada] = useState(null);
  const [mostrarImportarPedido, setMostrarImportarPedido] = useState(false);
const [modalPrecioAbierto, setModalPrecioAbierto] = useState(false);
const [itemPrecioIndex, setItemPrecioIndex] = useState(null);
const [precioContexto, setPrecioContexto] = useState("venta");

const [listasPrecios, setListasPrecios] = useState([]);
const [listaImportacionId, setListaImportacionId] = useState("");
const [itemsImportacionPedido, setItemsImportacionPedido] = useState([]);

const [productosBase, setProductosBase] = useState([]);



const [pedidoImportado, setPedidoImportado] =
  useState(false);

  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);

  const puedeCrearVentas = puedeHacer(perfil, "ventas", "crear");
  const puedeEditarVentas = puedeHacer(perfil, "ventas", "editar");
  const puedeCrearClientes = puedeHacer(perfil, "clientes", "crear");

  const cargarDatosBase = async () => {
    try {
      if (!perfil) return;

      const clientesRef = collection(db, "clientes");
      const pedidosRef = collection(db, "pedidos");
      const listasRef = collection(db, "listasPrecios");
      const productosBaseRef = collection(db, "productosBase");

      const qClientes =
        perfil.rol === "superadmin"
          ? query(clientesRef)
          : query(clientesRef, where("clienteId", "==", perfil.clienteId));

      const qPedidos =
        perfil.rol === "superadmin"
          ? query(pedidosRef, orderBy("createdAt", "desc"), limit(50))
          : query(
              pedidosRef,
              where("clienteId", "==", perfil.clienteId),
              orderBy("createdAt", "desc"),
              limit(50)
            );

  const qListas =
    perfil.rol === "superadmin"
      ? query(listasRef)
      : query(
          listasRef,
          where("clienteId", "==", perfil.clienteId),
          where("activa", "==", true)
        );

const qProductosBase =
  perfil.rol === "superadmin"
    ? query(productosBaseRef)
    : query(productosBaseRef, where("clienteId", "==", perfil.clienteId));

const [snapClientes, snapPedidos, snapListas, snapProductosBase] =
  await Promise.all([
    getDocs(qClientes),
    getDocs(qPedidos),
    getDocs(qListas),
    getDocs(qProductosBase),
  ]);

  setClientes(
    snapClientes.docs.map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
  );

  setPedidos(
    snapPedidos.docs.map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
  );

  const listasDb = snapListas.docs.map((d) => ({
  firebaseId: d.id,
  ...d.data(),
}));

setListasPrecios(listasDb);

setProductosBase(
  snapProductosBase.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }))
);

if (!listaImportacionId && listasDb.length > 0) {
  const predeterminada =
    listasDb.find((l) => l.predeterminada === true) || listasDb[0];

  setListaImportacionId(predeterminada.firebaseId);
}



  try {
    const usuariosCliente = await obtenerUsuariosPorCliente(perfil.clienteId);
    setUsuarios(usuariosCliente);
  } catch (errorUsuarios) {
    console.warn("No se pudieron cargar vendedores:", errorUsuarios);
    setUsuarios([]);
  }

    } catch (err) {
      console.error("Error cargando datos de ventas:", err);
    }
  };

 

  useEffect(() => {
    cargarDatosBase();
  }, [perfil]);

useEffect(() => {
  if (
    pedidoInicial &&
    productosPedido.length &&
    !pedidoImportado
  ) {
    const listaInicial =
      listasPrecios.find((l) => l.firebaseId === listaImportacionId) ||
      listasPrecios.find((l) => l.predeterminada === true) ||
      listasPrecios[0] ||
      null;

    setItemsImportacionPedido(
      convertirProductosPedidoAVenta(productosPedido, listaInicial, productosBase)
    );

    if (listaInicial?.firebaseId && !listaImportacionId) {
      setListaImportacionId(listaInicial.firebaseId);
    }

    setMostrarImportarPedido(true);
    return;
  }

  if (!pedidoInicial && !productosPedido.length) {
    resetearFormulario();
    setPedidoImportado(false);
    setMostrarImportarPedido(false);
  }
}, [
  pedidoInicial,
  productosPedido,
  listasPrecios,
  listaImportacionId,
]);

const [cotizacionImportadaId, setCotizacionImportadaId] = useState("");

useEffect(() => {
  if (!cotizacionInicial || !itemsCotizacion.length || !clientes.length) return;
  if (cotizacionImportadaId === cotizacionInicial.firebaseId) return;

  const cliente = clientes.find(
    (c) => c.firebaseId === cotizacionInicial.clienteRefId
  );

  if (cliente) {
    usarClienteExistenteEnVenta(cliente);
  } else {
    setBusquedaCliente(cotizacionInicial.clienteNombre || "");
    setError(
      "No se encontró automáticamente el cliente de la cotización. Seleccionalo manualmente antes de guardar."
    );
  }

setItems(itemsCotizacion);

const subtotalCotizacion = itemsCotizacion.reduce(
  (acc, item) =>
    acc +
    Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
  0
);

const descuentoCotizacion = Number(cotizacionInicial.descuento || 0);

const descuentoPorcentaje =
  subtotalCotizacion > 0 && descuentoCotizacion > 0
    ? (descuentoCotizacion / subtotalCotizacion) * 100
    : 0;

setDescuento(descuentoPorcentaje);

setVendedorUid(cotizacionInicial.vendedorUid || "");
setObservaciones(cotizacionInicial.notas || "");
setCotizacionImportadaId(cotizacionInicial.firebaseId);
}, [cotizacionInicial, itemsCotizacion, clientes]);

  const clientesFiltrados = useMemo(() => {
    const texto = (busquedaCliente || "").trim().toLowerCase();
    if (!texto) return clientes;

      

    return clientes.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const dni = (c.dni || "").toString().toLowerCase();
      const telefono = (c.telefono || "").toLowerCase();
      return (
        nombre.includes(texto) ||
        dni.includes(texto) ||
        telefono.includes(texto)
      );
    });
  }, [clientes, busquedaCliente]);

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

  const clienteSeleccionado = useMemo(
    () => clientes.find((c) => c.firebaseId === clienteRefId) || null,
    [clientes, clienteRefId]
  );

  const pedidoSeleccionado = useMemo(
    () => pedidos.find((p) => p.firebaseId === pedidoRefId) || null,
    [pedidos, pedidoRefId]
  );

  const vendedorSeleccionado = useMemo(
  () => usuarios.find((u) => u.uid === vendedorUid) || null,
  [usuarios, vendedorUid]
);

const itemsNormalizados = useMemo(
  () =>
    items.map((item) => ({
      ...item,
      cantidad: Number(item.cantidad || 0),
      precioUnitario: Number(item.precioUnitario || 0),
      excluirDescuento: item.excluirDescuento === true,
      subtotal:
        Number(item.cantidad || 0) *
        Number(item.precioUnitario || 0),
    })),
  [items]
);

  const subtotal = useMemo(
    () => itemsNormalizados.reduce((acc, item) => acc + item.subtotal, 0),
    [itemsNormalizados]
  );

  const subtotalAplicableDescuento = useMemo(
  () =>
    itemsNormalizados
      .filter((item) => item.excluirDescuento !== true)
      .reduce((acc, item) => acc + item.subtotal, 0),
  [itemsNormalizados]
);

const descuentoMonto = useMemo(() => {
  const porcentaje = Number(descuento || 0);

  if (porcentaje <= 0) return 0;

  return subtotalAplicableDescuento * (porcentaje / 100);
}, [subtotalAplicableDescuento, descuento]);

const total = useMemo(
  () => subtotal - descuentoMonto,
  [subtotal, descuentoMonto]
);

 const totalPagadoInicial = useMemo(() => {
    return pagosIniciales.reduce(
      (acc, pago) => acc + Number(pago.monto || 0),
      0
    );
  }, [pagosIniciales]);

  const saldo = useMemo(() => {
    const valor = total - totalPagadoInicial;
    return valor < 0 ? 0 : valor;
  }, [total, totalPagadoInicial]);

  const agregarItem = () => {
    setItems((prev) => [...prev, itemVacio()]);
  };

  const eliminarItem = (index) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const actualizarItem = (index, campo, valor) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [campo]: valor } : item
      )
    );
  };

  const resetearFormulario = () => {
    setBusquedaCliente("");
    setClienteRefId("");
    setPedidoRefId("");
    setMostrarDropdownCliente(false);
    setBusquedaPedido("");
    setMostrarDropdownPedido(false);
    setFechaVenta(fechaHoyNegocio(perfil));
    setItems([itemVacio()]);
    setDescuento(0);
    setPagosIniciales([
      {
        monto: 0,
        medioPago: "efectivo",
        comprobanteArchivo: null,
      },
    ]);
    setObservaciones("");
    setMostrarClienteRapido(false);
    setClienteRapido(clienteRapidoInicial);
    setVendedorUid("");

    
  };

  const usarClienteExistenteEnVenta = (clienteExistente) => {
  if (!clienteExistente?.firebaseId) return;

  setClienteRefId(clienteExistente.firebaseId);

  setBusquedaCliente(
    `${clienteExistente.nombre || ""}${
      clienteExistente.dni ? ` - ${clienteExistente.dni}` : ""
    }`
  );

  setClienteRapido(clienteRapidoInicial);
  setMostrarClienteRapido(false);
  setMostrarDropdownCliente(false);
  setError("");
};

const usarPedidoEnVenta = (pedido) => {
  if (!pedido?.firebaseId) return;

  setPedidoRefId(pedido.firebaseId);
  setBusquedaPedido(
    `#${pedido.id || "-"} - ${
      pedido.cliente || pedido.clienteNombre || "Sin cliente"
    } - ${pedido.fechaPedido || pedido.fechaEntrega || "-"}`
  );
  setMostrarDropdownPedido(false);
};

const guardarClienteRapido = async () => {
  try {
    if (!puedeCrearClientes) {
      setError("No tenés permisos para crear clientes.");
      return;
    }

    const nombreLimpio = (clienteRapido.nombre || "").trim();
    const dniLimpio = String(clienteRapido.dni || "").trim();

    if (!nombreLimpio) {
      setError("El nombre del cliente rápido es obligatorio.");
      return;
    }

    if (dniLimpio) {
      const existentePorDni = clientes.find(
        (c) => String(c.dni || "").trim() === dniLimpio
      );

      if (existentePorDni) {
        const usarExistente = window.confirm(
          `Ya existe un cliente con el DNI ${dniLimpio}: ${
            existentePorDni.nombre || "Sin nombre"
          }.\n\n¿Querés usar ese cliente para esta venta?`
        );

        if (usarExistente) {
          usarClienteExistenteEnVenta(existentePorDni);
          return;
        }

        setError(
          "No se creó un cliente nuevo para evitar duplicar el DNI. Si realmente es otra persona, primero revisá/corregí el cliente existente."
        );
        return;
      }
    }

    const datos = {
      nombre: nombreLimpio,
      dni: dniLimpio,
      telefono: clienteRapido.telefono || "",
      direccion: "",
      localidad: "",
      provincia: "",
      email: "",
      clienteId: perfil?.clienteId || "",
    };

    const docRef = await addDoc(collection(db, "clientes"), {
      ...datos,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const nuevoCliente = {
      firebaseId: docRef.id,
      ...datos,
    };

    setClientes((prev) => [nuevoCliente, ...prev]);
    setClienteRefId(docRef.id);
    setBusquedaCliente(
      `${nuevoCliente.nombre}${nuevoCliente.dni ? ` - ${nuevoCliente.dni}` : ""}`
    );
    setClienteRapido(clienteRapidoInicial);
    setMostrarClienteRapido(false);
    setError("");
  } catch (err) {
    console.error(err);
    setError("No se pudo crear el cliente rápido.");
  }
};

    const actualizarPagoInicial = (index, campo, valor) => {
        setPagosIniciales((prev) =>
        prev.map((pago, i) =>
            i === index ? { ...pago, [campo]: valor } : pago
        )
        );
    };

   const seleccionarComprobantePagoInicial = (index, archivo) => {
      if (!archivo) return;

      const MAX_BYTES = 2 * 1024 * 1024;

      if (archivo.size > MAX_BYTES) {
        setError("El comprobante no puede superar los 2 MB.");
        return;
      }

      const tipoPermitido =
        archivo.type === "application/pdf" ||
        archivo.type.startsWith("image/");

      if (!tipoPermitido) {
        setError("El comprobante debe ser una imagen o un archivo PDF.");
        return;
      }

      actualizarPagoInicial(index, "comprobanteArchivo", archivo);
      setError("");
    }; 

    const agregarPagoInicial = () => {
        setPagosIniciales((prev) => [
        ...prev,
        {
          monto: 0,
          medioPago: "efectivo",
          comprobanteArchivo: null,
        }
        ]);
    };

    const eliminarPagoInicial = (index) => {
        if (pagosIniciales.length === 1) return;
        setPagosIniciales((prev) => prev.filter((_, i) => i !== index));
    };

    const cambiarListaImportacion = (listaId) => {
  setListaImportacionId(listaId);

  const lista = listasPrecios.find((l) => l.firebaseId === listaId) || null;

  setItemsImportacionPedido(
    convertirProductosPedidoAVenta(productosPedido, lista, productosBase)
  );
};

const actualizarItemImportacion = (index, campo, valor) => {
  setItemsImportacionPedido((prev) =>
    prev.map((item, i) =>
      i === index ? { ...item, [campo]: valor } : item
    )
  );
};

const importarPedidoComoVenta = () => {

  const clientePedidoNombre = (
    pedidoInicial?.clienteNombre ||
    pedidoInicial?.cliente ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();

  const clientePedidoDni = (
    pedidoInicial?.clienteDNI ||
    pedidoInicial?.dni ||
    ""
  )
    .toString()
    .trim();

const cliente =
  clientes.find(
    (c) =>
      pedidoInicial?.clienteRefId &&
      c.firebaseId === pedidoInicial.clienteRefId
  ) ||
  clientes.find((c) => {
    const nombreCliente = String(c.nombre || "")
      .trim()
      .toLowerCase();

    const dniCliente = String(c.dni || "").trim();

    return (
      clientePedidoNombre &&
      clientePedidoDni &&
      nombreCliente === clientePedidoNombre &&
      dniCliente === clientePedidoDni
    );
  }) ||
  clientes.find((c) => {
    const nombreCliente = String(c.nombre || "")
      .trim()
      .toLowerCase();

    return (
      clientePedidoNombre &&
      nombreCliente === clientePedidoNombre
    );
  });



if (cliente) {
  const textoCliente = `${cliente.nombre || ""}${
    cliente.dni ? ` - ${cliente.dni}` : ""
  }`;

  setClienteRefId("");
  setBusquedaCliente("");

  setTimeout(() => {
    setClienteRefId(cliente.firebaseId);
    setBusquedaCliente(textoCliente);
  }, 0);
} else {
  setClienteRefId("");

  setBusquedaCliente(
    pedidoInicial?.clienteNombre ||
      pedidoInicial?.cliente ||
      ""
  );

  setError(
    "No se encontró automáticamente el cliente del pedido. Seleccionalo manualmente antes de guardar."
  );
}

  setPedidoRefId(pedidoInicial?.firebaseId || "");
  setBusquedaPedido(
    pedidoInicial
      ? `#${pedidoInicial.id || "-"} - ${
          pedidoInicial.cliente || pedidoInicial.clienteNombre || "Sin cliente"
        } - ${pedidoInicial.fechaPedido || pedidoInicial.fechaEntrega || "-"}`
      : ""
  );

  setItems(
    itemsImportacionPedido.length
      ? itemsImportacionPedido
      : convertirProductosPedidoAVenta(productosPedido, null, productosBase)
  );

  setPedidoImportado(true);
  setMostrarImportarPedido(false);
};

const abrirSelectorPrecio = (index, contexto = "venta") => {
  setItemPrecioIndex(index);
  setPrecioContexto(contexto);
  setModalPrecioAbierto(true);
  setError("");
};

const aplicarProductoSeleccionado = (datosPrecio) => {
  if (itemPrecioIndex === null) return;

  if (precioContexto === "importacion") {
    setItemsImportacionPedido((prev) =>
      prev.map((item, index) =>
        index === itemPrecioIndex
          ? {
              ...item,
              ...datosPrecio,
              cantidad: item.cantidad,
            }
          : item
      )
    );
  } else {
    Object.entries(datosPrecio).forEach(([campo, valor]) => {
      actualizarItem(itemPrecioIndex, campo, valor);
    });
  }

  setModalPrecioAbierto(false);
  setItemPrecioIndex(null);
  setPrecioContexto("venta");
  setError("");
};

  const guardarVenta = async () => {
    try {
      if (!puedeCrearVentas) {
        setError("No tenés permisos para crear ventas.");
        return;
      }
      setGuardando(true);
      setError("");
      setExito("");

      const cliente = clientes.find((c) => c.firebaseId === clienteRefId);
      if (!cliente) {
        setError("Seleccioná un cliente.");
        return;
      }

      const itemsValidos = itemsNormalizados.filter(
        (item) =>
          item.descripcion.trim() &&
          Number(item.cantidad) > 0 &&
          Number(item.precioUnitario) >= 0
      );

      if (!itemsValidos.length) {
        setError("Agregá al menos un ítem válido.");
        return;
      }

      const nuevaVenta = await crearVenta({
        perfil,
        cliente,
        fechaVenta,
        items: itemsValidos,
        descuento: Number(descuentoMonto || 0),
        descuentoPorcentaje: Number(descuento || 0),
        pedidoAsociado: pedidoSeleccionado || null,
        vendedor: vendedorSeleccionado,
        pagosIniciales: pagosIniciales.map((pago) => ({
          monto: Number(pago.monto || 0),
          medioPago: pago.medioPago || "efectivo",
          fechaPago: fechaVenta,

          observacion:
            Number(pago.monto || 0) > 0
              ? "Pago inicial"
              : "",

          comprobanteArchivo:
            pago.comprobanteArchivo || null,
        })),
        observaciones,
      });

      if (cotizacionInicial?.firebaseId) {
        await marcarCotizacionConvertida({
          cotizacionId: cotizacionInicial.firebaseId,
          venta: nuevaVenta,
        });
      }

      setVentaCreada(nuevaVenta);
      setExito("Venta guardada con éxito.");
      resetearFormulario();
      
      await cargarDatosBase();
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar la venta.");
    } finally {
      setGuardando(false);
    }
  };

 

  return (
    <div className="ventas-page">
      <div className="ventas-topbar">
        <div>
          <h1>Ventas</h1>
          
        </div>
      </div>

      {error && <div className="ventas-alert ventas-alert-error">{error}</div>}
      {exito && <div className="ventas-alert ventas-alert-ok">{exito}</div>}
      {ventaCreada && (
        <div className="ventas-alert ventas-alert-ok ventas-post-creada">
          <span>
            Venta #{ventaCreada.numeroVenta || ""} guardada correctamente.
          </span>

          <div className="ventas-post-creada-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                localStorage.setItem("ventaDetalleId", ventaCreada.firebaseId);
                localStorage.setItem("vistaActual", "venta-detalle");
                window.location.reload();
              }}
            >
              Ver / imprimir factura
            </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setVentaCreada(null);
                  setExito("");
                  setError("");
                  resetearFormulario();
                }}
              >
                Crear otra venta
              </button>
          </div>
        </div>
      )}

      {mostrarImportarPedido && (
        <div className="ventas-importar-overlay">

        <div className="ventas-importar-modal">

        <h3>
        Crear venta desde pedido
        </h3>

        <p>
        Pedido #{pedidoInicial?.id}
        </p>

        

        <div className="ventas-importar-preview">
          {itemsImportacionPedido.map((item, index) => (
            <div key={index} className="ventas-importar-item ventas-importar-item-editable">
              <div>
                <span className="ventas-importar-nombre">
                  {item.descripcion || "Producto sin nombre"}
                </span>


              </div>

              <input
                type="number"
                min="1"
                value={item.cantidad}
                onChange={(e) =>
                  actualizarItemImportacion(
                    index,
                    "cantidad",
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />

              <input
                type="number"
                min="0"
                value={item.precioUnitario}
                onChange={(e) =>
                  actualizarItemImportacion(
                    index,
                    "precioUnitario",
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />

              <strong>
                {formatearMoneda(
                  Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
                  configMoneda.moneda,
                  configMoneda.localeMoneda
                )}
              </strong>
              <button
                type="button"
                className="ventas-importar-plus-btn"
                onClick={() => abrirSelectorPrecio(index, "importacion")}
                title="Configurar precio y adicionales"
              >
                +
              </button>
            </div>
          ))}
        </div>

       

        <div
        className="ventas-importar-actions"
        >

        <button
        onClick={()=>{
        setMostrarImportarPedido(false);
        setPedidoImportado(true);
        }}
        >
        No
        </button>

        <button
        onClick={
        importarPedidoComoVenta

        }
        >
        Sí, importar
        </button>


        </div>

        </div>

        </div>
        )}

        <div className="ventas-layout ventas-layout-con-resumen-alto">
          <div className="ventas-main-column ventas-main-column-crear">

         <div className="ventas-datos-pro ventas-datos-pro-externa">
            <div className="ventas-datos-title">
              <span className="ventas-datos-icon">
                <ShieldCheck size={17} />
              </span>
              <h3>Información de la venta</h3>
            </div>

            <div className="ventas-datos-row ventas-datos-row-principal">
              <div className="ventas-field">
                <label>Fecha</label>
                <div className="ventas-input-icon-wrap">
                  <CalendarDays size={17} />
                  <input type="date" value={fechaVenta} disabled />
                </div>
              </div>

              <div className="ventas-field ventas-field-cliente">
                <label>Cliente</label>

                <div className="ventas-cliente-inline">
                  <div className="ventas-cliente-buscador ventas-input-icon-wrap">
                    <User size={17} />
                    <input
                      placeholder="Escribí para buscar cliente..."
                      value={busquedaCliente}
                      onFocus={() => setMostrarDropdownCliente(true)}
                      onBlur={() => {
                        setTimeout(() => setMostrarDropdownCliente(false), 180);
                      }}
                      onChange={(e) => {
                        setBusquedaCliente(e.target.value);
                        setClienteRefId("");
                        setMostrarDropdownCliente(true);
                      }}
                      disabled={!puedeCrearVentas}
                    />

                    {mostrarDropdownCliente && !clienteRefId && (
                      <div className="ventas-dropdown">
                        {clientesFiltrados.slice(0, 8).map((c) => (
                        <button
                          key={c.firebaseId}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            usarClienteExistenteEnVenta(c);
                          }}
                        >
                            {c.nombre || "Sin nombre"} {c.dni ? `- ${c.dni}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {puedeCrearClientes && (
                    <button
                      type="button"
                      className="btn btn-secondary ventas-btn-inline ventas-btn-soft"
                      onClick={() => setMostrarClienteRapido((prev) => !prev)}
                      disabled={!puedeCrearVentas}
                    >
                      <Plus size={16} />
                      Cliente rápido
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="ventas-datos-row ventas-datos-row-secundaria">
              <div className="ventas-field ventas-pedido-field">
                <label>Pedido asociado</label>

                <div className="ventas-pedido-buscador ventas-input-icon-wrap">
                  <Search size={17} />
                  <input
                    value={busquedaPedido}
                    placeholder="Sin pedido asociado / buscar pedido..."
                    onFocus={() => setMostrarDropdownPedido(true)}
                    onBlur={() => {
                      setTimeout(() => setMostrarDropdownPedido(false), 180);
                    }}
                    onChange={(e) => {
                      setBusquedaPedido(e.target.value);
                      setPedidoRefId("");
                      setMostrarDropdownPedido(true);
                    }}
                    disabled={!puedeCrearVentas}
                  />

                  {mostrarDropdownPedido && (
                    <div className="ventas-dropdown">
                      <button
                        type="button"
                        onClick={() => {
                          setPedidoRefId("");
                          setBusquedaPedido("");
                          setMostrarDropdownPedido(false);
                        }}
                      >
                        Sin pedido asociado
                      </button>

                      {pedidosFiltrados.slice(0, 8).map((p) => (
                        <button
                          key={p.firebaseId}
                          type="button"
                          onClick={() => usarPedidoEnVenta(p)}
                        >
                          #{p.id || "-"} - {p.cliente || p.clienteNombre || "Sin cliente"} -{" "}
                          {p.fechaPedido || p.fechaEntrega || "-"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="ventas-field ventas-vendedor-field">
                <label>Vendedor</label>
                <div className="ventas-input-icon-wrap">
                  <BriefcaseBusiness size={17} />
                  <select
                    value={vendedorUid}
                    onChange={(e) => setVendedorUid(e.target.value)}
                    disabled={!puedeCrearVentas}
                  >
                    <option value="">Sin vendedor</option>
                    {usuarios.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.nombre || u.email || "Usuario sin nombre"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ventas-field">
                <label>Observaciones</label>
                <div className="ventas-input-icon-wrap">
                  <MessageSquareText size={17} />
                  <input
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalle extra de la venta..."
                    disabled={!puedeCrearVentas}
                  />
                </div>
              </div>
            </div>
          </div>

          {mostrarClienteRapido && puedeCrearClientes && (
            <div className="ventas-subpanel">
              <h3>Cliente rápido</h3>
              <div className="ventas-grid ventas-grid-3">
                <div className="ventas-field">
                  <label>Nombre</label>
                  <input
                    value={clienteRapido.nombre}
                    onChange={(e) =>
                      setClienteRapido((prev) => ({ ...prev, nombre: e.target.value }))
                    }
                    disabled={!puedeCrearClientes}
                  />
                </div>

                <div className="ventas-field">
                  <label>Documento de identidad</label>
                  <input
                    value={clienteRapido.dni}
                    onChange={(e) =>
                      setClienteRapido((prev) => ({ ...prev, dni: e.target.value }))
                    }
                    disabled={!puedeCrearClientes}
                  />
                </div>

                <div className="ventas-field">
                  <label>Teléfono</label>
                  <input
                    value={clienteRapido.telefono}
                    onChange={(e) =>
                      setClienteRapido((prev) => ({ ...prev, telefono: e.target.value }))
                    }
                    disabled={!puedeCrearClientes}
                  />
                </div>
              </div>

              <div className="ventas-actions-row">
                <button className="btn btn-primary" onClick={guardarClienteRapido}>
                  Guardar cliente rápido
                </button>
              </div>
            </div>
          )}

          <section className="ventas-card ventas-card-lg">
            
              <div className="ventas-card-header">
                <h2>Ítems de la venta</h2>
              </div>  


 

          

          <div className="ventas-items-actions">
            <button className="btn btn-primary" onClick={agregarItem} disabled={!puedeCrearVentas}>
              + Agregar ítem
            </button>
          </div>

          <div className="ventas-table-wrap">
            <table className="ventas-table ventas-items-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                  <th>Acción</th>
                  <th>Excluir desc.</th>
                </tr>
              </thead>
              <tbody>
                {itemsNormalizados.map((item, index) => (
                  <tr key={index}>
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

                        <div
                          className={`ventas-producto-main ${
                            item.origenPrecio === "lista_precio"
                              ? "ventas-producto-main-lista"
                              : "ventas-producto-main-manual"
                          }`}
                        >
                        {item.origenPrecio === "lista_precio" ? (
                          <button
                            type="button"
                            className="ventas-producto-lista-btn"
                            onClick={() => abrirSelectorPrecio(index, "venta")}
                            disabled={!puedeCrearVentas}
                            title="Editar configuración de precio"
                          >
                            <strong className="ventas-producto-nombre">
                              {item.descripcion || "Producto sin descripción"}
                            </strong>

                            <small className="ventas-item-source">
                              {item.varianteNombre
                                ? `Lista de precios · ${item.varianteNombre}`
                                : "Lista de precios"}
                            </small>
                          </button>
                        ) : (
                            <div className="ventas-descripcion-selector ventas-descripcion-selector-clean">
                              <input
                                value={item.descripcion}
                                onChange={(e) =>
                                  actualizarItem(index, "descripcion", e.target.value)
                                }
                                placeholder="Ej: Remera personalizada"
                                disabled={!puedeCrearVentas}
                              />

                              <button
                                type="button"
                                className="ventas-selector-precio-btn"
                                onClick={() => abrirSelectorPrecio(index)}
                                disabled={!puedeCrearVentas}
                                title="Agregar desde lista de precios"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                        <td className="ventas-cantidad-td">
                        <input
                          className="ventas-cantidad-input"
                          type="number"
                          min="1"
                          value={Number(item.cantidad) === 0 ? "" : item.cantidad}
                          onFocus={(e) => {
                            if (Number(e.target.value) === 0) {
                              e.target.value = "";
                            }
                          }}
                          onChange={(e) =>
                            actualizarItem(
                              index,
                              "cantidad",
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          onBlur={(e) => {
                            if (e.target.value === "") {
                              actualizarItem(index, "cantidad", 0);
                            }
                          }}
                          disabled={!puedeCrearVentas}
                        />
                        </td>
                        <td className="ventas-money-td">
                          {item.origenPrecio === "lista_precio" ? (
                            <strong>
                              {formatearMoneda(
                                item.precioUnitario,
                                configMoneda.moneda,
                                configMoneda.localeMoneda
                              )}
                            </strong>
                          ) : (
                            <input
                              className="ventas-precio-input-clean"
                              type="number"
                              min="0"
                              value={item.precioUnitario}
                              onFocus={(e) => {
                                if (Number(e.target.value) === 0) {
                                  e.target.value = "";
                                }
                              }}
                              onChange={(e) =>
                                actualizarItem(
                                  index,
                                  "precioUnitario",
                                  e.target.value === "" ? "" : Number(e.target.value)
                                )
                              }
                              onBlur={(e) => {
                                if (e.target.value === "") {
                                  actualizarItem(index, "precioUnitario", 0);
                                }
                              }}
                              disabled={!puedeCrearVentas}
                            />
                          )}
                        </td>
                     <td className="ventas-money-td ventas-subtotal-td">
                      <strong>
                        {formatearMoneda(
                          item.subtotal,
                          configMoneda.moneda,
                          configMoneda.localeMoneda
                        )}
                      </strong>
                    </td>
                      <td className="ventas-action-td">
                        <div className="ventas-action-center">
                          <button
                            type="button"
                            className="ventas-delete-icon-btn"
                            onClick={() => eliminarItem(index)}
                            disabled={items.length === 1 || !puedeCrearVentas}
                            title="Eliminar ítem"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                  <td className="ventas-check-td">
                    <input
                      type="checkbox"
                      checked={item.excluirDescuento === true}
                      onChange={(e) =>
                        actualizarItem(index, "excluirDescuento", e.target.checked)
                      }
                      disabled={!puedeCrearVentas}
                      title="Excluir este ítem del descuento porcentual"
                    />
                  </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        </div>          
        <aside className="ventas-card ventas-card-sm ventas-card-sticky-wrap">
          <div className="ventas-card-sticky">
            <div className="ventas-card-header">
              <h2>Resumen</h2>
            </div>

            <div className="ventas-resumen">
              <div className="ventas-resumen-duo">
                <div>
                  <span>Cliente</span>
                  <strong>{clienteSeleccionado?.nombre || "-"}</strong>
                </div>

                <div>
                  <span>Pedido</span>
                  <strong>{pedidoSeleccionado ? `#${pedidoSeleccionado.id}` : "-"}</strong>
                </div>
              </div>

              <div className="ventas-resumen-row">
                <span>Subtotal</span>
                <strong>{formatearMoneda(subtotal, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <div className="ventas-descuento-mini">
                <span>Descuento</span>

                <div className="ventas-descuento-input-wrap">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={descuento}
                    onChange={(e) => setDescuento(e.target.value)}
                    disabled={!puedeCrearVentas}
                    placeholder="0"
                  />
                  <small>%</small>
                </div>

                <strong>
                  {formatearMoneda(
                    descuentoMonto,
                    configMoneda.moneda,
                    configMoneda.localeMoneda
                  )}
                </strong>
              </div>

              <div className="ventas-resumen-row ventas-total">
                <span>Total</span>
                <strong>{formatearMoneda(total, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <div className="ventas-field">
                <label>Pagos iniciales</label>
              </div>

              <div className="ventas-pagos-lista">
                {pagosIniciales.map((pago, index) => (
                  <div key={index}>
                    <div className="ventas-pago-item">
                      <input
                        type="number"
                        min="0"
                        placeholder="Monto"
                        value={pago.monto}
                        onChange={(e) =>
                          actualizarPagoInicial(index, "monto", e.target.value)
                        }
                        disabled={!puedeCrearVentas}
                      />

                      <select
                        value={pago.medioPago}
                        onChange={(e) =>
                          actualizarPagoInicial(index, "medioPago", e.target.value)
                        }
                        disabled={!puedeCrearVentas}
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                        <option value="mp">Mercado Pago</option>
                        <option value="otro">Otro</option>
                      </select>

                        <label
                          className={`ventas-pago-comprobante-btn ${
                            pago.comprobanteArchivo ? "is-active" : ""
                          }`}
                          title={
                            pago.comprobanteArchivo
                              ? pago.comprobanteArchivo.name
                              : "Adjuntar comprobante (máx. 2 MB)"
                          }
                        >
                        <Paperclip size={15} />

                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          style={{ display: "none" }}
                          disabled={!puedeCrearVentas}
                          onChange={(e) => {
                            const archivo = e.target.files?.[0] || null;

                            seleccionarComprobantePagoInicial(index, archivo);

                            e.target.value = "";
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        className="ventas-pago-remove"
                        onClick={() => eliminarPagoInicial(index)}
                        disabled={
                          pagosIniciales.length === 1 || !puedeCrearVentas
                        }
                      >
                        ×
                      </button>
                    </div>

                    {pago.comprobanteArchivo && (
                      <div className="ventas-pago-comprobante-nombre">
                        <span title={pago.comprobanteArchivo.name}>
                          Comprobante adjunto
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            actualizarPagoInicial(
                              index,
                              "comprobanteArchivo",
                              null
                            )
                          }
                          title="Quitar comprobante"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="ventas-add-pago-btn"
                onClick={agregarPagoInicial}
                disabled={!puedeCrearVentas}
              >
                + Agregar otro pago
              </button>

              <div className="ventas-resumen-row">
                <span>Total pagado</span>
                <strong>{formatearMoneda(totalPagadoInicial, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <div className="ventas-resumen-row">
                <span>Saldo pendiente</span>
                <strong>{formatearMoneda(saldo, configMoneda.moneda, configMoneda.localeMoneda)}</strong>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={guardarVenta}
                disabled={guardando || !puedeCrearVentas}
              >
                {guardando ? "Guardando..." : "Guardar venta"}
              </button>
            </div>
          </div>
        </aside>
      </div>
        <ProductoSelectorModal
          open={modalPrecioAbierto}
          perfil={perfil}
          configMoneda={configMoneda}
          itemActual={
            itemPrecioIndex !== null
              ? precioContexto === "importacion"
                ? itemsImportacionPedido[itemPrecioIndex]
                : items[itemPrecioIndex]
              : null
          }
          onClose={() => {
            setModalPrecioAbierto(false);
            setItemPrecioIndex(null);
            setPrecioContexto("venta");
          }}
          onAplicar={aplicarProductoSeleccionado}
        />       
      
    </div>

  );
}