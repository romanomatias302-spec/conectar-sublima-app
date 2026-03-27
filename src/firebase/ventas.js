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
} from "firebase/firestore";
import { db } from "../firebase";

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

function normalizarItems({ items = [], descripcion = "", cantidad = 0, precioUnitario = 0 }) {
  const itemsValidos = Array.isArray(items)
    ? items
        .map((item) => ({
          descripcion: (item.descripcion || "").trim(),
          cantidad: Number(item.cantidad || 0),
          precioUnitario: Number(item.precioUnitario || 0),
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
  pedidoAsociado = null,
  pagosIniciales = [],
  observaciones = "",
}) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!cliente?.firebaseId) throw new Error("Falta cliente seleccionado.");

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
          observacion: pago.observacion || "",
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
    fechaVenta,
    clienteRefId: cliente.firebaseId,
    clienteNombre: cliente.nombre || "",
    clienteDNI: cliente.dni || "",

    origenVenta: pedidoAsociado ? "pedido" : "manual",
    pedidoRefId: pedidoAsociado?.firebaseId || "",
    pedidoVisibleId: pedidoAsociado?.id || "",

    descripcion: descripcionResumen,
    observaciones: observaciones || "",

    cantidad: itemsNormalizados.reduce((acc, item) => acc + item.cantidad, 0),
    precioUnitario: itemsNormalizados.length === 1 ? itemsNormalizados[0].precioUnitario : 0,
    subtotal,
    descuento: Number(descuento || 0),
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

  for (const item of itemsNormalizados) {
      await addDoc(collection(db, "ventas", ventaRef.id, "items"), {
        clienteId: perfil.clienteId,
        ventaRefId: ventaRef.id,
        numeroVenta,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        origenItem: "inicial",
        estadoItem: "activo",
        motivoAnulacion: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
  }

  if (pagosNormalizados.length > 0) {
    for (const pago of pagosNormalizados) {
      const pagoData = {
        clienteId: perfil.clienteId,
        ventaRefId: ventaRef.id,
        numeroVenta,
        fechaPago: pago.fechaPago || fechaVenta,
        fechaComprobanteReal: pago.fechaComprobanteReal || "",
        monto: Number(pago.monto || 0),
        medioPago: pago.medioPago || "efectivo",
        observacion: pago.observacion || "Pago inicial",
        estadoPagoRegistro: "activo",
        motivoAnulacion: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "ventas", ventaRef.id, "pagos"), pagoData);

      await addDoc(collection(db, "movimientos"), {
        clienteId: perfil.clienteId,
        tipo: "ingreso",
        subtipo: "venta",
        origen: "venta",
        origenRefId: ventaRef.id,
        descripcion: `Pago venta #${numeroVenta} - ${cliente.nombre || ""}`,
        monto: Number(pago.monto || 0),
        medioPago: pago.medioPago || "efectivo",
        fecha: pago.fechaPago || fechaVenta,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

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
}) {
  const montoNum = Number(monto || 0);
  if (!venta?.firebaseId) throw new Error("Venta inválida.");
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (montoNum <= 0) throw new Error("El monto debe ser mayor a 0.");

  await addDoc(collection(db, "ventas", venta.firebaseId, "pagos"), {
    clienteId: perfil.clienteId,
    ventaRefId: venta.firebaseId,
    numeroVenta: venta.numeroVenta,
    fechaPago,
    fechaComprobanteReal: arguments[0]?.fechaComprobanteReal || "",
    monto: montoNum,
    medioPago: medioPago || "efectivo",
    observacion,
    estadoPagoRegistro: "activo",
    motivoAnulacion: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, "movimientos"), {
    clienteId: perfil.clienteId,
    tipo: "ingreso",
    subtipo: "venta",
    origen: "venta",
    origenRefId: venta.firebaseId,
    descripcion: `Pago venta #${venta.numeroVenta} - ${venta.clienteNombre || ""}`,
    monto: montoNum,
    medioPago: medioPago || "efectivo",
    fecha: fechaPago,
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

export async function obtenerPagosDeVenta(ventaId) {
  const pagosRef = collection(db, "ventas", ventaId, "pagos");
  const q = query(pagosRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));
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
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!venta?.firebaseId) throw new Error("Venta inválida.");

  const cantidadNum = Number(cantidad || 0);
  const precioNum = Number(precioUnitario || 0);

  if (!descripcion?.trim()) throw new Error("La descripción es obligatoria.");
  if (cantidadNum <= 0) throw new Error("La cantidad debe ser mayor a 0.");
  if (precioNum < 0) throw new Error("El precio unitario no puede ser negativo.");

  const subtotal = cantidadNum * precioNum;

  await addDoc(collection(db, "ventas", venta.firebaseId, "items"), {
    clienteId: perfil.clienteId,
    ventaRefId: venta.firebaseId,
    numeroVenta: venta.numeroVenta,
    descripcion: descripcion.trim(),
    cantidad: cantidadNum,
    precioUnitario: precioNum,
    subtotal,
    origenItem: "agregado",
    estadoItem: "activo",
    motivoAnulacion: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

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
}) {
  return agregarPagoAVenta({
    perfil,
    venta,
    monto,
    medioPago,
    fechaPago,
    fechaComprobanteReal,
    observacion: observacion || "Pago agregado posteriormente",
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

  const descuento = Number(ventaData.descuento || 0);
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
    total,
    totalPagado,
    saldoPendiente,
    saldoAFavor,
    estadoPago,
    updatedAt: serverTimestamp(),
  });
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
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!ventaId) throw new Error("Falta ventaId.");

  const ventaRef = doc(db, "ventas", ventaId);
  const ventaSnap = await getDoc(ventaRef);

  if (!ventaSnap.exists()) {
    throw new Error("La venta no existe.");
  }

  const ventaData = ventaSnap.data();

  if ((ventaData.estadoVenta || "activa") === "anulada") {
    throw new Error("La venta ya está anulada.");
  }

  await updateDoc(ventaRef, {
    estadoVenta: "anulada",
    motivoAnulacion,
    anuladaAt: serverTimestamp(),
    anuladaPor: perfil?.email || "",
    updatedAt: serverTimestamp(),
  });

  if (ventaData.pedidoRefId) {
    await updateDoc(doc(db, "pedidos", ventaData.pedidoRefId), {
      ventaEstado: "anulada",
      updatedAt: serverTimestamp(),
    });
  }
}