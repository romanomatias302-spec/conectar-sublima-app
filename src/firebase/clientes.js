import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const CLIENTES_COLLECTION = "clientes";

export function normalizarTextoCliente(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizarDniCliente(valor) {
  return String(valor || "").trim();
}

function obtenerClienteIdPerfil(perfil) {
  const clienteId = String(perfil?.clienteId || "").trim();

  if (!clienteId) {
    throw new Error("No se encontró el clienteId del usuario.");
  }

  return clienteId;
}

export async function buscarClientePorDni({
  perfil,
  dni,
  excluirFirebaseId = "",
}) {
  const clienteId = obtenerClienteIdPerfil(perfil);
  const dniNormalizado = normalizarDniCliente(dni);

  if (!dniNormalizado) return null;

  const clientesRef = collection(db, CLIENTES_COLLECTION);

  const consultas = [
    query(
      clientesRef,
      where("clienteId", "==", clienteId),
      where("dni", "==", dniNormalizado),
      limit(5)
    ),
  ];

  const dniNumerico = Number(dniNormalizado);

  if (
    Number.isFinite(dniNumerico) &&
    String(dniNumerico) === dniNormalizado
  ) {
    consultas.push(
      query(
        clientesRef,
        where("clienteId", "==", clienteId),
        where("dni", "==", dniNumerico),
        limit(5)
      )
    );
  }

  const resultados = await Promise.all(
    consultas.map((consulta) => getDocs(consulta))
  );

  const encontrados = new Map();

  resultados.forEach((snapshot) => {
    snapshot.docs.forEach((documento) => {
      if (documento.id === excluirFirebaseId) return;

      encontrados.set(documento.id, {
        firebaseId: documento.id,
        ...documento.data(),
      });
    });
  });

  return Array.from(encontrados.values())[0] || null;
}

function prepararDatosCliente({ perfil, datos }) {
  const clienteId = obtenerClienteIdPerfil(perfil);

  const nombre = String(datos?.nombre || "").trim();
  const dni = normalizarDniCliente(datos?.dni);

  return {
    nombre,
    nombreBusqueda: normalizarTextoCliente(nombre),
    dni,
    telefono: String(datos?.telefono || "").trim(),
    direccion: String(datos?.direccion || "").trim(),
    localidad: String(datos?.localidad || "").trim(),
    provincia: String(datos?.provincia || "").trim(),
    email: String(datos?.email || "").trim(),
    clienteId,
  };
}

export async function crearCliente({
  perfil,
  datos,
  validarDniDuplicado = true,
}) {
  const datosNormalizados = prepararDatosCliente({
    perfil,
    datos,
  });

  if (!datosNormalizados.nombre) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  if (
    validarDniDuplicado &&
    datosNormalizados.dni
  ) {
    const existente = await buscarClientePorDni({
      perfil,
      dni: datosNormalizados.dni,
    });

    if (existente) {
      const error = new Error("DNI_DUPLICADO");
      error.code = "DNI_DUPLICADO";
      error.clienteExistente = existente;
      throw error;
    }
  }

  const datosFirestore = {
    ...datosNormalizados,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(
    collection(db, CLIENTES_COLLECTION),
    datosFirestore
  );

  return {
    firebaseId: ref.id,
    ...datosNormalizados,
  };
}

export async function actualizarCliente({
  perfil,
  firebaseId,
  datos,
  validarDniDuplicado = true,
}) {
  if (!firebaseId) {
    throw new Error("No se encontró el cliente a actualizar.");
  }

  const datosNormalizados = prepararDatosCliente({
    perfil,
    datos,
  });

  if (!datosNormalizados.nombre) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  if (
    validarDniDuplicado &&
    datosNormalizados.dni
  ) {
    const existente = await buscarClientePorDni({
      perfil,
      dni: datosNormalizados.dni,
      excluirFirebaseId: firebaseId,
    });

    if (existente) {
      const error = new Error("DNI_DUPLICADO");
      error.code = "DNI_DUPLICADO";
      error.clienteExistente = existente;
      throw error;
    }
  }

  await updateDoc(
    doc(db, CLIENTES_COLLECTION, firebaseId),
    {
      ...datosNormalizados,
      updatedAt: serverTimestamp(),
    }
  );

  return {
    firebaseId,
    ...datosNormalizados,
  };
}