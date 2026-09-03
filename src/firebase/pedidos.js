import {
  addDoc,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  writeBatch,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";

import { db } from "../firebase";

import {
  asegurarColumnasBaseProduccion,
  obtenerColumnaInicialProduccion,
} from "./produccionColumnas";

import { registrarUsoSaas } from "./saasUso";

export async function buscarPedidosGlobales({ perfil, texto, pageSize = 50 }) {
  const textoLimpio = String(texto || "").trim();
  if (!textoLimpio || (!perfil?.clienteId && perfil?.rol !== "superadmin")) {
    return [];
  }

  const ref = collection(db, "pedidos");
  const crearQueryTenant = (...restricciones) =>
    perfil?.rol === "superadmin"
      ? query(ref, ...restricciones, limit(pageSize))
      : query(
          ref,
          where("clienteId", "==", perfil.clienteId),
          ...restricciones,
          limit(pageSize)
        );
  const consultas = [];
  const numero = Number(textoLimpio);
  const numeroSeguro =
    /^(0|[1-9]\d*)$/.test(textoLimpio) &&
    Number.isSafeInteger(numero) &&
    String(numero) === textoLimpio;

  ["id", "numeroPedido", "numero"].forEach((campo) => {
    consultas.push(
      getDocs(
        crearQueryTenant(
          numeroSeguro
            ? where(campo, "in", [textoLimpio, numero])
            : where(campo, "==", textoLimpio)
        )
      )
    );
  });
  consultas.push(
    getDocs(crearQueryTenant(where("clienteDNI", "==", textoLimpio)))
  );

  const nombre = textoLimpio.toLowerCase();
  consultas.push(
    getDocs(
      crearQueryTenant(
        orderBy("clienteBusqueda"),
        where("clienteBusqueda", ">=", nombre),
        where("clienteBusqueda", "<=", nombre + "\uf8ff")
      )
    )
  );

  const resultados = await Promise.allSettled(consultas);
  const mapa = new Map();
  let exitosas = 0;
  resultados.forEach((resultado) => {
    if (resultado.status !== "fulfilled") {
      console.warn("Falló una consulta parcial de pedidos:", resultado.reason);
      return;
    }
    exitosas += 1;
    resultado.value.docs.forEach((documento) => {
      mapa.set(documento.id, { firebaseId: documento.id, ...documento.data() });
    });
  });

  if (!exitosas) throw new Error("No se pudo completar la búsqueda de pedidos.");
  return Array.from(mapa.values());
}

export async function obtenerPedidosFiltradosPaginados({
  perfil,
  ultimoDoc = null,
  pageSize = 100,
  coincide = () => true,
}) {
  if (!perfil?.clienteId && perfil?.rol !== "superadmin") {
    return { pedidos: [], ultimoDoc: null, hayMas: false };
  }

  const ref = collection(db, "pedidos");
  const resultados = [];
  let cursor = ultimoDoc;
  let recorridoCompleto = false;
  const scanPageSize = Math.max(pageSize, 100);

  while (resultados.length < pageSize && !recorridoCompleto) {
    const consulta = query(
      ref,
      ...(perfil?.rol === "superadmin"
        ? []
        : [where("clienteId", "==", perfil.clienteId)]),
      orderBy("createdAt", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(scanPageSize)
    );
    const snapshot = await getDocs(consulta);
    let detenidoPorLimite = false;

    for (const documento of snapshot.docs) {
      cursor = documento;
      const pedido = { firebaseId: documento.id, ...documento.data() };
      if (coincide(pedido)) resultados.push(pedido);
      if (resultados.length === pageSize) {
        detenidoPorLimite = true;
        break;
      }
    }

    recorridoCompleto =
      !detenidoPorLimite &&
      (snapshot.docs.length === 0 || snapshot.docs.length < scanPageSize);
  }

  return {
    pedidos: resultados,
    ultimoDoc: cursor,
    hayMas: !recorridoCompleto,
  };
}

async function obtenerSiguienteNumeroPedido(perfil) {
  if (!perfil?.clienteId) {
    throw new Error(
      "No se encontró clienteId para generar el número de pedido."
    );
  }

  const clienteSaasRef = doc(
    db,
    "clientes-saas",
    perfil.clienteId
  );

  const nuevoNumero = await runTransaction(
    db,
    async (transaction) => {
      const clienteSnap =
        await transaction.get(clienteSaasRef);

      if (!clienteSnap.exists()) {
        throw new Error(
          "No existe el cliente SaaS asociado."
        );
      }

      const data = clienteSnap.data();

      const ultimoNumeroPedido = Number(
        data.ultimoNumeroPedido || 0
      );

      const siguienteNumero =
        ultimoNumeroPedido + 1;

      transaction.update(clienteSaasRef, {
        ultimoNumeroPedido: siguienteNumero,
        updatedAt: serverTimestamp(),
      });

      return siguienteNumero;
    }
  );

  return nuevoNumero.toString();
}

export async function crearPedidoBase({
  perfil,
  clienteNombre,
  clienteDNI = "",
  fechaPedido,
  fechaEntrega = "",
  origen = "",
  ventaRefId = "",
  ventaVisibleId = "",
}) {
  if (!perfil) {
    throw new Error(
      "No se encontró el perfil del usuario."
    );
  }

  if (!clienteNombre) {
    throw new Error(
      "El cliente es obligatorio."
    );
  }

  if (!fechaPedido) {
    throw new Error(
      "La fecha del pedido es obligatoria."
    );
  }

  if (
    perfil.rol !== "superadmin" &&
    !perfil.clienteId
  ) {
    throw new Error(
      "No se encontró el clienteId del usuario."
    );
  }

  const nuevoID =
    perfil.rol === "superadmin"
      ? Date.now().toString()
      : await obtenerSiguienteNumeroPedido(perfil);

  await asegurarColumnasBaseProduccion(
    perfil?.clienteId || ""
  );

  const columnaInicial =
    await obtenerColumnaInicialProduccion(
      perfil?.clienteId || ""
    );

  if (!columnaInicial) {
    throw new Error(
      "No se encontró la columna inicial de producción."
    );
  }

  const nuevoPedidoData = {
    id: nuevoID,

    cliente: clienteNombre,
    clienteBusqueda: String(clienteNombre)
      .trim()
      .toLowerCase(),

    clienteDNI: clienteDNI || "",

    fechaPedido,
    fechaEntrega: fechaEntrega || "",

    estado: "Pendiente",

    clienteId: perfil?.clienteId || "",

    sucursalId:
      perfil?.sucursalDefaultId ||
      "principal",

    sucursalNombre:
      perfil?.sucursalDefaultNombre ||
      "Sucursal principal",

    creadoPorUid:
      perfil?.uid ||
      perfil?.firebaseUid ||
      "",

    creadoPorNombre:
      perfil?.nombre ||
      perfil?.displayName ||
      perfil?.email ||
      "",

    creadoPorEmail:
      perfil?.email || "",

    usuarioNombre:
      perfil?.nombre ||
      perfil?.displayName ||
      perfil?.email ||
      "",

    cantidadItems: 0,
    totalUnidades: 0,
    montoTotal: 0,
    estadoPago: "Pendiente",

    columnaProduccionId:
      columnaInicial.id,

    progresoProduccion: 0,
    estadoProduccion: "pendiente",
    produccionFinalizada: false,

    produccionActualizadoAt:
      serverTimestamp(),

    ultimaAccionProduccionPor: null,
    ultimaAccionProduccionPorNombre: null,
    ultimaAccionProduccionAt: null,

    ...(origen
      ? {
          origen,
        }
      : {}),

    ...(ventaRefId
      ? {
          ventaRefId,
          ventaVisibleId:
            ventaVisibleId || "",
        }
      : {}),

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(
    collection(db, "pedidos"),
    nuevoPedidoData
  );

  await registrarUsoSaas({
    clienteId: perfil?.clienteId,
    pedidos: 1,
  });

  return {
    firebaseId: docRef.id,
    ...nuevoPedidoData,
  };
}

export async function crearProductosPedidoDesdeVenta({
  pedidoId,
  ventaId,
  itemsVenta,
  perfil,
}) {
  if (!pedidoId) {
    throw new Error(
      "No se encontró el pedido para importar productos."
    );
  }

  if (!Array.isArray(itemsVenta)) {
    return {
      creados: 0,
    };
  }

  const productosImportables = itemsVenta.filter(
    (item) =>
      (item?.estadoItem || "activo") === "activo" &&
      item?.origenPrecio === "lista_precio" &&
      String(item?.productoBaseId || "").trim() !== ""
  );

  if (!productosImportables.length) {
    return {
      creados: 0,
    };
  }

  const productosRef = collection(
    db,
    `pedidos/${pedidoId}/productos`
  );

  const batch = writeBatch(db);

  productosImportables.forEach((item) => {
    const productoRef = doc(productosRef);

    batch.set(productoRef, {
      producto:
        item.productoBaseId || "",

      productoNombre:
        item.productoListaNombre ||
        item.descripcion ||
        "Producto",

      /*
       * El producto nace limpio para Producción.
       * No trasladamos cantidades comerciales.
       */
      cantidad: 0,
      totalTalles: 0,

      color: "",
      detalle: "",

      zonas: {},
      talles: {},
      detallePorTalle: {},
      atributosExtra: {},
      detallesCostura: {},

      imagenes: [
        {
          url: "",
          tipo: "link",
          portada: false,
        },
      ],

      ordenTalles: [],

      clienteId:
        perfil?.clienteId || "",

      /*
       * Trazabilidad.
       * Estos campos no afectan el formulario
       * normal del producto.
       */
      origen: "venta",

      ventaRefId:
        ventaId || "",

      ventaItemRefId:
        item.firebaseId || "",

      listaPrecioId:
        item.listaPrecioId || "",

      listaPrecioNombre:
        item.listaPrecioNombre || "",

      varianteId:
        item.varianteId || "",

      varianteNombre:
        item.varianteNombre || "",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();

  return {
    creados: productosImportables.length,
  };
}
