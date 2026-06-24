import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const PROVEEDORES_COLLECTION = "proveedores";

export function escucharProveedores({
  perfil,
  pageSize = 100,
  rubro = "",
  busqueda = "",
  onData,
  onError,
}) {
  if (!perfil?.clienteId) return () => {};

  const filtros = [
    where("clienteId", "==", perfil.clienteId),
    orderBy("nombre", "asc"),
    limit(pageSize),
  ];

  const q = query(collection(db, PROVEEDORES_COLLECTION), ...filtros);

  return onSnapshot(
    q,
    (snap) => {
      let proveedores = snap.docs.map((d) => ({
        firebaseId: d.id,
        ...d.data(),
      }));

      if (rubro) {
        proveedores = proveedores.filter((p) =>
          Array.isArray(p.rubros) ? p.rubros.includes(rubro) : false
        );
      }

      const texto = String(busqueda || "").trim().toLowerCase();

      if (texto) {
        proveedores = proveedores.filter((p) => {
          return (
            String(p.nombre || "").toLowerCase().includes(texto) ||
            String(p.cuit || "").toLowerCase().includes(texto) ||
            String(p.telefono || "").toLowerCase().includes(texto) ||
            String(p.email || "").toLowerCase().includes(texto) ||
            String(p.web || "").toLowerCase().includes(texto) ||
            String(p.localidad || "").toLowerCase().includes(texto) ||
            String(p.provincia || "").toLowerCase().includes(texto) ||
            (Array.isArray(p.rubros) &&
              p.rubros.some((r) =>
                String(r || "").toLowerCase().includes(texto)
              ))
          );
        });
      }

      if (onData) onData(proveedores);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function crearProveedor({ perfil, proveedor }) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");

  const nombre = String(proveedor?.nombre || "").trim();

  if (!nombre) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  const data = {
    clienteId: perfil.clienteId,
    nombre,
    cuit: String(proveedor?.cuit || "").trim(),
    telefono: String(proveedor?.telefono || "").trim(),
    email: String(proveedor?.email || "").trim(),
    web: String(proveedor?.web || "").trim(),
    direccion: String(proveedor?.direccion || "").trim(),
    localidad: String(proveedor?.localidad || "").trim(),
    provincia: String(proveedor?.provincia || "").trim(),
    rubros: Array.isArray(proveedor?.rubros) ? proveedor.rubros : [],
    observaciones: String(proveedor?.observaciones || "").trim(),
    activo: true,
    estado: "activo",
    creadoPor: perfil.uid || perfil.firebaseUid || "",
    creadoPorNombre: perfil.nombre || perfil.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const refDoc = await addDoc(collection(db, PROVEEDORES_COLLECTION), data);

  return {
    firebaseId: refDoc.id,
    ...data,
  };
}

export async function actualizarProveedor({ perfil, proveedorId, proveedor }) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!proveedorId) throw new Error("Falta proveedorId.");

  const nombre = String(proveedor?.nombre || "").trim();

  if (!nombre) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  await updateDoc(doc(db, PROVEEDORES_COLLECTION, proveedorId), {
    nombre,
    cuit: String(proveedor?.cuit || "").trim(),
    telefono: String(proveedor?.telefono || "").trim(),
    email: String(proveedor?.email || "").trim(),
    web: String(proveedor?.web || "").trim(),
    direccion: String(proveedor?.direccion || "").trim(),
    localidad: String(proveedor?.localidad || "").trim(),
    provincia: String(proveedor?.provincia || "").trim(),
    rubros: Array.isArray(proveedor?.rubros) ? proveedor.rubros : [],
    observaciones: String(proveedor?.observaciones || "").trim(),
    clienteId: perfil.clienteId,
    updatedAt: serverTimestamp(),
  });
}

export async function cambiarEstadoProveedor({ perfil, proveedor }) {
  if (!perfil?.clienteId) throw new Error("No se encontró clienteId.");
  if (!proveedor?.firebaseId) throw new Error("Falta proveedorId.");

  const activoNuevo = proveedor.activo === false;

  await updateDoc(doc(db, PROVEEDORES_COLLECTION, proveedor.firebaseId), {
    activo: activoNuevo,
    estado: activoNuevo ? "activo" : "inactivo",
    updatedAt: serverTimestamp(),
  });
}