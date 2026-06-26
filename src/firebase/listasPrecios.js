import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

const listasRef = () => collection(db, "listasPrecios");

export async function obtenerListasPrecios(clienteId) {
  if (!clienteId) return [];

  const q = query(
    listasRef(),
    where("clienteId", "==", clienteId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));
}

export async function crearListaPrecio(perfil, datos) {
  if (!perfil?.clienteId) throw new Error("Falta clienteId");

  return addDoc(listasRef(), {
    clienteId: perfil.clienteId,
    nombre: datos.nombre || "",
    descripcion: datos.descripcion || "",
    moneda: perfil.moneda || "ARS",
    activa: true,
    predeterminada: false,
    productos: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    creadoPor: perfil.uid || perfil.firebaseUid || "",
  });
}

export async function actualizarListaPrecio(listaId, datos) {
  if (!listaId) throw new Error("Falta listaId");

  return updateDoc(doc(db, "listasPrecios", listaId), {
    ...datos,
    updatedAt: serverTimestamp(),
  });
}

export async function eliminarListaPrecio(listaId) {
  if (!listaId) throw new Error("Falta listaId");
  return deleteDoc(doc(db, "listasPrecios", listaId));
}

export async function obtenerProductosBase(clienteId) {
  if (!clienteId) return [];

  const q = query(
    collection(db, "productosBase"),
    where("clienteId", "==", clienteId)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    firebaseId: d.id,
    ...d.data(),
  }));
}


export async function marcarListaPrecioPredeterminada(clienteId, listaId) {
  if (!clienteId) throw new Error("Falta clienteId");
  if (!listaId) throw new Error("Falta listaId");

  const q = query(
    listasRef(),
    where("clienteId", "==", clienteId)
  );

  const snap = await getDocs(q);
  const batch = writeBatch(db);

  snap.docs.forEach((docu) => {
    batch.update(doc(db, "listasPrecios", docu.id), {
      predeterminada: docu.id === listaId,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function duplicarListaPrecio(perfil, lista) {
  if (!perfil?.clienteId) throw new Error("Falta clienteId");
  if (!lista) throw new Error("Falta lista");

  const nombreBase = lista.nombre || "Lista";
  const nombreDuplicado = `${nombreBase} copia`;

  return addDoc(listasRef(), {
    clienteId: perfil.clienteId,
    nombre: nombreDuplicado,
    descripcion: lista.descripcion || "",
    moneda: lista.moneda || perfil.moneda || "ARS",
    activa: true,
    predeterminada: false,

    productos: Array.isArray(lista.productos)
      ? lista.productos.map((producto) => ({
          ...producto,
          activo: producto.activo !== false,
          reglasCantidad: Array.isArray(producto.reglasCantidad)
            ? producto.reglasCantidad.map((regla) => ({ ...regla }))
            : [],
          adicionales: Array.isArray(producto.adicionales)
            ? producto.adicionales.map((adicional) => ({ ...adicional }))
            : [],
        }))
      : [],

    origenDuplicadoId: lista.firebaseId || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    creadoPor: perfil.uid || perfil.firebaseUid || "",
  });
}