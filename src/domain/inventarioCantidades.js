const PRECISION_MINIMA = 0;
const PRECISION_MAXIMA = 6;

function validarPrecisionCantidad(precisionCantidad) {
  if (
    !Number.isInteger(precisionCantidad) ||
    precisionCantidad < PRECISION_MINIMA ||
    precisionCantidad > PRECISION_MAXIMA
  ) {
    throw new Error(
      `La precisión de cantidad debe ser un entero entre ${PRECISION_MINIMA} y ${PRECISION_MAXIMA}.`,
    );
  }

  return precisionCantidad;
}

function normalizarTextoCantidad(valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      throw new Error('La cantidad debe ser un número finito.');
    }

    return String(valor);
  }

  const texto = String(valor ?? '').trim();

  if (!texto) {
    throw new Error('La cantidad es obligatoria.');
  }

  const tieneComa = texto.includes(',');
  const tienePunto = texto.includes('.');

  if (tieneComa && tienePunto) {
    throw new Error(
      'La cantidad no puede contener coma y punto decimal al mismo tiempo.',
    );
  }

  return tieneComa ? texto.replace(',', '.') : texto;
}

function separarCantidadDecimal(valor) {
  const texto = normalizarTextoCantidad(valor);

  if (!/^-?\d+(?:\.\d+)?$/.test(texto)) {
    throw new Error('La cantidad tiene un formato inválido.');
  }

  const negativo = texto.startsWith('-');
  const textoSinSigno = negativo ? texto.slice(1) : texto;
  const [parteEntera, parteDecimal = ''] = textoSinSigno.split('.');

  return {
    negativo,
    parteEntera,
    parteDecimal,
  };
}

export function cantidadAUnidadesMinimas(valor, precisionCantidad = 0) {
  const precision = validarPrecisionCantidad(precisionCantidad);
  const {negativo, parteEntera, parteDecimal} = separarCantidadDecimal(valor);

  const decimalesSignificativos = parteDecimal.replace(/0+$/, '');

  if (decimalesSignificativos.length > precision) {
    throw new Error(`La cantidad admite como máximo ${precision} decimales.`);
  }

  const decimalesNormalizados = parteDecimal
    .padEnd(precision, '0')
    .slice(0, precision);

  const factor = 10 ** precision;
  const entero = Number(parteEntera);
  const decimal = decimalesNormalizados ? Number(decimalesNormalizados) : 0;

  const unidadesMinimas = entero * factor + decimal;
  const resultado = negativo ? -unidadesMinimas : unidadesMinimas;

  if (!Number.isSafeInteger(resultado)) {
    throw new Error('La cantidad supera el límite seguro permitido.');
  }

  return resultado;
}

export function unidadesMinimasATexto(
  unidadesMinimas,
  precisionCantidad = 0,
) {
  const precision = validarPrecisionCantidad(precisionCantidad);

  if (!Number.isSafeInteger(unidadesMinimas)) {
    throw new Error('Las unidades mínimas deben ser un entero seguro.');
  }

  const negativo = unidadesMinimas < 0;
  const valorAbsoluto = Math.abs(unidadesMinimas);
  const factor = 10 ** precision;

  const parteEntera = Math.floor(valorAbsoluto / factor);

  if (precision === 0) {
    return `${negativo ? '-' : ''}${parteEntera}`;
  }

  const parteDecimal = String(valorAbsoluto % factor).padStart(precision, '0');

  return `${negativo ? '-' : ''}${parteEntera}.${parteDecimal}`;
}

export function calcularDisponibleUnidadesMinimas(
  fisicoUnidadesMinimas,
  reservadoUnidadesMinimas,
) {
  if (
    !Number.isSafeInteger(fisicoUnidadesMinimas) ||
    !Number.isSafeInteger(reservadoUnidadesMinimas)
  ) {
    throw new Error(
      'Físico y reservado deben expresarse como enteros seguros.',
    );
  }

  const disponible =
    fisicoUnidadesMinimas - reservadoUnidadesMinimas;

  if (!Number.isSafeInteger(disponible)) {
    throw new Error('La disponibilidad supera el límite seguro permitido.');
  }

  return disponible;
}

export function estaBajoMinimo({
  fisicoUnidadesMinimas,
  reservadoUnidadesMinimas,
  minimoUnidadesMinimas,
}) {
  if (!Number.isSafeInteger(minimoUnidadesMinimas)) {
    throw new Error(
      'El stock mínimo debe expresarse como un entero seguro.',
    );
  }

  const disponible = calcularDisponibleUnidadesMinimas(
    fisicoUnidadesMinimas,
    reservadoUnidadesMinimas,
  );

  return disponible <= minimoUnidadesMinimas;
}

export function validarCantidadPositiva(unidadesMinimas) {
  if (!Number.isSafeInteger(unidadesMinimas)) {
    throw new Error(
      'La cantidad debe expresarse como un entero seguro.',
    );
  }

  if (unidadesMinimas <= 0) {
    throw new Error('La cantidad debe ser mayor que cero.');
  }

  return unidadesMinimas;
}

export {
  PRECISION_MINIMA,
  PRECISION_MAXIMA,
  validarPrecisionCantidad,
};