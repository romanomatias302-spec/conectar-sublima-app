import {
  construirClaveLogicaIdentificador,
  identificadoresSonIguales,
  normalizarCodigoBarra,
  normalizarIdentificadorInventario,
  normalizarSku,
  normalizarTipoIdentificador,
} from './inventarioIdentificadores';

test('normaliza SKU quitando espacios y usando mayúsculas', () => {
  expect(normalizarSku('  rem-bla-m  ')).toBe('REM-BLA-M');
});

test('normaliza Unicode en SKU', () => {
  expect(normalizarSku('  sku-１２３  ')).toBe('SKU-123');
});

test('conserva códigos de barras como strings', () => {
  expect(normalizarCodigoBarra('001234567890')).toBe(
    '001234567890',
  );
});

test('conserva ceros iniciales de códigos de barras', () => {
  const resultado = normalizarIdentificadorInventario({
    tipo: 'ean',
    valor: '001234567890',
  });

  expect(resultado.valorNormalizado).toBe('001234567890');
});

test.each([
  ['SKU', 'sku'],
  [' barcode ', 'barcode'],
  ['EAN', 'ean'],
  ['UPC', 'upc'],
  ['GTIN', 'gtin'],
  ['INTERNO', 'interno'],
])('normaliza tipo %p como %p', (entrada, esperado) => {
  expect(normalizarTipoIdentificador(entrada)).toBe(esperado);
});

test('rechaza tipos desconocidos', () => {
  expect(() =>
    normalizarTipoIdentificador('mercadolibre'),
  ).toThrow();
});

test.each([
  'ABC123',
  '779ABC123',
  '123-456',
])('rechaza EAN alfanumérico %p', (valor) => {
  expect(() =>
    normalizarIdentificadorInventario({
      tipo: 'ean',
      valor,
    }),
  ).toThrow('EAN sólo admite dígitos.');
});

test('barcode genérico puede conservar contenido alfanumérico', () => {
  expect(
    normalizarIdentificadorInventario({
      tipo: 'barcode',
      valor: 'ABC-001',
    }),
  ).toEqual({
    tipo: 'barcode',
    valorOriginal: 'ABC-001',
    valorNormalizado: 'ABC-001',
  });
});

test('dos SKU equivalentes se consideran iguales', () => {
  expect(
    identificadoresSonIguales(
      {
        tipo: 'sku',
        valor: 'rem-bla-m',
      },
      {
        tipo: 'SKU',
        valor: ' REM-BLA-M ',
      },
    ),
  ).toBe(true);
});

test('identificadores de distinto tipo no son iguales', () => {
  expect(
    identificadoresSonIguales(
      {
        tipo: 'sku',
        valor: '12345',
      },
      {
        tipo: 'barcode',
        valor: '12345',
      },
    ),
  ).toBe(false);
});

test('construye una clave lógica estable por tenant, tipo y valor', () => {
  expect(
    construirClaveLogicaIdentificador({
      clienteId: 'empresa-1',
      tipo: 'sku',
      valor: ' rem-bla-m ',
    }),
  ).toBe('empresa-1\nsku\nREM-BLA-M');
});

test('la misma identificación puede existir en tenants distintos', () => {
  const primera = construirClaveLogicaIdentificador({
    clienteId: 'empresa-1',
    tipo: 'sku',
    valor: 'REM-M',
  });

  const segunda = construirClaveLogicaIdentificador({
    clienteId: 'empresa-2',
    tipo: 'sku',
    valor: 'REM-M',
  });

  expect(primera).not.toBe(segunda);
});

test.each([
  ['', 'sku', 'ABC'],
  [null, 'sku', 'ABC'],
  [undefined, 'sku', 'ABC'],
])(
  'requiere clienteId válido para construir la clave lógica',
  (clienteId, tipo, valor) => {
    expect(() =>
      construirClaveLogicaIdentificador({
        clienteId,
        tipo,
        valor,
      }),
    ).toThrow('clienteId es obligatorio');
  },
);