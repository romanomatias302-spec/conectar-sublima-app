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
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { crearVenta } from "./ventas";

export async function obtenerSiguienteNumeroCotizacion(clienteId) {
  if (!clienteId) {
    throw new Error("Falta clienteId para generar número de cotización.");
  }

  const clienteSaasRef = doc(db, "clientes-saas", clienteId);

  const nuevoNumero = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(clienteSaasRef);

    if (!snap.exists()) {
      throw new Error("No existe el cliente SaaS asociado.");
    }

    const data = snap.data();
    const ultimoNumeroCotizacion = Number(data.ultimoNumeroCotizacion || 0);
    const siguienteNumero = ultimoNumeroCotizacion + 1;

    transaction.update(clienteSaasRef, {
      ultimoNumeroCotizacion: siguienteNumero,
      updatedAt: serverTimestamp(),
    });

    return siguienteNumero;
  });

  return nuevoNumero.toString();
}

function normalizarItemsCotizacion(items = []) {
  return Array.isArray(items)
    ? items
      .map((item) => ({
        firebaseId: item.firebaseId || "",
        descripcion: (item.descripcion || "").trim(),
        cantidad: Number(item.cantidad || 0),
        precioUnitario: Number(item.precioUnitario || 0),
        excluirDescuento: item.excluirDescuento === true,

        origenPrecio: item.origenPrecio || "manual",
        listaPrecioId: item.listaPrecioId || "",
        listaPrecioNombre: item.listaPrecioNombre || "",
        productoListaNombre: item.productoListaNombre || "",
        productoBaseId: item.productoBaseId || "",
        imagenUrl: item.imagenUrl || "",
        imagenThumb: item.imagenThumb || "",
        reglaCantidad: item.reglaCantidad || null,
        adicionalesSeleccionados: item.adicionalesSeleccionados || [],
        precioDetalleInterno: item.precioDetalleInterno || null,
      }))
        .filter(
          (item) =>
            item.descripcion &&
            item.cantidad > 0 &&
            item.precioUnitario >= 0
        )
        .map((item) => ({
          ...item,
          subtotal: item.cantidad * item.precioUnitario,
        }))
    : [];
}

export async function crearCotizacion({
  perfil,
  cliente,
  fechaCotizacion,
  fechaValidez = "",
  items = [],
  descuento = 0,
  notas = "",
  vendedor = null,
}) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!cliente?.firebaseId) throw new Error("Falta cliente seleccionado.");

  const itemsNormalizados = normalizarItemsCotizacion(items);

  if (!itemsNormalizados.length) {
    throw new Error("Debés agregar al menos un ítem válido.");
  }

  const numeroCotizacion = await obtenerSiguienteNumeroCotizacion(
    perfil.clienteId
  );

  const subtotal = itemsNormalizados.reduce(
    (acc, item) => acc + Number(item.subtotal || 0),
    0
  );

  const total = subtotal - Number(descuento || 0);

  const descripcionResumen =
    itemsNormalizados.length === 1
      ? itemsNormalizados[0].descripcion
      : `${itemsNormalizados.length} ítems`;

  const cotizacionData = {
    numeroCotizacion,
    clienteId: perfil.clienteId,

    fechaCotizacion,
    fechaValidez: fechaValidez || "",
    clienteRefId: cliente.firebaseId,
    clienteNombre: cliente.nombre || "",
    clienteDNI: cliente.dni || "",
    clienteTelefono: cliente.telefono || "",

    vendedorUid: vendedor?.uid || "",
    vendedorNombre: vendedor?.nombre || "",
    vendedorEmail: vendedor?.email || "",

    descripcion: descripcionResumen,
    notas: notas || "",

    cantidad: itemsNormalizados.reduce(
      (acc, item) => acc + Number(item.cantidad || 0),
      0
    ),
    subtotal,
    descuento: Number(descuento || 0),
    total,

    estadoCotizacion: "borrador",
    convertidaAVenta: false,
    ventaRefId: "",
    ventaVisibleId: "",

    anuladaAt: null,
    anuladaPor: "",
    motivoAnulacion: "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const cotizacionRef = await addDoc(
    collection(db, "cotizaciones"),
    cotizacionData
  );

  for (const item of itemsNormalizados) {
    await addDoc(collection(db, "cotizaciones", cotizacionRef.id, "items"), {
      clienteId: perfil.clienteId,
      cotizacionRefId: cotizacionRef.id,
      numeroCotizacion,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      subtotal: item.subtotal,
      excluirDescuento: item.excluirDescuento === true,
      origenPrecio: item.origenPrecio,
      listaPrecioId: item.listaPrecioId,
      listaPrecioNombre: item.listaPrecioNombre,
      productoListaNombre: item.productoListaNombre,
      productoBaseId: item.productoBaseId,
      imagenUrl: item.imagenUrl,
      imagenThumb: item.imagenThumb,
      reglaCantidad: item.reglaCantidad,
      adicionalesSeleccionados: item.adicionalesSeleccionados,
      precioDetalleInterno: item.precioDetalleInterno,
      estadoItem: "activo",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return {
    firebaseId: cotizacionRef.id,
    ...cotizacionData,
  };
}

export async function obtenerCotizacionesPaginadas({
  perfil,
  ultimoDoc = null,
  pageSize = 50,
}) {
  const cotizacionesRef = collection(db, "cotizaciones");

  const q =
    perfil?.rol === "superadmin"
      ? ultimoDoc
        ? query(
            cotizacionesRef,
            orderBy("createdAt", "desc"),
            startAfter(ultimoDoc),
            limit(pageSize)
          )
        : query(cotizacionesRef, orderBy("createdAt", "desc"), limit(pageSize))
      : ultimoDoc
      ? query(
          cotizacionesRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          startAfter(ultimoDoc),
          limit(pageSize)
        )
      : query(
          cotizacionesRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );

  const snapshot = await getDocs(q);

  return {
    cotizaciones: snapshot.docs.map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    })),
    ultimoDoc: snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null,
    hayMas: snapshot.docs.length === pageSize,
  };
}

export async function obtenerCotizacionPorId(cotizacionId) {
  const ref = doc(db, "cotizaciones", cotizacionId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("La cotización no existe.");
  }

  return {
    firebaseId: snap.id,
    ...snap.data(),
  };
}

export async function obtenerItemsDeCotizacion(cotizacionId) {
  const itemsRef = collection(db, "cotizaciones", cotizacionId, "items");
  const q = query(itemsRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);

return snapshot.docs
  .map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }))
  .filter((item) => (item.estadoItem || "activo") === "activo");
}

export async function convertirCotizacionAVenta({
  perfil,
  cotizacion,
  items,
  pagosIniciales = [],
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!cotizacion?.firebaseId) throw new Error("Cotización inválida.");

  if (cotizacion.convertidaAVenta) {
    throw new Error("Esta cotización ya fue convertida a venta.");
  }

  if ((cotizacion.estadoCotizacion || "") === "anulada") {
    throw new Error("No se puede convertir una cotización anulada.");
  }

  const cliente = {
    firebaseId: cotizacion.clienteRefId,
    nombre: cotizacion.clienteNombre || "",
    dni: cotizacion.clienteDNI || "",
    telefono: cotizacion.clienteTelefono || "",
  };

  const nuevaVenta = await crearVenta({
    perfil,
    cliente,
    fechaVenta: new Date().toISOString().split("T")[0],
    items,
    descuento: Number(cotizacion.descuento || 0),
    pedidoAsociado: null,
    vendedor: {
      uid: cotizacion.vendedorUid || "",
      nombre: cotizacion.vendedorNombre || "",
      email: cotizacion.vendedorEmail || "",
    },
    pagosIniciales,
    observaciones: cotizacion.notas || "",
  });

  await updateDoc(doc(db, "cotizaciones", cotizacion.firebaseId), {
    estadoCotizacion: "convertida",
    convertidaAVenta: true,
    ventaRefId: nuevaVenta.firebaseId,
    ventaVisibleId: nuevaVenta.numeroVenta || "",
    updatedAt: serverTimestamp(),
  });

  return nuevaVenta;
}

export async function anularCotizacion({
  perfil,
  cotizacionId,
  motivoAnulacion = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!cotizacionId) throw new Error("Falta cotización.");

  await updateDoc(doc(db, "cotizaciones", cotizacionId), {
    estadoCotizacion: "anulada",
    motivoAnulacion,
    anuladaPor: perfil?.email || "",
    anuladaAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

}

export async function actualizarCotizacion({
  perfil,
  cotizacion,
  fechaValidez = "",
  items = [],
  descuento = 0,
  notas = "",
  vendedor = null,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!cotizacion?.firebaseId) throw new Error("Cotización inválida.");

  if (cotizacion.convertidaAVenta) {
    throw new Error("No se puede editar una cotización convertida a venta.");
  }

  if ((cotizacion.estadoCotizacion || "") === "anulada") {
    throw new Error("No se puede editar una cotización anulada.");
  }

  const itemsNormalizados = normalizarItemsCotizacion(items);

  if (!itemsNormalizados.length) {
    throw new Error("Debés agregar al menos un ítem válido.");
  }

  const subtotal = itemsNormalizados.reduce(
    (acc, item) => acc + Number(item.subtotal || 0),
    0
  );

  const total = subtotal - Number(descuento || 0);

  const descripcionResumen =
    itemsNormalizados.length === 1
      ? itemsNormalizados[0].descripcion
      : `${itemsNormalizados.length} ítems`;

  const batch = writeBatch(db);

  const cotizacionRef = doc(db, "cotizaciones", cotizacion.firebaseId);

  batch.update(cotizacionRef, {
    fechaValidez: fechaValidez || "",
    descripcion: descripcionResumen,
    notas: notas || "",
    cantidad: itemsNormalizados.reduce(
      (acc, item) => acc + Number(item.cantidad || 0),
      0
    ),
    subtotal,
    descuento: Number(descuento || 0),
    total,

    vendedorUid: vendedor?.uid || "",
    vendedorNombre: vendedor?.nombre || "",
    vendedorEmail: vendedor?.email || "",

    updatedAt: serverTimestamp(),
  });

  const itemsActualesSnap = await getDocs(
    collection(db, "cotizaciones", cotizacion.firebaseId, "items")
  );

  const itemsActuales = itemsActualesSnap.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));

  const idsQueSiguenActivos = itemsNormalizados
    .filter((item) => item.firebaseId)
    .map((item) => item.firebaseId);

  itemsActuales.forEach((itemActual) => {
    const estaActivo = (itemActual.estadoItem || "activo") === "activo";
    const sigueEnLaEdicion = idsQueSiguenActivos.includes(itemActual.firebaseId);

    if (estaActivo && !sigueEnLaEdicion) {
      const itemRef = doc(
        db,
        "cotizaciones",
        cotizacion.firebaseId,
        "items",
        itemActual.firebaseId
      );

      batch.update(itemRef, {
        
        estadoItem: "anulado",
        updatedAt: serverTimestamp(),
      });
    }
  });

  itemsNormalizados.forEach((item) => {
    if (item.firebaseId) {
      const itemRef = doc(
        db,
        "cotizaciones",
        cotizacion.firebaseId,
        "items",
        item.firebaseId
      );

      batch.update(itemRef, {
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        excluirDescuento: item.excluirDescuento === true,
        origenPrecio: item.origenPrecio,
        listaPrecioId: item.listaPrecioId,
        listaPrecioNombre: item.listaPrecioNombre,
        productoListaNombre: item.productoListaNombre,
        productoBaseId: item.productoBaseId,
        imagenUrl: item.imagenUrl,
        imagenThumb: item.imagenThumb,
        reglaCantidad: item.reglaCantidad,
        adicionalesSeleccionados: item.adicionalesSeleccionados,
        precioDetalleInterno: item.precioDetalleInterno,
        estadoItem: "activo",
        updatedAt: serverTimestamp(),
      });

      return;
    }

    const nuevoItemRef = doc(
      collection(db, "cotizaciones", cotizacion.firebaseId, "items")
    );

    batch.set(nuevoItemRef, {
      clienteId: perfil.clienteId,
      cotizacionRefId: cotizacion.firebaseId,
      numeroCotizacion: cotizacion.numeroCotizacion,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      subtotal: item.subtotal,
      excluirDescuento: item.excluirDescuento === true,
      origenPrecio: item.origenPrecio,
      listaPrecioId: item.listaPrecioId,
      listaPrecioNombre: item.listaPrecioNombre,
      productoListaNombre: item.productoListaNombre,
      productoBaseId: item.productoBaseId,
      imagenUrl: item.imagenUrl,
      imagenThumb: item.imagenThumb,
      reglaCantidad: item.reglaCantidad,
      adicionalesSeleccionados: item.adicionalesSeleccionados,
      precioDetalleInterno: item.precioDetalleInterno,
      estadoItem: "activo",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function marcarCotizacionConvertida({
  cotizacionId,
  venta,
}) {
  if (!cotizacionId) throw new Error("Falta cotización.");
  if (!venta?.firebaseId) throw new Error("Falta venta creada.");

  await updateDoc(doc(db, "cotizaciones", cotizacionId), {
    estadoCotizacion: "convertida",
    convertidaAVenta: true,
    ventaRefId: venta.firebaseId,
    ventaVisibleId: venta.numeroVenta || "",
    updatedAt: serverTimestamp(),
  });
}

export async function buscarCotizacionesEnFirestore({
  perfil,
  texto = "",
  pageSize = 50,
}) {
  const textoLimpio = String(texto || "").trim();

  if (!textoLimpio) {
    return [];
  }

  const cotizacionesRef = collection(db, "cotizaciones");

  let q;

  if (/^\d+$/.test(textoLimpio)) {
    q =
      perfil?.rol === "superadmin"
        ? query(
            cotizacionesRef,
            where("numeroCotizacion", "==", textoLimpio),
            limit(pageSize)
          )
        : query(
            cotizacionesRef,
            where("clienteId", "==", perfil.clienteId),
            where("numeroCotizacion", "==", textoLimpio),
            limit(pageSize)
          );
  } else {
    q =
      perfil?.rol === "superadmin"
        ? query(
            cotizacionesRef,
            orderBy("clienteNombre"),
            where("clienteNombre", ">=", textoLimpio),
            where("clienteNombre", "<=", textoLimpio + "\uf8ff"),
            limit(pageSize)
          )
        : query(
            cotizacionesRef,
            where("clienteId", "==", perfil.clienteId),
            orderBy("clienteNombre"),
            where("clienteNombre", ">=", textoLimpio),
            where("clienteNombre", "<=", textoLimpio + "\uf8ff"),
            limit(pageSize)
          );
  }

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));
}

export function escucharCotizacionesRecientes({
  perfil,
  pageSize = 50,
  onData,
  onError,
}) {
  const cotizacionesRef = collection(db, "cotizaciones");

  const q =
    perfil?.rol === "superadmin"
      ? query(
          cotizacionesRef,
          orderBy("createdAt", "desc"),
          limit(pageSize)
        )
      : query(
          cotizacionesRef,
          where("clienteId", "==", perfil.clienteId),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );

  return onSnapshot(
    q,
    (snapshot) => {
      onData({
        cotizaciones: snapshot.docs.map((d) => ({
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