import { calcularProgresoPorColumna } from "./produccionUtils";

const columnas = [
  { id: "inicio", nombre: "Pendiente", orden: 0, esInicial: true },
  { id: "diseno", nombre: "Diseño", orden: 1 },
  { id: "impresion", nombre: "Impresión", orden: 2 },
  { id: "final", nombre: "Producción finalizada", orden: 3, esFinal: true },
  { id: "cancelado", nombre: "Cancelado", orden: 4, esCancelado: true },
];

test("el progreso productivo ignora Cancelado y la columna final siempre vale 100%", () => {
  expect(calcularProgresoPorColumna(columnas, "inicio")).toBe(0);
  expect(calcularProgresoPorColumna(columnas, "diseno")).toBe(33);
  expect(calcularProgresoPorColumna(columnas, "impresion")).toBe(67);
  expect(calcularProgresoPorColumna(columnas, "final")).toBe(100);
  expect(calcularProgresoPorColumna(columnas, "cancelado")).toBe(0);
});
