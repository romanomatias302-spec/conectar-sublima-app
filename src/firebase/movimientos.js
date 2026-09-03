import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { db } from "../firebase";

const SUBTIPOS_NO_OPERATIVOS = [
  "aporte_capital",
  "ingreso_capital",
  "retiro_capital",
  "egreso_capital",
  "ajuste_positivo",
  "ajuste_negativo",
];

export function movimientoEstaAnulado(movimiento) {
  return (
    movimiento?.estadoMovimiento === "anulado" ||
    movimiento?.estado === "anulado" ||
    movimiento?.activo === false ||
    movimiento?.anulado === true
  );
}

export function movimientoImpactaInforme(movimiento) {
  return (
    !movimientoEstaAnulado(movimiento) &&
    movimiento?.impactaResultado !== false &&
    !SUBTIPOS_NO_OPERATIVOS.includes(movimiento?.subtipo || "")
  );
}

export function crearResumenMovimientosVacio() {
  return {
    totalIngresos: 0,
    totalEgresos: 0,
    resultado: 0,
    cantidadIngresos: 0,
    cantidadEgresos: 0,
    cantidadMovimientos: 0,
    totalIngresosFinanzas: 0,
    totalEgresosFinanzas: 0,
    resultadoFinanzas: 0,
  };
}

export function acumularMovimientoEnResumen(resumen, movimiento) {
  if (!movimientoImpactaInforme(movimiento)) return resumen;

  const monto = Number(movimiento?.monto) || 0;
  const tipo = (movimiento?.tipo || "").toLowerCase();
  resumen.cantidadMovimientos += 1;

  if (movimiento?.tipo === "ingreso") {
    resumen.totalIngresos += monto;
    resumen.cantidadIngresos += 1;
  }

  if (movimiento?.tipo === "egreso") {
    resumen.totalEgresos += monto;
    resumen.cantidadEgresos += 1;
  }

  if (tipo === "ingreso") resumen.totalIngresosFinanzas += monto;
  if (tipo === "egreso") resumen.totalEgresosFinanzas += monto;
  resumen.resultado = resumen.totalIngresos - resumen.totalEgresos;
  resumen.resultadoFinanzas =
    resumen.totalIngresosFinanzas - resumen.totalEgresosFinanzas;
  return resumen;
}

function crearFiltrosMovimientos({ perfil, fechaDesde, fechaHasta, tipo }) {
  const filtros = [];

  if (perfil?.rol !== "superadmin") {
    filtros.push(where("clienteId", "==", perfil.clienteId));
  }

  if (tipo) filtros.push(where("tipo", "==", tipo));
  if (fechaDesde) filtros.push(where("fecha", ">=", fechaDesde));
  if (fechaHasta) filtros.push(where("fecha", "<=", fechaHasta));
  return filtros;
}

async function obtenerPaginaMovimientos({
  perfil,
  ultimoDoc = null,
  pageSize,
  fechaDesde = null,
  fechaHasta = null,
  tipo = "",
}) {
  const q = query(
    collection(db, "movimientos"),
    ...crearFiltrosMovimientos({ perfil, fechaDesde, fechaHasta, tipo }),
    orderBy("fecha", "desc"),
    ...(ultimoDoc ? [startAfter(ultimoDoc)] : []),
    limit(pageSize)
  );
  const snapshot = await getDocs(q);

  return {
    documentos: snapshot.docs.map((doc) => ({
      firebaseId: doc.id,
      ...doc.data(),
    })),
    ultimoDoc: snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null,
    hayMas: snapshot.docs.length === pageSize,
  };
}

export async function obtenerMovimientosPaginados({
  perfil,
  ultimoDoc = null,
  pageSize = 100,
  fechaDesde = null,
  fechaHasta = null,
  tipo = "",
}) {
  const pagina = await obtenerPaginaMovimientos({
    perfil,
    ultimoDoc,
    pageSize,
    fechaDesde,
    fechaHasta,
    tipo,
  });

  return {
    movimientos: pagina.documentos.filter(
      (m) =>
        m.impactaResultado !== false &&
        !SUBTIPOS_NO_OPERATIVOS.includes(m.subtipo || "")
    ),
    ultimoDoc: pagina.ultimoDoc,
    hayMas: pagina.hayMas,
  };
}

export async function recorrerMovimientosCompletos({
  perfil,
  fechaDesde = null,
  fechaHasta = null,
  tipo = "",
  pageSize = 250,
  procesarMovimiento,
}) {
  let ultimoDoc = null;
  let hayMas = true;

  while (hayMas) {
    const pagina = await obtenerPaginaMovimientos({
      perfil,
      ultimoDoc,
      pageSize,
      fechaDesde,
      fechaHasta,
      tipo,
    });

    pagina.documentos.forEach(procesarMovimiento);
    ultimoDoc = pagina.ultimoDoc;
    hayMas = pagina.hayMas && Boolean(ultimoDoc);
  }
}

export async function obtenerResumenMovimientosCompleto(filtros) {
  const resumen = crearResumenMovimientosVacio();

  await recorrerMovimientosCompletos({
    ...filtros,
    procesarMovimiento: (movimiento) =>
      acumularMovimientoEnResumen(resumen, movimiento),
  });

  return resumen;
}

export async function obtenerMovimientosCompletos(filtros) {
  const movimientos = [];

  await recorrerMovimientosCompletos({
    ...filtros,
    procesarMovimiento: (movimiento) => {
      if (movimientoImpactaInforme(movimiento)) movimientos.push(movimiento);
    },
  });

  return movimientos;
}
