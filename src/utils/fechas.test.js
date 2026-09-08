import {
  fechaHoyNegocio,
  obtenerLimitesPeriodoUTC,
  obtenerRangoRapidoNegocio,
} from "./fechas";

const perfil = { timezone: "America/Argentina/Buenos_Aires" };
const referencia = new Date("2026-09-03T01:00:00.000Z");

test("los períodos rápidos parten del día de negocio y no del día UTC", () => {
  expect(fechaHoyNegocio(perfil, referencia)).toBe("2026-09-02");
  expect(obtenerRangoRapidoNegocio({ periodo: "hoy", perfil, fechaReferencia: referencia }))
    .toEqual({ desde: "2026-09-02", hasta: "2026-09-02" });
  expect(obtenerRangoRapidoNegocio({ periodo: "ayer", perfil, fechaReferencia: referencia }))
    .toEqual({ desde: "2026-09-01", hasta: "2026-09-01" });
  expect(obtenerRangoRapidoNegocio({ periodo: "7dias", perfil, fechaReferencia: referencia }))
    .toEqual({ desde: "2026-08-27", hasta: "2026-09-02" });
  expect(obtenerRangoRapidoNegocio({ periodo: "30dias", perfil, fechaReferencia: referencia }))
    .toEqual({ desde: "2026-08-04", hasta: "2026-09-02" });
});

test("el período personalizado conserva fechas ISO y sus límites respetan timezone", () => {
  const rango = obtenerRangoRapidoNegocio({
    periodo: "personalizado",
    perfil,
    personalizadoDesde: "2026-08-20",
    personalizadoHasta: "2026-09-02",
  });
  expect(rango).toEqual({ desde: "2026-08-20", hasta: "2026-09-02" });
  const limites = obtenerLimitesPeriodoUTC({ ...rango, perfil });
  expect(limites.inicio.toISOString()).toBe("2026-08-20T03:00:00.000Z");
  expect(limites.finExclusivo.toISOString()).toBe("2026-09-03T03:00:00.000Z");
});
