import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const USUARIOS_COLLECTION = "usuarios";

export function escucharUsuariosActivosPorCliente(clienteId, callback) {
  if (!clienteId) return () => {};

  const q = query(
    collection(db, USUARIOS_COLLECTION),
    where("clienteId", "==", clienteId),
    where("activo", "==", true)
  );

  const unsubscribe = onSnapshot(q, (snap) => {
    const usuarios = snap.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    usuarios.sort((a, b) => {
      const nombreA = (a.nombre || "").toLowerCase();
      const nombreB = (b.nombre || "").toLowerCase();
      return nombreA.localeCompare(nombreB);
    });

    callback(usuarios);
  });

  return unsubscribe;
}