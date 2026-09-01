import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db, storage } from "../firebase";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { registrarUsoSaas } from "./saasUso";

export async function obtenerSiguienteNumeroVenta(clienteId) {
  if (!clienteId) {
    throw new Error("Falta clienteId para generar número de venta.");
  }

  const clienteSaasRef = doc(db, "clientes-saas", clienteId);

  const nuevoNumero = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(clienteSaasRef);

    if (!snap.exists()) {
      throw new Error("No existe el cliente SaaS asociado.");
    }

    const data = snap.data();
    const ultimoNumeroVenta = Number(data.ultimoNumeroVenta || 0);
    const siguienteNumero = ultimoNumeroVenta + 1;

    transaction.update(clienteSaasRef, {
      ultimoNumeroVenta: siguienteNumero,
      updatedAt: serverTimestamp(),
    });

    return siguienteNumero;
  });

  return nuevoNumero.toString();
}



async function subirComprobantePago({
  clienteId,
  ventaId,
  archivo,
}) {
  if (!archivo) return null;

  const MAX_COMPROBANTE_BYTES = 2 * 1024 * 1024;

  if (archivo.size > MAX_COMPROBANTE_BYTES) {
    throw new Error("El comprobante no puede superar los 2 MB.");
  }

    const tiposPermitidos = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    const tipoPermitido = tiposPermitidos.includes(archivo.type);

  if (!tipoPermitido) {
    throw new Error(
      "El comprobante debe ser una imagen o un archivo PDF."
    );
  }

  const nombreSeguro = archivo.name.replace(/[^\w.\-() ]/g, "_");

  const path =
    `clientes/${clienteId}/ventas/${ventaId}/pagos/comprobantes/` +
    `${Date.now()}-${nombreSeguro}`;

  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, archivo);

  const url = await getDownloadURL(storageRef);

  return {
    nombre: archivo.name,
    tipo: archivo.type || "",
    size: archivo.size || 0,
    path,
    url,
  };
}

function normalizarItems({ items = [], descripcion = "", cantidad = 0, precioUnitario = 0 }) {
  const itemsValidos = Array.isArray(items)
    ? items
        .map((item) => ({
          ...item,
          descripcion: (item.descripcion || "").trim(),
          cantidad: Number(item.cantidad || 0),
          precioUnitario: Number(item.precioUnitario || 0),
          excluirDescuento: item.excluirDescuento === true,
        }))
        .filter(
          (item) =>
            item.descripcion &&
            item.cantidad > 0 &&
            item.precioUnitario >= 0
        )
    : [];

  if (itemsValidos.length > 0) {
return itemsValidos.map((item) => ({
  ...item,
  subtotal: item.cantidad * item.precioUnitario,
  excluirDescuento: item.excluirDescuento === true,

  origenPrecio: item.origenPrecio || "manual",
  listaPrecioId: item.listaPrecioId || "",
  listaPrecioNombre: item.listaPrecioNombre || "",
  productoListaNombre: item.productoListaNombre || "",
  productoBaseId: item.productoBaseId || "",
  reglaCantidad: item.reglaCantidad || null,
  adicionalesSeleccionados: Array.isArray(item.adicionalesSeleccionados)
    ? item.adicionalesSeleccionados
    : [],
  precioDetalleInterno: item.precioDetalleInterno || null,
}));
  }

  if (descripcion && Number(cantidad) > 0) {
    return [
      {
        descripcion: descripcion.trim(),
        cantidad: Number(cantidad || 0),
        precioUnitario: Number(precioUnitario || 0),
        subtotal: Number(cantidad || 0) * Number(precioUnitario || 0),
      },
    ];
  }

  return [];
}

export async function crearVenta({
  perfil,
  cliente,
  fechaVenta,
  items = [],
  descripcion = "",
  cantidad = 0,
  precioUnitario = 0,
  descuento = 0,
  descuentoPorcentaje = 0,
  pedidoAsociado = null,
  vendedor = null,
  pagosIniciales = [],
  observaciones = "",
}) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!cliente?.firebaseId) throw new Error("Falta cliente seleccionado.");

  const sucursalId = perfil?.sucursalDefaultId || "principal";
const sucursalNombre = perfil?.sucursalDefaultNombre || "Sucursal principal";

  const itemsNormalizados = normalizarItems({
    items,
    descripcion,
    cantidad,
    precioUnitario,
  });

  if (!itemsNormalizados.length) {
    throw new Error("Debés agregar al menos un ítem válido.");
  }

  const numeroVenta = await obtenerSiguienteNumeroVenta(perfil.clienteId);

  const subtotal = itemsNormalizados.reduce((acc, item) => acc + item.subtotal, 0);
  const total = subtotal - Number(descuento || 0);
  const pagosNormalizados = Array.isArray(pagosIniciales)
    ? pagosIniciales
        .map((pago) => ({
          monto: Number(pago.monto || 0),
          medioPago: pago.medioPago || "efectivo",
          fechaPago: pago.fechaPago || fechaVenta,
          fechaComprobanteReal: pago.fechaComprobanteReal || "",
          observacion: pago.observacion || "",
          comprobanteArchivo: pago.comprobanteArchivo || null,
        }))
        .filter((pago) => pago.monto > 0)
    : [];

  const montoInicial = pagosNormalizados.reduce(
    (acc, pago) => acc + Number(pago.monto || 0),
    0
  );

  let estadoPago = "pendiente";
  if (montoInicial > 0 && montoInicial < total) estadoPago = "parcial";
  if (montoInicial >= total && total > 0) estadoPago = "pagado";

  const descripcionResumen =
    itemsNormalizados.length === 1
      ? itemsNormalizados[0].descripcion
      : `${itemsNormalizados.length} ítems`;

    const saldoPendienteInicial = total - montoInicial < 0 ? 0 : total - montoInicial;
  const saldoAFavorInicial = montoInicial > total ? montoInicial - total : 0;

  const ventaData = {
    numeroVenta,
    clienteId: perfil.clienteId,
    sucursalId,
    sucursalNombre,
    fechaVenta,
    clienteRefId: cliente.firebaseId,
    clienteNombre: cliente.nombre || "",
    clienteNombreBusqueda: String(cliente.nombre || "").trim().toLowerCase(),
    clienteDNI: cliente.dni || "",
    vendedorUid: vendedor?.uid || "",
    vendedorNombre: vendedor?.nombre || "",
    vendedorEmail: vendedor?.email || "",

    origenVenta: pedidoAsociado ? "pedido" : "manual",
    pedidoRefId: pedidoAsociado?.firebaseId || "",
    pedidoVisibleId: pedidoAsociado?.id || "",

    descripcion: descripcionResumen,
    observaciones: observaciones || "",

    cantidad: itemsNormalizados.reduce((acc, item) => acc + item.cantidad, 0),
    precioUnitario: itemsNormalizados.length === 1 ? itemsNormalizados[0].precioUnitario : 0,
    subtotal,
    descuento: Number(descuento || 0),
    descuentoPorcentaje: Number(descuentoPorcentaje || 0),
    total,

    totalPagado: montoInicial,
    saldoPendiente: saldoPendienteInicial,
    saldoAFavor: saldoAFavorInicial,
    estadoPago,

    estadoVenta: "activa",
    anuladaAt: null,
    anuladaPor: "",
    motivoAnulacion: "",

    afectaStock: false,

    requiereFacturaFiscal: false,
    estadoFiscal: "no_emitida",
    cae: "",
    vencimientoCae: "",
    tipoComprobanteFiscal: "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ventaRef = await addDoc(collection(db, "ventas"), ventaData);


  await registrarUsoSaas({
    clienteId: perfil.clienteId,
    ventas: 1,
  });

for (const item of itemsNormalizados) {
  await addDoc(collection(db, "ventas", ventaRef.id, "items"), {
    clienteId: perfil.clienteId,
    ventaRefId: ventaRef.id,
    numeroVenta,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    subtotal: item.subtotal,
    excluirDescuento: item.excluirDescuento === true,

    origenPrecio: item.origenPrecio || "manual",
    listaPrecioId: item.listaPrecioId || "",
    listaPrecioNombre: item.listaPrecioNombre || "",
    productoListaNombre: item.productoListaNombre || "",
    productoBaseId: item.productoBaseId || "",
    varianteId: item.varianteId || "",
    varianteNombre: item.varianteNombre || "",
    imagenUrl: item.imagenUrl || "",
    imagenThumb: item.imagenThumb || "",
    reglaCantidad: item.reglaCantidad || null,
    adicionalesSeleccionados: item.adicionalesSeleccionados || [],
    precioDetalleInterno: item.precioDetalleInterno || null,
    origenItem: "inicial",
    estadoItem: "activo",
    motivoAnulacion: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

  if (pagosNormalizados.length > 0) {
    for (const pago of pagosNormalizados) {
    let comprobante = null;
    let comprobanteError = "";

    if (pago.comprobanteArchivo) {
      try {
        comprobante = await subirComprobantePago({
          clienteId: perfil.clienteId,
          ventaId: ventaRef.id,
          archivo: pago.comprobanteArchivo,
        });
      } catch (errorComprobante) {
        console.error(
          "No se pudo subir el comprobante del pago inicial:",
          errorComprobante
        );

        comprobanteError = "No se pudo adjuntar el comprobante.";
      }
    }
    const pagoData = {
      clienteId: perfil.clienteId,
      sucursalId,
      sucursalNombre,
      ventaRefId: ventaRef.id,
      numeroVenta,
      fechaPago: pago.fechaPago || fechaVenta,
      fechaComprobanteReal: pago.fechaComprobanteReal || "",
      monto: Number(pago.monto || 0),
      medioPago: pago.medioPago || "efectivo",
      observacion: pago.observacion || "Pago inicial",

      comprobante,
      comprobanteError,

      estadoPagoRegistro: "activo",
      motivoAnulacion: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

      const pagoRef = await addDoc(
        collection(db, "ventas", ventaRef.id, "pagos"),
        pagoData
      );

      try {
        await obtenerOAsignarNumeroRecibo({
          perfil,
          ventaId: ventaRef.id,
          pagoId: pagoRef.id,
        });
      } catch (errorRecibo) {
        console.error(
          "El pago inicial fue creado, pero no se pudo asignar número de recibo:",
          errorRecibo
        );
      }

      await addDoc(collection(db, "movimientos"), {
        clienteId: perfil.clienteId,
        sucursalId,
        sucursalNombre,
        tipo: "ingreso",
        subtipo: "cobro_venta",
        origen: "venta_pago",
        origenRefId: ventaRef.id,
        pagoRefId: "",
        descripcion: `Cobro venta #${numeroVenta} - ${cliente.nombre || ""}`,
        monto: Number(pago.monto || 0),
        medioPago: pago.medioPago || "efectivo",
        fecha: pago.fechaPago || fechaVenta,

        impactaCaja: (pago.medioPago || "efectivo") === "efectivo",
        impactaResultado: false,
        estadoMovimiento: "activo",
        activo: true,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  await addDoc(collection(db, "movimientos"), {
    clienteId: perfil.clienteId,
    sucursalId,
    sucursalNombre,
    tipo: "ingreso",
    subtipo: "venta",
    origen: "venta",
    origenRefId: ventaRef.id,
    descripcion: `Venta #${numeroVenta} - ${cliente.nombre || ""}`,
    monto: Number(total || 0),
    medioPago: "cuenta_corriente",
    fecha: fechaVenta,

    impactaCaja: false,
    impactaResultado: true,
    estadoMovimiento: "activo",
    activo: true,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (pedidoAsociado?.firebaseId) {
    await updateDoc(doc(db, "pedidos", pedidoAsociado.firebaseId), {
      ventaRefId: ventaRef.id,
      ventaVisibleId: numeroVenta,
      ventaEstado: "activa",
      updatedAt: serverTimestamp(),
    });
  }

  return {
    firebaseId: ventaRef.id,
    ...ventaData,
  };
}

export async function agregarPagoAVenta({
  perfil,
  venta,
  monto,
  fechaPago,
  medioPago,
  observacion = "",
  fechaComprobanteReal = "",
  comprobanteArchivo = null,
}) {
  const montoNum = Number(monto || 0);
  if (!venta?.firebaseId) throw new Error("Venta inválida.");
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a 0.");

  const sucursalId = venta?.sucursalId || perfil?.sucursalDefaultId || "principal";
  const sucursalNombre =
    venta?.sucursalNombre ||
    perfil?.sucursalDefaultNombre ||
    "Sucursal principal";
  
  const comprobante = comprobanteArchivo
  ? await subirComprobantePago({
      clienteId: perfil.clienteId,
      ventaId: venta.firebaseId,
      archivo: comprobanteArchivo,
    })
  : null;  

  const pagoRef = await addDoc(
    collection(db, "ventas", venta.firebaseId, "pagos"),
    {
    clienteId: perfil.clienteId,
    sucursalId,
    sucursalNombre,
    ventaRefId: venta.firebaseId,
    numeroVenta: venta.numeroVenta,
    fechaPago,
    fechaComprobanteReal: fechaComprobanteReal || "",

    monto: montoNum,
    medioPago: medioPago || "efectivo",
    observacion,

    comprobante,

    estadoPagoRegistro: "activo",
    motivoAnulacion: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    
  });

  try {
  await obtenerOAsignarNumeroRecibo({
    perfil,
    ventaId: venta.firebaseId,
    pagoId: pagoRef.id,
  });
} catch (errorRecibo) {
  console.error(
    "El pago fue creado, pero no se pudo asignar número de recibo:",
    errorRecibo
  );
}

await addDoc(collection(db, "movimientos"), {
  clienteId: perfil.clienteId,
  sucursalId,
  sucursalNombre,
  tipo: "ingreso",
  subtipo: "cobro_venta",
  origen: "venta_pago",
  origenRefId: venta.firebaseId,
  descripcion: `Cobro venta #${venta.numeroVenta} - ${venta.clienteNombre || ""}`,
  monto: montoNum,
  medioPago: medioPago || "efectivo",
  fecha: fechaPago,

  impactaCaja: (medioPago || "efectivo") === "efectivo",
  impactaResultado: false,
  estadoMovimiento: "activo",
  activo: true,

  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

    await recalcularTotalesVenta(venta.firebaseId);
}

export async function obtenerVentasPaginadas({ perfil, ultimoDoc = null, pageSize = 50 }) {
  const ventasRef = collection(db, "ventas");

  const q =
    perfil?.rol === "superadmin"
      ? ultimoDoc
        ? query(ventasRef, orderBy("createdAt", "desc"), startAfter(ultimoDoc), limit(pageSize))
        : query(ventasRef, orderBy("createdAt", "desc"), limit(pageSize))
      : ultimoDoc
      ? query(
          ventasRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          startAfter(ultimoDoc),
          limit(pageSize)
        )
      : query(
          ventasRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );

  const snapshot = await getDocs(q);

  return {
    ventas: snapshot.docs.map((d) => ({ firebaseId: d.id, ...d.data() })),
    ultimoDoc: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
    hayMas: snapshot.docs.length === pageSize,
  };
}

export async function buscarVentasGlobales({
  perfil,
  textoBusqueda,
  incluirDiagnostico = false,
}) {
  const textoOriginal = String(textoBusqueda || "").trim();
  const vacio = { ventas: [], consultasFallidas: [], limiteAlcanzado: false };

  if (!textoOriginal) {
    return incluirDiagnostico ? vacio : [];
  }

  if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
    return incluirDiagnostico ? vacio : [];
  }

  const ventasRef = collection(db, "ventas");

  const consultas = [];
  const agregarConsulta = (campo, ...constraints) => {
    // También aislamos errores síncronos de construcción de cada consulta.
    consultas.push({
      campo,
      promesa: Promise.resolve().then(() =>
        getDocs(crearQueryTenant(...constraints, limit(50)))
      ),
    });
  };

  const crearQueryTenant = (...constraints) => {
    if (perfil?.rol === "superadmin") {
      return query(
        ventasRef,
        ...constraints
      );
    }

    return query(
      ventasRef,
      where("clienteId", "==", perfil.clienteId),
      ...constraints
    );
  };

  /*
   * N° de venta.
   *
   * numeroVenta actualmente se guarda como string.
   */
  // Solo admitimos la variante numérica si no cambia el formato ni la precisión.
  const numeroSeguro = /^(0|[1-9]\d*)$/.test(textoOriginal) &&
    Number.isSafeInteger(Number(textoOriginal)) &&
    String(Number(textoOriginal)) === textoOriginal;
  agregarConsulta(
    "numeroVenta",
    numeroSeguro
      ? where("numeroVenta", "in", [textoOriginal, Number(textoOriginal)])
      : where("numeroVenta", "==", textoOriginal)
  );

  /*
   * Documento / DNI.
   */
  agregarConsulta("clienteDNI", where("clienteDNI", "==", textoOriginal));

  /*
   * Pedido asociado.
   */
  agregarConsulta("pedidoVisibleId", where("pedidoVisibleId", "==", textoOriginal));

  /*
   * Cliente.
   *
   * Firestore no soporta "contains" ni búsqueda
   * case-insensitive de forma nativa.
   *
   * Con la estructura actual podemos hacer búsqueda
   * por comienzo del nombre.
   */
  const textoNormalizado = textoOriginal.toLowerCase();
  agregarConsulta(
    "clienteNombreBusqueda",
    orderBy("clienteNombreBusqueda"),
    where("clienteNombreBusqueda", ">=", textoNormalizado),
    where("clienteNombreBusqueda", "<=", textoNormalizado + "\uf8ff")
  );
  // Compatibilidad sin backfill: preservamos la consulta anterior sobre el nombre
  // comercial. En históricos sin campo derivado sigue siendo sensible al caso.
  agregarConsulta(
    "clienteNombre",
    orderBy("clienteNombre"),
    where("clienteNombre", ">=", textoOriginal),
    where("clienteNombre", "<=", textoOriginal + "\uf8ff")
  );

  const resultados = await Promise.allSettled(consultas.map((c) => c.promesa));

  const mapa = new Map();
  const consultasFallidas = [];
  let limiteAlcanzado = false;

  resultados.forEach((resultado, index) => {
    if (resultado.status !== "fulfilled") {
      consultasFallidas.push({
        campo: consultas[index].campo,
        codigo: resultado.reason?.code || "unknown",
      });
      console.warn(
        `Falló la búsqueda de ventas por ${consultas[index].campo}:`,
        resultado.reason
      );
      return;
    }

    if (resultado.value.docs.length === 50) limiteAlcanzado = true;
    resultado.value.docs.forEach((docu) => {
      mapa.set(docu.id, {
        firebaseId: docu.id,
        ...docu.data(),
      });
    });
  });

  const ventas = Array.from(mapa.values()).sort((a, b) => {
    const fechaA =
      a.createdAt?.toMillis?.() || 0;

    const fechaB =
      b.createdAt?.toMillis?.() || 0;

    return fechaB - fechaA;
  });
  return incluirDiagnostico
    ? { ventas, consultasFallidas, limiteAlcanzado }
    : ventas;
}

export async function obtenerPagosDeVenta(ventaId) {
  const pagosRef = collection(db, "ventas", ventaId, "pagos");
  const q = query(pagosRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));
}

export async function obtenerOAsignarNumeroRecibo({
  perfil,
  ventaId,
  pagoId,
}) {
  if (!perfil?.clienteId) {
    throw new Error("Perfil inválido.");
  }

  if (!ventaId || !pagoId) {
    throw new Error("Faltan datos del pago.");
  }

  const clienteSaasRef = doc(
    db,
    "clientes-saas",
    perfil.clienteId
  );

  const pagoRef = doc(
    db,
    "ventas",
    ventaId,
    "pagos",
    pagoId
  );

  const numeroRecibo = await runTransaction(
    db,
    async (transaction) => {
      const [clienteSnap, pagoSnap] = await Promise.all([
        transaction.get(clienteSaasRef),
        transaction.get(pagoRef),
      ]);

      if (!clienteSnap.exists()) {
        throw new Error("No existe el cliente SaaS asociado.");
      }

      if (!pagoSnap.exists()) {
        throw new Error("El pago no existe.");
      }

      const pagoData = pagoSnap.data();

      if (pagoData.clienteId !== perfil.clienteId) {
        throw new Error(
          "El pago no pertenece a la empresa."
        );
      }

      /*
       * Si el pago ya tiene recibo, devolvemos exactamente
       * el mismo número. Nunca generamos otro.
       */
      if (pagoData.numeroRecibo) {
        return String(pagoData.numeroRecibo);
      }

      const clienteData = clienteSnap.data();

      const ultimoNumeroRecibo = Number(
        clienteData.ultimoNumeroRecibo || 0
      );

      const siguienteNumero =
        ultimoNumeroRecibo + 1;

      transaction.update(clienteSaasRef, {
        ultimoNumeroRecibo: siguienteNumero,
        updatedAt: serverTimestamp(),
      });

      transaction.update(pagoRef, {
        numeroRecibo: siguienteNumero.toString(),
        numeroReciboAsignadoAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return siguienteNumero.toString();
    }
  );

  return numeroRecibo;
}

export async function adjuntarComprobanteAPago({
  perfil,
  ventaId,
  pagoId,
  archivo,
}) {
  if (!perfil?.clienteId) {
    throw new Error("Perfil inválido.");
  }

  if (!ventaId || !pagoId) {
    throw new Error("Faltan datos del pago.");
  }

  if (!archivo) {
    throw new Error("Falta seleccionar el comprobante.");
  }

  const pagoRef = doc(db, "ventas", ventaId, "pagos", pagoId);

  const pagoSnap = await getDoc(pagoRef);

  if (!pagoSnap.exists()) {
    throw new Error("El pago no existe.");
  }

  const pagoData = pagoSnap.data();

  if (pagoData.clienteId !== perfil.clienteId) {
    throw new Error("El pago no pertenece a la empresa.");
  }

  const comprobante = await subirComprobantePago({
    clienteId: perfil.clienteId,
    ventaId,
    archivo,
  });

  await updateDoc(pagoRef, {
    comprobante,
    comprobanteError: "",
    updatedAt: serverTimestamp(),
  });

  return comprobante;
}

export async function obtenerItemsDeVenta(ventaId) {
  const itemsRef = collection(db, "ventas", ventaId, "items");
  const q = query(itemsRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));
}

export async function obtenerVentaPorId(ventaId) {
  const ventaRef = doc(db, "ventas", ventaId);
  const snap = await getDoc(ventaRef);

  if (!snap.exists()) {
    throw new Error("La venta no existe.");
  }

  return {
    firebaseId: snap.id,
    ...snap.data(),
  };
}

export async function actualizarPedidoAsociadoDeVenta({
  ventaId,
  pedidoAsociado,
}) {
  const ventaRef = doc(db, "ventas", ventaId);
  const ventaSnap = await getDoc(ventaRef);

  if (!ventaSnap.exists()) {
    throw new Error("La venta no existe.");
  }

  const ventaActual = ventaSnap.data();
  const pedidoAnteriorRefId = ventaActual.pedidoRefId || "";

  // 1) actualizar la venta
  await updateDoc(ventaRef, {
    pedidoRefId: pedidoAsociado?.firebaseId || "",
    pedidoVisibleId: pedidoAsociado?.id || "",
    origenVenta: pedidoAsociado ? "pedido" : "manual",
    updatedAt: serverTimestamp(),
  });

  // 2) limpiar pedido anterior si cambió
  if (pedidoAnteriorRefId && pedidoAnteriorRefId !== pedidoAsociado?.firebaseId) {
    await updateDoc(doc(db, "pedidos", pedidoAnteriorRefId), {
      ventaRefId: "",
      ventaVisibleId: "",
      ventaEstado: "",
      updatedAt: serverTimestamp(),
    });
  }

  // 3) actualizar nuevo pedido si hay uno seleccionado
  if (pedidoAsociado?.firebaseId) {
    await updateDoc(doc(db, "pedidos", pedidoAsociado.firebaseId), {
      ventaRefId: ventaId,
      ventaVisibleId: ventaActual.numeroVenta || "",
      ventaEstado: ventaActual.estadoVenta || "activa",
      updatedAt: serverTimestamp(),
    });
  }
}

export async function agregarItemAVenta({
  perfil,
  venta,
  descripcion,
  cantidad,
  precioUnitario,
  excluirDescuento = false,

  origenPrecio = "manual",
  listaPrecioId = "",
  listaPrecioNombre = "",
  productoListaNombre = "",
  productoBaseId = "",
  varianteId = "",
  varianteNombre = "",
  imagenUrl = "",
  imagenThumb = "",
  reglaCantidad = null,
  adicionalesSeleccionados = [],
  precioDetalleInterno = null,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!venta?.firebaseId) throw new Error("Venta inválida.");

  const cantidadNum = Number(cantidad || 0);
  const precioNum = Number(precioUnitario || 0);

  if (!descripcion?.trim()) {
    throw new Error("La descripción es obligatoria.");
  }

  if (cantidadNum <= 0) {
    throw new Error("La cantidad debe ser mayor a 0.");
  }

  if (precioNum < 0) {
    throw new Error("El precio unitario no puede ser negativo.");
  }

  const subtotal = cantidadNum * precioNum;

  await addDoc(
    collection(db, "ventas", venta.firebaseId, "items"),
    {
      clienteId: perfil.clienteId,
      ventaRefId: venta.firebaseId,
      numeroVenta: venta.numeroVenta,

      descripcion: descripcion.trim(),
      cantidad: cantidadNum,
      precioUnitario: precioNum,
      subtotal,

      excluirDescuento: excluirDescuento === true,

      origenPrecio: origenPrecio || "manual",
      listaPrecioId: listaPrecioId || "",
      listaPrecioNombre: listaPrecioNombre || "",
      productoListaNombre: productoListaNombre || "",
      productoBaseId: productoBaseId || "",
      varianteId: varianteId || "",
      varianteNombre: varianteNombre || "",

      imagenUrl: imagenUrl || "",
      imagenThumb: imagenThumb || "",

      reglaCantidad: reglaCantidad || null,
      adicionalesSeleccionados: Array.isArray(adicionalesSeleccionados)
        ? adicionalesSeleccionados
        : [],
      precioDetalleInterno: precioDetalleInterno || null,

      origenItem: "agregado",
      estadoItem: "activo",
      motivoAnulacion: "",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  await recalcularTotalesVenta(venta.firebaseId);
}

export async function agregarPagoPosteriorAVenta({
  perfil,
  venta,
  monto,
  medioPago,
  fechaPago,
  fechaComprobanteReal = "",
  observacion = "",
  comprobanteArchivo = null,
}) {
  return agregarPagoAVenta({
    perfil,
    venta,
    monto,
    medioPago,
    fechaPago,
    fechaComprobanteReal,
    observacion:
      observacion || "Pago agregado posteriormente",
    comprobanteArchivo,
  });
}

async function recalcularTotalesVenta(ventaId) {
  const ventaRef = doc(db, "ventas", ventaId);

  const [ventaSnap, itemsSnap, pagosSnap] = await Promise.all([
    getDoc(ventaRef),
    getDocs(collection(db, "ventas", ventaId, "items")),
    getDocs(collection(db, "ventas", ventaId, "pagos")),
  ]);

  if (!ventaSnap.exists()) {
    throw new Error("La venta no existe para recalcular.");
  }

  const ventaData = ventaSnap.data();

  const itemsActivos = itemsSnap.docs
    .map((d) => ({ firebaseId: d.id, ...d.data() }))
    .filter((item) => (item.estadoItem || "activo") === "activo");

  const pagosActivos = pagosSnap.docs
    .map((d) => ({ firebaseId: d.id, ...d.data() }))
    .filter((pago) => (pago.estadoPagoRegistro || "activo") === "activo");

  const subtotal = itemsActivos.reduce(
    (acc, item) => acc + Number(item.subtotal || 0),
    0
  );

  const totalPagado = pagosActivos.reduce(
    (acc, pago) => acc + Number(pago.monto || 0),
    0
  );

  const subtotalAplicableDescuento = itemsActivos
    .filter((item) => item.excluirDescuento !== true)
    .reduce(
      (acc, item) => acc + Number(item.subtotal || 0),
      0
    );

  const descuentoPorcentaje = Number(
    ventaData.descuentoPorcentaje || 0
  );

  const descuento =
    descuentoPorcentaje > 0
      ? subtotalAplicableDescuento * (descuentoPorcentaje / 100)
      : Number(ventaData.descuento || 0);

  const total = subtotal - descuento;
  const saldoPendiente = total - totalPagado < 0 ? 0 : total - totalPagado;
  const saldoAFavor = totalPagado > total ? totalPagado - total : 0;

  let estadoPago = "pendiente";
  if (totalPagado > 0 && saldoPendiente > 0) estadoPago = "parcial";
  if (saldoPendiente <= 0 && total > 0) estadoPago = "pagado";

  const cantidad = itemsActivos.reduce(
    (acc, item) => acc + Number(item.cantidad || 0),
    0
  );

  await updateDoc(ventaRef, {
    cantidad,
    subtotal,
    descuento,
    total,
    totalPagado,
    saldoPendiente,
    saldoAFavor,
    estadoPago,
    updatedAt: serverTimestamp(),
  });

  const movVentaSnap = await getDocs(
    query(
      collection(db, "movimientos"),
      where("clienteId", "==", ventaData.clienteId),
      where("origen", "==", "venta"),
      where("origenRefId", "==", ventaId),
      where("subtipo", "==", "venta")
    )
  );

  for (const movDoc of movVentaSnap.docs) {
    await updateDoc(doc(db, "movimientos", movDoc.id), {
      monto: Number(total || 0),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function anularItemDeVenta({
  perfil,
  ventaId,
  itemId,
  motivoAnulacion = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!ventaId || !itemId) throw new Error("Faltan datos para anular el ítem.");

  const itemRef = doc(db, "ventas", ventaId, "items", itemId);

  await updateDoc(itemRef, {
    estadoItem: "anulado",
    motivoAnulacion,
    anuladoAt: serverTimestamp(),
    anuladoPor: perfil?.email || "",
    updatedAt: serverTimestamp(),
  });

  await recalcularTotalesVenta(ventaId);
}

export async function anularPagoDeVenta({
  perfil,
  ventaId,
  pagoId,
  motivoAnulacion = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!ventaId || !pagoId) throw new Error("Faltan datos para anular el pago.");

  const pagoRef = doc(db, "ventas", ventaId, "pagos", pagoId);

  await updateDoc(pagoRef, {
    estadoPagoRegistro: "anulado",
    motivoAnulacion,
    anuladoAt: serverTimestamp(),
    anuladoPor: perfil?.email || "",
    updatedAt: serverTimestamp(),
  });

  await recalcularTotalesVenta(ventaId);
}

export async function anularVenta({
  perfil,
  ventaId,
  motivoAnulacion = "",
}) {
  if (!perfil?.clienteId) {
    throw new Error("Perfil inválido.");
  }

  if (!ventaId) {
    throw new Error("Falta ventaId.");
  }

  const ventaRef = doc(db, "ventas", ventaId);
  const ventaSnap = await getDoc(ventaRef);

  if (!ventaSnap.exists()) {
    throw new Error("La venta no existe.");
  }

  const ventaData = ventaSnap.data();

  if (ventaData.clienteId !== perfil.clienteId) {
    throw new Error(
      "La venta no pertenece a la empresa del usuario autenticado."
    );
  }

  if ((ventaData.estadoVenta || "activa") === "anulada") {
    throw new Error("La venta ya está anulada.");
  }

  /*
   * Buscamos TODOS los movimientos vinculados a la venta.
   *
   * Esto incluye:
   * - movimiento comercial de la venta;
   * - cobros iniciales;
   * - cobros posteriores;
   * - movimientos de efectivo que impactaron Caja.
   */
  const movSnap = await getDocs(
    query(
      collection(db, "movimientos"),
      where("clienteId", "==", perfil.clienteId),
      where("origenRefId", "==", ventaId)
    )
  );

  /*
   * También anulamos los registros de pago de la subcolección
   * para mantener consistencia y auditoría.
   */
  const pagosSnap = await getDocs(
    collection(db, "ventas", ventaId, "pagos")
  );

  const batch = writeBatch(db);

  batch.update(ventaRef, {
    estadoVenta: "anulada",
    motivoAnulacion,
    anuladaAt: serverTimestamp(),
    anuladaPor:
      perfil?.uid ||
      perfil?.firebaseUid ||
      perfil?.email ||
      "",
    anuladaPorNombre: perfil?.nombre || perfil?.email || "",
    updatedAt: serverTimestamp(),
  });

  movSnap.docs.forEach((movDoc) => {
    batch.update(doc(db, "movimientos", movDoc.id), {
      estadoMovimiento: "anulado",
      activo: false,
      anuladoAt: serverTimestamp(),
      anuladoPor:
        perfil?.uid ||
        perfil?.firebaseUid ||
        perfil?.email ||
        "",
      anuladoPorNombre: perfil?.nombre || perfil?.email || "",
      motivoAnulacion,
      updatedAt: serverTimestamp(),
    });
  });

  pagosSnap.docs.forEach((pagoDoc) => {
    const pagoData = pagoDoc.data();

    if ((pagoData.estadoPagoRegistro || "activo") !== "activo") {
      return;
    }

    batch.update(
      doc(db, "ventas", ventaId, "pagos", pagoDoc.id),
      {
        estadoPagoRegistro: "anulado",
        motivoAnulacion,
        anuladoAt: serverTimestamp(),
        anuladoPor:
          perfil?.uid ||
          perfil?.firebaseUid ||
          perfil?.email ||
          "",
        anuladoPorNombre: perfil?.nombre || perfil?.email || "",
        updatedAt: serverTimestamp(),
      }
    );
  });

  /*
   * Primero anulamos la venta, sus pagos y sus movimientos.
   *
   * El pedido NO forma parte de este batch porque puede haber
   * sido eliminado y no debe bloquear la anulación de la venta.
   */
  await batch.commit();

  /*
   * Si todavía existe un pedido asociado, intentamos actualizarlo.
   *
   * Es una operación secundaria:
   * si el pedido fue eliminado o no puede actualizarse, la venta
   * ya quedó anulada correctamente y no debemos revertirla.
   */
  if (ventaData.pedidoRefId) {
    try {
      await updateDoc(
        doc(db, "pedidos", ventaData.pedidoRefId),
        {
          ventaEstado: "anulada",
          updatedAt: serverTimestamp(),
        }
      );
    } catch (pedidoError) {
      console.warn(
        "La venta fue anulada, pero el pedido asociado no pudo actualizarse.",
        {
          ventaId,
          numeroVenta: ventaData.numeroVenta || "",
          pedidoRefId: ventaData.pedidoRefId,
          code: pedidoError?.code || "",
          message: pedidoError?.message || "",
        }
      );
    }
  }
}

export function escucharVentasRecientes({
  perfil,
  pageSize = 100,
  onData,
  onError,
}) {
  const ventasRef = collection(db, "ventas");

  const q =
    perfil?.rol === "superadmin"
      ? query(ventasRef, orderBy("createdAt", "desc"), limit(pageSize))
      : query(
          ventasRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );

  return onSnapshot(
    q,
    (snapshot) => {
      onData({
        ventas: snapshot.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        })),
        ultimoDoc: snapshot.docs.length
          ? snapshot.docs[snapshot.docs.length - 1]
          : null,
        hayMas: snapshot.docs.length === pageSize,
      });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}
