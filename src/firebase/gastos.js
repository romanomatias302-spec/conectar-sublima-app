import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  onSnapshot,
  runTransaction,
  increment,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "../firebase";

const GASTOS_COLLECTION = "gastos";
async function obtenerSiguienteNumeroGasto(clienteId) {
  const contadorRef = doc(db, "contadores", clienteId);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);

    const actual = snap.exists()
      ? Number(snap.data().ultimoNumeroGasto || 0)
      : 0;

    const siguiente = actual + 1;

    transaction.set(
      contadorRef,
      {
        clienteId,
        ultimoNumeroGasto: siguiente,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return siguiente;
  });
}

async function subirComprobantes({ clienteId, archivos = [] }) {
  const archivosSubidos = [];

  for (const comp of archivos) {
    if (!comp?.archivo) {
      archivosSubidos.push(comp);
      continue;
    }

    const path = `clientes/${clienteId}/gastos/comprobantes/${Date.now()}-${comp.nombre}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, comp.archivo);
    const url = await getDownloadURL(storageRef);

    archivosSubidos.push({
      id: comp.id,
      nombre: comp.nombre,
      tipo: comp.tipo || "",
      size: comp.size || 0,
      path,
      url,
    });
  }

  return archivosSubidos;
}

export async function crearGasto({ perfil, gasto }) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  const numeroGasto = await obtenerSiguienteNumeroGasto(perfil.clienteId);

  const comprobantes = await subirComprobantes({
    clienteId: perfil.clienteId,
    archivos: gasto.comprobantes || [],
  });

  const data = {
    ...gasto,
    numeroGasto,
    comprobantes,
    clienteId: perfil.clienteId,
    estado: "activo",
    activo: true,
    creadoPor: perfil.uid || perfil.firebaseUid || "",
    creadoPorNombre: perfil.nombre || perfil.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const refDoc = await addDoc(collection(db, GASTOS_COLLECTION), data);

  await addDoc(collection(db, "movimientos"), {
    clienteId: perfil.clienteId,
    tipo: "egreso",
    subtipo: "gasto",
    origen: "gasto",
    origenRefId: refDoc.id,
    descripcion: `Gasto #${numeroGasto} - ${gasto.categoria || ""} - ${gasto.descripcion || ""}`,
    monto: Number(gasto.total || gasto.monto || 0),
    medioPago: gasto.pagos?.[0]?.medioPago || "",
    fecha: gasto.fecha,
    estadoMovimiento: "activo",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    firebaseId: refDoc.id,
    ...data,
  };
}

export async function actualizarGasto({ perfil, gastoId, gasto }) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!gastoId) throw new Error("Falta gastoId.");

  const comprobantes = await subirComprobantes({
    clienteId: perfil.clienteId,
    archivos: gasto.comprobantes || [],
  });

  await updateDoc(doc(db, GASTOS_COLLECTION, gastoId), {
    ...gasto,
    comprobantes,
    clienteId: perfil.clienteId,
    updatedAt: serverTimestamp(),
  });
}

export async function anularGasto({ perfil, gastoId, motivo = "" }) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!gastoId) throw new Error("Falta gastoId.");

  await updateDoc(doc(db, GASTOS_COLLECTION, gastoId), {
    activo: false,
    estado: "anulado",
    motivoAnulacion: motivo,
    anuladoAt: serverTimestamp(),
    anuladoPor: perfil.uid || perfil.firebaseUid || "",
    updatedAt: serverTimestamp(),
  });
}

export async function duplicarGasto({ perfil, gasto }) {
  const copia = {
    ...gasto,
    fecha: new Date().toISOString().split("T")[0],
    comprobantes: [],
    estado: "activo",
    activo: true,
  };

  delete copia.firebaseId;
  delete copia.id;
  delete copia.createdAt;
  delete copia.updatedAt;

  return crearGasto({ perfil, gasto: copia });
}

export async function obtenerGastosPaginados({
  perfil,
  ultimoDoc = null,
  pageSize = 50,
  categoria = "",
  fechaDesde = "",
  fechaHasta = "",
}) {
  if (!perfil?.clienteId) {
    return { gastos: [], ultimoDoc: null, hayMas: false };
  }

  const filtros = [
    where("clienteId", "==", perfil.clienteId),
    orderBy("fecha", "desc"),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  ];

  if (categoria) {
    filtros.unshift(where("categoria", "==", categoria));
  }

  if (fechaDesde) {
    filtros.unshift(where("fecha", ">=", fechaDesde));
  }

  if (fechaHasta) {
    filtros.unshift(where("fecha", "<=", fechaHasta));
  }

  const q = ultimoDoc
    ? query(
        collection(db, GASTOS_COLLECTION),
        ...filtros.slice(0, -1),
        startAfter(ultimoDoc),
        limit(pageSize)
      )
    : query(collection(db, GASTOS_COLLECTION), ...filtros);

  const snap = await getDocs(q);

  return {
    gastos: snap.docs.map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    })),
    ultimoDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    hayMas: snap.docs.length === pageSize,
  };
}

export function escucharGastosRecientes({
  perfil,
  pageSize = 50,
  categoria = "",
  fechaDesde = "",
  fechaHasta = "",
  onData,
  onError,
}) {
  if (!perfil?.clienteId) return () => {};

  const filtros = [
    where("clienteId", "==", perfil.clienteId),
  ];

  if (categoria) filtros.push(where("categoria", "==", categoria));
  if (fechaDesde) filtros.push(where("fecha", ">=", fechaDesde));
  if (fechaHasta) filtros.push(where("fecha", "<=", fechaHasta));

  filtros.push(orderBy("fecha", "desc"));
  filtros.push(orderBy("createdAt", "desc"));
  filtros.push(limit(pageSize));

  const q = query(collection(db, "gastos"), ...filtros);

  return onSnapshot(
    q,
    (snap) => {
      onData({
        gastos: snap.docs.map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        })),
        ultimoDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
        hayMas: snap.docs.length === pageSize,
      });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}