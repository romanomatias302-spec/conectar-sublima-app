import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  startAt,
  endAt,
  startAfter,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

export function fechaHoyInput(timezone = "America/Argentina/Buenos_Aires") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}



const SUCURSAL_PRINCIPAL_ID = "principal";

function normalizarSucursal(sucursal) {
  const esPrincipal =
    sucursal?.esPrincipal === true ||
    sucursal?.codigo === SUCURSAL_PRINCIPAL_ID ||
    String(sucursal?.firebaseId || "").endsWith("_principal") ||
    String(sucursal?.id || "").endsWith("_principal");

  return {
    sucursalId: esPrincipal
      ? SUCURSAL_PRINCIPAL_ID
      : sucursal?.firebaseId || sucursal?.id || SUCURSAL_PRINCIPAL_ID,
    sucursalNombre: sucursal?.nombre || "Sucursal principal",
  };
}

function cajaPerteneceASucursal(caja, sucursalId) {
  const cajaSucursalId = String(caja?.sucursalId || "");

  const cajaEsPrincipal =
    !cajaSucursalId ||
    cajaSucursalId === SUCURSAL_PRINCIPAL_ID ||
    cajaSucursalId.endsWith("_principal");

  if (sucursalId === SUCURSAL_PRINCIPAL_ID) {
    return cajaEsPrincipal;
  }

  return cajaSucursalId === sucursalId;
}

function movimientoPerteneceASucursal(mov, sucursalId) {
  const movSucursalId = String(mov?.sucursalId || "");

  const movEsPrincipal =
    !movSucursalId ||
    movSucursalId === SUCURSAL_PRINCIPAL_ID ||
    movSucursalId.endsWith("_principal");

  if (sucursalId === SUCURSAL_PRINCIPAL_ID) {
    return movEsPrincipal;
  }

  return movSucursalId === sucursalId;
}

export async function obtenerCajaDelDia({
  perfil,
  fechaCaja = fechaHoyInput(),
  sucursal = null,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const { sucursalId } = normalizarSucursal(sucursal);

  const filtros = [
    where("clienteId", "==", perfil.clienteId),
    where("fechaCaja", "==", fechaCaja),
  ];

  if (sucursalId !== SUCURSAL_PRINCIPAL_ID) {
    filtros.push(where("sucursalId", "==", sucursalId));
  }

  const q = query(collection(db, "cajas"), ...filtros);
  const snap = await getDocs(q);

  const caja = snap.docs
    .map((d) => ({ firebaseId: d.id, ...d.data() }))
    .find((c) => cajaPerteneceASucursal(c, sucursalId));

  return caja || null;
}

export function escucharCajaDelDia({
  perfil,
  fechaCaja = fechaHoyInput(),
  sucursal = null,
  onData,
  onError,
}) {
  if (!perfil?.clienteId) return () => {};

  const { sucursalId } = normalizarSucursal(sucursal);

  const filtros = [
    where("clienteId", "==", perfil.clienteId),
    where("fechaCaja", "==", fechaCaja),
  ];

  if (sucursalId !== SUCURSAL_PRINCIPAL_ID) {
    filtros.push(where("sucursalId", "==", sucursalId));
  }

  const q = query(collection(db, "cajas"), ...filtros);

  return onSnapshot(
    q,
    (snap) => {
      const caja = snap.docs
        .map((d) => ({ firebaseId: d.id, ...d.data() }))
        .find((c) => cajaPerteneceASucursal(c, sucursalId));

      onData(caja || null);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function obtenerUltimaCajaCerradaAnterior({
  perfil,
  fechaCaja = fechaHoyInput(),
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  let cursor = null;
  let hayMas = true;

  while (hayMas) {
    const q = query(
      collection(db, "cajas"),
      where("clienteId", "==", perfil.clienteId),
      where("fechaCaja", "<", fechaCaja),
      orderBy("fechaCaja", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(60)
    );
    const snap = await getDocs(q);
    const cajaCerrada = snap.docs
      .map((d) => ({ firebaseId: d.id, ...d.data() }))
      .find((caja) => caja.estado === "cerrada");
    if (cajaCerrada) return cajaCerrada;

    cursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    hayMas = snap.docs.length === 60 && Boolean(cursor);
  }

  return null;
}

export async function obtenerUltimaCajaAnteriorConSaldo({
  perfil,
  fechaCaja = fechaHoyInput(),
  sucursal = null,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const { sucursalId } = normalizarSucursal(sucursal);

  let cursorCaja = null;
  let cajaAnterior = null;
  let hayMasCajas = true;

  while (!cajaAnterior && hayMasCajas) {
    const qCajas = query(
      collection(db, "cajas"),
      where("clienteId", "==", perfil.clienteId),
      where("fechaCaja", "<", fechaCaja),
      orderBy("fechaCaja", "desc"),
      ...(cursorCaja ? [startAfter(cursorCaja)] : []),
      limit(100)
    );
    const snapCajas = await getDocs(qCajas);
    cajaAnterior = snapCajas.docs
      .map((d) => ({ firebaseId: d.id, ...d.data() }))
      .find((caja) => cajaPerteneceASucursal(caja, sucursalId));
    cursorCaja = snapCajas.docs.length
      ? snapCajas.docs[snapCajas.docs.length - 1]
      : null;
    hayMasCajas = snapCajas.docs.length === 100 && Boolean(cursorCaja);
  }

  if (!cajaAnterior) {
    return {
      caja: null,
      label: "Sin cierre anterior",
      saldo: 0,
      sinCierreAnterior: true,
    };
  }

  if (cajaAnterior.estado === "cerrada") {
    return {
      caja: cajaAnterior,
      label: "Cierre anterior",
      saldo: Number(cajaAnterior.saldoCierreRealEfectivo || 0),
      sinCierreAnterior: false,
    };
  }

  const qMovimientos = query(
    collection(db, "movimientos"),
    where("clienteId", "==", perfil.clienteId),
    where("fecha", "==", cajaAnterior.fechaCaja)
  );

  const snapMovimientos = await getDocs(qMovimientos);

const activos = snapMovimientos.docs
  .map((d) => d.data())
  .filter(
    (m) =>
      (m.estadoMovimiento || "activo") === "activo" &&
      m.activo !== false &&
      m.impactaCaja !== false &&
      movimientoPerteneceASucursal(m, sucursalId)
  );

  const ingresosEfectivo = activos
    .filter((m) => m.tipo === "ingreso" && m.medioPago === "efectivo")
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const egresosEfectivo = activos
    .filter((m) => m.tipo === "egreso" && m.medioPago === "efectivo")
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const saldo =
    Number(cajaAnterior.saldoAperturaEfectivo || 0) +
    ingresosEfectivo -
    egresosEfectivo;

  return {
    caja: cajaAnterior,
    label: "Sin cierre anterior",
    saldo,
    sinCierreAnterior: true,
  };
}

export async function abrirCaja({
  perfil,
  fechaCaja = fechaHoyInput(),
  saldoAperturaEfectivo = 0,
  observacionApertura = "",
  cajaAnterior = null,
  sucursal = null,
  saldoReferenciaAnterior = null,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const sucursalData = normalizarSucursal(sucursal);

const cajaExistente = await obtenerCajaDelDia({
  perfil,
  fechaCaja,
  sucursal,
});

  if (cajaExistente?.estado === "abierta") {
    throw new Error("Ya existe una caja abierta para este día.");
  }

  if (cajaExistente?.estado === "cerrada") {
    throw new Error("La caja de este día ya fue cerrada.");
  }

  const saldoAnterior =
  saldoReferenciaAnterior !== null
    ? Number(saldoReferenciaAnterior || 0)
    : Number(cajaAnterior?.saldoCierreRealEfectivo || 0);
  const apertura = Number(saldoAperturaEfectivo || 0);
  const diferenciaApertura = apertura - saldoAnterior;

  const ref = await addDoc(collection(db, "cajas"), {
    clienteId: perfil.clienteId,
    fechaCaja,
    estado: "abierta",
    sucursalId: sucursalData.sucursalId,
    sucursalNombre: sucursalData.sucursalNombre,

    saldoCierreAnteriorEfectivo: saldoAnterior,
    fechaCajaAnterior: cajaAnterior?.fechaCaja || "",
    saldoAperturaEfectivo: apertura,
    diferenciaAperturaEfectivo: diferenciaApertura,

    saldoCierreEsperadoEfectivo: 0,
    saldoCierreRealEfectivo: 0,
    diferenciaCierreEfectivo: 0,

    observacionApertura,
    observacionCierre: "",

    abiertaPor: perfil?.email || "",
    cerradaPor: "",

    abiertaAt: serverTimestamp(),
    cerradaAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { firebaseId: ref.id };
}

export async function obtenerMovimientosCajaDia({
  perfil,
  fechaCaja = fechaHoyInput(),
  sucursal = null,
  todasSucursales = false,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");

  const sucursalData = normalizarSucursal(sucursal);

  const q = query(
    collection(db, "movimientos"),
    where("clienteId", "==", perfil.clienteId),
    where("fecha", "==", fechaCaja)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      firebaseId: d.id,
      ...d.data(),
    }))
    .filter((m) => {
      const perteneceSucursal = todasSucursales
        ? true
        : movimientoPerteneceASucursal(
            m,
            sucursalData.sucursalId
          );

      const esMovimientoCaja =
        m.impactaCaja === true;

      const esCobroVenta =
        m.origen === "venta_pago" &&
        m.tipo === "ingreso";

      const esControlCaja =
        m.origen === "caja" &&
        m.tipo === "control" &&
        m.subtipo === "cambio_turno";

      return (
        perteneceSucursal &&
        (
          esMovimientoCaja ||
          esCobroVenta ||
          esControlCaja
        )
      );
    })
    .sort((a, b) => {
      const fechaA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const fechaB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return fechaB - fechaA;
    });
}

export function escucharMovimientosCajaDia({
  perfil,
  fechaCaja = fechaHoyInput(),
  sucursal = null,
  onData,
  onError,
}) {
  if (!perfil?.clienteId) return () => {};
  const { sucursalId } = normalizarSucursal(sucursal);

  const q = query(
    collection(db, "movimientos"),
    where("clienteId", "==", perfil.clienteId),
    where("fecha", "==", fechaCaja)
  );

  return onSnapshot(
    q,
    (snap) => {
      const lista = snap.docs
        .map((d) => ({
          firebaseId: d.id,
          ...d.data(),
        }))
          .filter((m) => {
            const perteneceSucursal =
              movimientoPerteneceASucursal(
                m,
                sucursalId
              );

            const esMovimientoCaja =
              m.impactaCaja === true;

            const esCobroVenta =
              m.origen === "venta_pago" &&
              m.tipo === "ingreso";

            const esControlCaja =
              m.origen === "caja" &&
              m.tipo === "control" &&
              m.subtipo === "cambio_turno";

            return (
              perteneceSucursal &&
              (
                esMovimientoCaja ||
                esCobroVenta ||
                esControlCaja
              )
            );
          })
        .sort((a, b) => {
          const fechaA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const fechaB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return fechaB - fechaA;
        });

      onData(lista);
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function crearMovimientoManualCaja({
  perfil,
  caja,
  tipo,
  subtipo,
  medioPago = "efectivo",
  monto,
  descripcion = "",
  observacion = "",
}) {
  if (!perfil?.clienteId) {
    throw new Error("Perfil inválido.");
  }

  if (!caja?.firebaseId) {
    throw new Error("No hay caja abierta.");
  }

  if (caja.estado !== "abierta") {
    throw new Error("La caja no está abierta.");
  }

  const esAdmin =
    perfil?.rol === "admin" ||
    perfil?.rol === "superadmin";

  const permisosCaja = perfil?.permisos?.caja || {};

  if (
    subtipo === "aporte_capital" &&
    !esAdmin &&
    permisosCaja.crearAporteCapital !== true
  ) {
    throw new Error(
      "No tenés permiso para registrar aportes de capital."
    );
  }

  if (
    subtipo === "retiro_capital" &&
    !esAdmin &&
    permisosCaja.crearRetiroCapital !== true
  ) {
    throw new Error(
      "No tenés permiso para registrar retiros de dueño o capital."
    );
  }

  if (
    subtipo === "ajuste_positivo" &&
    !esAdmin &&
    permisosCaja.crearAjustePositivo !== true
  ) {
    throw new Error(
      "No tenés permiso para realizar ajustes positivos de caja."
    );
  }

  if (
    subtipo === "ajuste_negativo" &&
    !esAdmin &&
    permisosCaja.crearAjusteNegativo !== true
  ) {
    throw new Error(
      "No tenés permiso para realizar ajustes negativos de caja."
    );
  }

  const montoNum = Number(monto || 0);

  if (montoNum <= 0) {
    throw new Error("El monto debe ser mayor a 0.");
  }

  const subtiposQueImpactanResultado = [
    "gasto_caja",
    "otro_egreso",
    "otro_ingreso",
  ];

  const impactaResultado =
    subtiposQueImpactanResultado.includes(subtipo);

  const tipoFinanciero =
    subtipo === "gasto_caja"
      ? "gasto_operativo"
      : subtipo === "aporte_capital"
      ? "aporte_capital"
      : subtipo === "retiro_capital"
      ? "retiro_capital"
      : subtipo === "ajuste_positivo" ||
        subtipo === "ajuste_negativo"
      ? "ajuste_caja"
      : "otro";

let movimientoRef;

if (tipo === "egreso" && impactaResultado) {
  movimientoRef = doc(collection(db, "movimientos"));
  const gastoRef = doc(collection(db, "gastos"));

  const batch = writeBatch(db);

  batch.set(movimientoRef, {
    clienteId: perfil.clienteId,
    cajaId: caja.firebaseId,
    fechaCaja: caja.fechaCaja,
    fecha: caja.fechaCaja,

    sucursalId:
      caja.sucursalId || SUCURSAL_PRINCIPAL_ID,

    sucursalNombre:
      caja.sucursalNombre || "Sucursal principal",

    tipo,
    subtipo,

    origen: "caja",
    origenRefId: caja.firebaseId,

    gastoRefId: gastoRef.id,

    descripcion,
    observacion,

    monto: montoNum,
    medioPago,

    impactaCaja: true,
    impactaResultado,
    tipoFinanciero,

    estadoMovimiento: "activo",
    activo: true,

    creadoPor:
      perfil?.uid ||
      perfil?.firebaseUid ||
      perfil?.email ||
      "",

    creadoPorNombre:
      perfil?.nombre ||
      perfil?.email ||
      "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(gastoRef, {
    clienteId: perfil.clienteId,
    fecha: caja.fechaCaja,

    origen: "caja",
    origenRefId: movimientoRef.id,
    movimientoRefId: movimientoRef.id,

    sucursalId:
      caja.sucursalId || SUCURSAL_PRINCIPAL_ID,

    sucursalNombre:
      caja.sucursalNombre ||
      "Sucursal principal",

    categoria:
      subtipo === "otro_egreso"
        ? "Otro egreso de caja"
        : "Gasto de caja",

    tipoFinanciero,

    proveedor: "",
    comprobanteNumero: "",
    comprobantes: [],
    observaciones: observacion || "",

    descripcion:
      descripcion || "Caja - Gasto de caja",

    items: [
      {
        descripcion:
          descripcion ||
          "Caja - Gasto de caja",

        cantidad: 1,
        precioUnitario: montoNum,
        subtotal: montoNum,
      },
    ],

    pagos: [
      {
        monto: montoNum,
        medioPago: medioPago || "efectivo",
      },
    ],

    medioPago:
      medioPago || "efectivo",

    total: montoNum,
    totalPagado: montoNum,
    saldo: 0,
    monto: montoNum,

    activo: true,
    estado: "activo",

    creadoPor:
      perfil?.uid ||
      perfil?.firebaseUid ||
      "",

    creadoPorNombre:
      perfil?.nombre ||
      perfil?.email ||
      "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    console.error(
      "[CAJA - CREAR EGRESO Y GASTO]",
      error
    );

    throw new Error(
      `[CREAR EGRESO] ${
        error?.message ||
        "No se pudo registrar el egreso."
      }`
    );
  }
} else {
  try {
    movimientoRef = await addDoc(
      collection(db, "movimientos"),
      {
        clienteId: perfil.clienteId,
        cajaId: caja.firebaseId,
        fechaCaja: caja.fechaCaja,
        fecha: caja.fechaCaja,

        sucursalId:
          caja.sucursalId ||
          SUCURSAL_PRINCIPAL_ID,

        sucursalNombre:
          caja.sucursalNombre ||
          "Sucursal principal",

        tipo,
        subtipo,

        origen: "caja",
        origenRefId: caja.firebaseId,

        descripcion,
        observacion,

        monto: montoNum,
        medioPago,

        impactaCaja: true,
        impactaResultado,
        tipoFinanciero,

        estadoMovimiento: "activo",
        activo: true,

        creadoPor:
          perfil?.uid ||
          perfil?.firebaseUid ||
          perfil?.email ||
          "",

        creadoPorNombre:
          perfil?.nombre ||
          perfil?.email ||
          "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );
  } catch (error) {
    console.error(
      "[CAJA - CREAR MOVIMIENTO]",
      error
    );

    throw new Error(
      `[CREAR MOVIMIENTO] ${
        error?.message ||
        "No se pudo crear el movimiento."
      }`
    );
  }
}

  return {
    movimientoId: movimientoRef.id,
  };
}

export async function crearCambioTurnoCaja({
  perfil,
  caja,
  efectivoContado,
  observacion = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("No hay caja abierta.");
  if (caja.estado !== "abierta") throw new Error("La caja no está abierta.");

  const movimientos = await obtenerMovimientosCajaDia({
    perfil,
    fechaCaja: caja.fechaCaja,
    sucursal: {
      firebaseId: caja.sucursalId || SUCURSAL_PRINCIPAL_ID,
      nombre: caja.sucursalNombre || "Sucursal principal",
    },
  });

 const activos = movimientos.filter(
  (m) =>
    (m.estadoMovimiento || "activo") === "activo" &&
    m.activo !== false &&
    m.impactaCaja !== false
);

  const ingresosEfectivo = activos
    .filter((m) => m.tipo === "ingreso" && m.medioPago === "efectivo")
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const egresosEfectivo = activos
    .filter((m) => m.tipo === "egreso" && m.medioPago === "efectivo")
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const efectivoEsperado =
    Number(caja.saldoAperturaEfectivo || 0) + ingresosEfectivo - egresosEfectivo;

  const contado = Number(efectivoContado || 0);
  const diferencia = contado - efectivoEsperado;

  await addDoc(collection(db, "movimientos"), {
    clienteId: perfil.clienteId,
    cajaId: caja.firebaseId,
    fechaCaja: caja.fechaCaja,
    fecha: caja.fechaCaja,

    sucursalId: caja.sucursalId || SUCURSAL_PRINCIPAL_ID,
    sucursalNombre: caja.sucursalNombre || "Sucursal principal",

    tipo: "control",
    subtipo: "cambio_turno",
    origen: "caja",
    origenRefId: caja.firebaseId,

    descripcion: "Cambio de turno",
    observacion,

    monto: 0,
    medioPago: "efectivo",

    efectivoEsperado,
    efectivoContado: contado,
    diferenciaTurno: diferencia,

    impactaCaja: false,
    impactaResultado: false,
    estadoMovimiento: "activo",

    creadoPor: perfil?.email || "",
    creadoPorNombre: perfil?.nombre || perfil?.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function cerrarCaja({
  perfil,
  caja,
  saldoCierreRealEfectivo,
  observacionCierre = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("Caja inválida.");
  if (caja.estado !== "abierta") throw new Error("La caja no está abierta.");

const movimientos = await obtenerMovimientosCajaDia({
  perfil,
  fechaCaja: caja.fechaCaja,
  sucursal: {
    firebaseId: caja.sucursalId || SUCURSAL_PRINCIPAL_ID,
    nombre: caja.sucursalNombre || "Sucursal principal",
  },
});

const activos = movimientos.filter(
  (m) =>
    (m.estadoMovimiento || "activo") === "activo" &&
    m.activo !== false &&
    m.impactaCaja === true
);

const ingresosEfectivo = activos
  .filter(
    (m) =>
      m.tipo === "ingreso" &&
      (
        m.medioPago === "efectivo" ||
        m.medioPago === "efectivo_caja"
      )
  )
  .reduce((acc, m) => acc + Number(m.monto || 0), 0);

const egresosEfectivo = activos
  .filter(
    (m) =>
      m.tipo === "egreso" &&
      (
        m.medioPago === "efectivo" ||
        m.medioPago === "efectivo_caja"
      )
  )
  .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const esperado =
    Number(caja.saldoAperturaEfectivo || 0) + ingresosEfectivo - egresosEfectivo;

  const real = Number(saldoCierreRealEfectivo || 0);
  const diferencia = real - esperado;

  await updateDoc(doc(db, "cajas", caja.firebaseId), {
    estado: "cerrada",
    saldoCierreEsperadoEfectivo: esperado,
    saldoCierreRealEfectivo: real,
    diferenciaCierreEfectivo: diferencia,
    observacionCierre,
    cerradaPor: perfil?.email || "",
    cerradaAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function reabrirCaja({
  perfil,
  caja,
  motivoReapertura = "",
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("Caja inválida.");
  if (caja.estado !== "cerrada") throw new Error("La caja no está cerrada.");

  await updateDoc(doc(db, "cajas", caja.firebaseId), {
    estado: "abierta",
    motivoReapertura,
    reabiertaPor: perfil?.email || "",
    reabiertaAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function corregirAperturaCaja({
  perfil,
  caja,
  nuevoSaldoAperturaEfectivo,
}) {
  if (!perfil?.clienteId) throw new Error("Perfil inválido.");
  if (!caja?.firebaseId) throw new Error("Caja inválida.");
  if (caja.estado !== "abierta") throw new Error("La caja debe estar abierta.");

const movimientos = await obtenerMovimientosCajaDia({
  perfil,
  fechaCaja: caja.fechaCaja,
  sucursal: {
    firebaseId: caja.sucursalId || SUCURSAL_PRINCIPAL_ID,
    nombre: caja.sucursalNombre || "Sucursal principal",
  },
});

const activos = movimientos.filter(
  (m) =>
    (m.estadoMovimiento || "activo") === "activo" &&
    m.activo !== false &&
    m.impactaCaja !== false
);

  if (activos.length > 0) {
    throw new Error(
      "No se puede corregir la apertura porque la caja ya tiene movimientos. Usá un movimiento de ajuste."
    );
  }

  const nuevoSaldo = Number(nuevoSaldoAperturaEfectivo || 0);
  const saldoAnterior = Number(caja.saldoCierreAnteriorEfectivo || 0);

  await updateDoc(doc(db, "cajas", caja.firebaseId), {
    saldoAperturaEfectivo: nuevoSaldo,
    diferenciaAperturaEfectivo: nuevoSaldo - saldoAnterior,
    updatedAt: serverTimestamp(),
  });
}

export async function obtenerHistorialCajas({
  perfil,
  limite = 30,
  fechaDesde = "",
  fechaHasta = "",
  sucursal = null,
  todasSucursales = false,
}) {
  if (!perfil?.clienteId) {
    throw new Error("Perfil inválido.");
  }

  const sucursalData = normalizarSucursal(sucursal);

  const resultados = [];
  let cursor = null;
  let recorridoCompleto = false;
  const pageSize = Math.max(limite, 30);

  while (resultados.length < limite && !recorridoCompleto) {
    const filtros = [
      where("clienteId", "==", perfil.clienteId),
      orderBy("fechaCaja", "desc"),
    ];
    if (cursor) filtros.push(startAfter(cursor));
    else if (fechaHasta) filtros.push(startAt(fechaHasta));
    if (fechaDesde) filtros.push(endAt(fechaDesde));
    filtros.push(limit(pageSize));

    const snap = await getDocs(query(collection(db, "cajas"), ...filtros));
    let detenidoPorLimite = false;
    for (const documento of snap.docs) {
      cursor = documento;
      const caja = { firebaseId: documento.id, ...documento.data() };
      if (
        todasSucursales ||
        cajaPerteneceASucursal(caja, sucursalData.sucursalId)
      ) {
        resultados.push(caja);
      }
      if (resultados.length === limite) {
        detenidoPorLimite = true;
        break;
      }
    }
    recorridoCompleto =
      !detenidoPorLimite &&
      (snap.docs.length === 0 || snap.docs.length < pageSize);
  }

  return resultados;
}
