import {
  PRECISION_MAXIMA,
  calcularDisponibleUnidadesMinimas,
  cantidadAUnidadesMinimas,
  estaBajoMinimo,
  unidadesMinimasATexto,
  validarCantidadPositiva,
  validarPrecisionCantidad,
} from './inventarioCantidades';

test.each([
  ['10', 0, 10],
  [10, 0, 10],
  ['2.75', 2, 275],
  ['2,75', 2, 275],
  ['4.250', 3, 4250],
  ['0.5', 3, 500],
  ['12.3400', 2, 1234],
  ['-2.5', 1, -25],
])(
  'convierte %p con precisión %i a %i unidades mínimas',
  (valor, precision, esperado) => {
    expect(cantidadAUnidadesMinimas(valor, precision)).toBe(esperado);
  },
);

test.each([
  [10, 0, '10'],
  [275, 2, '2.75'],
  [4250, 3, '4.250'],
  [500, 3, '0.500'],
  [-25, 1, '-2.5'],
])(
  'convierte %i unidades mínimas con precisión %i a %s',
  (valor, precision, esperado) => {
    expect(unidadesMinimasATexto(valor, precision)).toBe(esperado);
  },
);

test('rechaza cantidades con más decimales que la precisión permitida', () => {
  expect(() => cantidadAUnidadesMinimas('2.756', 2)).toThrow(
    'La cantidad admite como máximo 2 decimales.',
  );
});

test('permite decimales adicionales cuando sólo son ceros', () => {
  expect(cantidadAUnidadesMinimas('12.3400', 2)).toBe(1234);
});

test.each([
  '',
  'abc',
  '1,2.3',
  '10 unidades',
])('rechaza cantidad inválida %p', (valor) => {
  expect(() => cantidadAUnidadesMinimas(valor, 2)).toThrow();
});

test('valida el rango permitido de precisión', () => {
  expect(validarPrecisionCantidad(0)).toBe(0);
  expect(validarPrecisionCantidad(PRECISION_MAXIMA)).toBe(
    PRECISION_MAXIMA,
  );

  expect(() => validarPrecisionCantidad(-1)).toThrow();
  expect(() => validarPrecisionCantidad(PRECISION_MAXIMA + 1)).toThrow();
  expect(() => validarPrecisionCantidad(1.5)).toThrow();
});

test('calcula disponibilidad restando reservado al físico', () => {
  expect(calcularDisponibleUnidadesMinimas(100, 30)).toBe(70);
});

test('detecta stock bajo usando la disponibilidad', () => {
  expect(
    estaBajoMinimo({
      fisicoUnidadesMinimas: 100,
      reservadoUnidadesMinimas: 80,
      minimoUnidadesMinimas: 20,
    }),
  ).toBe(true);

  expect(
    estaBajoMinimo({
      fisicoUnidadesMinimas: 100,
      reservadoUnidadesMinimas: 79,
      minimoUnidadesMinimas: 20,
    }),
  ).toBe(false);
});

test('valida cantidades estrictamente positivas', () => {
  expect(validarCantidadPositiva(1)).toBe(1);

  expect(() => validarCantidadPositiva(0)).toThrow();
  expect(() => validarCantidadPositiva(-1)).toThrow();
  expect(() => validarCantidadPositiva(1.5)).toThrow();
});

test('rechaza valores que superan el entero seguro de JavaScript', () => {
  expect(() =>
    unidadesMinimasATexto(Number.MAX_SAFE_INTEGER + 1, 0),
  ).toThrow();
});