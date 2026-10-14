export const TIPOS_IDENTIFICADOR_INVENTARIO = Object.freeze([
  'sku',
  'barcode',
  'ean',
  'upc',
  'gtin',
  'interno',
]);

const TIPOS_NUMERICOS = new Set([
  'ean',
  'upc',
  'gtin',
]);

export function normalizarTipoIdentificador(tipo) {
  const normalizado = String(tipo || '')
    .trim()
    .toLowerCase();

  if (!TIPOS_IDENTIFICADOR_INVENTARIO.includes(normalizado)) {
    throw new Error(
      `Tipo de identificador de inventario inválido: ${tipo || ''}.`,
    );
  }

  return normalizado;
}

export function normalizarSku(valor) {
  const normalizado = String(valor ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase();

  if (!normalizado) {
    throw new Error('El SKU no puede estar vacío.');
  }

  return normalizado;
}

export function normalizarCodigoBarra(valor) {
  const normalizado = String(valor ?? '')
    .normalize('NFKC')
    .trim();

  if (!normalizado) {
    throw new Error(
      'El código de barras no puede estar vacío.',
    );
  }

  return normalizado;
}

export function normalizarIdentificadorInventario({
  tipo,
  valor,
} = {}) {
  const tipoNormalizado = normalizarTipoIdentificador(tipo);

  const valorNormalizado =
    tipoNormalizado === 'sku' ||
    tipoNormalizado === 'interno'
      ? normalizarSku(valor)
      : normalizarCodigoBarra(valor);

  if (
    TIPOS_NUMERICOS.has(tipoNormalizado) &&
    !/^\d+$/.test(valorNormalizado)
  ) {
    throw new Error(
      `${tipoNormalizado.toUpperCase()} sólo admite dígitos.`,
    );
  }

  return {
    tipo: tipoNormalizado,
    valorOriginal: String(valor ?? '').trim(),
    valorNormalizado,
  };
}

export function construirClaveLogicaIdentificador({
  clienteId,
  tipo,
  valor,
} = {}) {
  const tenant = String(clienteId || '').trim();

  if (!tenant) {
    throw new Error(
      'clienteId es obligatorio para identificar un artículo.',
    );
  }

  const identificador = normalizarIdentificadorInventario({
    tipo,
    valor,
  });

  return [
    tenant,
    identificador.tipo,
    identificador.valorNormalizado,
  ].join('\n');
}

export function identificadoresSonIguales(
  identificadorA,
  identificadorB,
) {
  const primero = normalizarIdentificadorInventario(
    identificadorA,
  );
  const segundo = normalizarIdentificadorInventario(
    identificadorB,
  );

  return (
    primero.tipo === segundo.tipo &&
    primero.valorNormalizado === segundo.valorNormalizado
  );
}