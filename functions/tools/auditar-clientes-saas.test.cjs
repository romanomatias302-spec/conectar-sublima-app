"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {classifyClient, classifyPrice, parseArgs, summarize} = require("./auditar-clientes-saas.cjs");

test("clasifica precio sin tratar cero como error automático", () => {
  assert.equal(classifyPrice(undefined), "ausente"); assert.equal(classifyPrice(0), "cero");
  assert.equal(classifyPrice("20"), "positivo"); assert.equal(classifyPrice("texto"), "tipo_invalido");
});

test("genera matrices, legacy seguro y anomalía crítica de precio", () => {
  const rows = [
    classifyClient("mensual-ok", {plan: "Mensual", frecuenciaCobro: "mensual", estadoSuscripcion: "activa", moneda: "ARS", planPrecio: 100}),
    classifyClient("anual-cero", {plan: "Anual", frecuenciaCobro: "mensual", estadoSuscripcion: "gracia", moneda: "USD", planPrecio: 0}),
    classifyClient("trial", {plan: "Prueba gratis 7 días", frecuenciaCobro: "prueba", estadoSuscripcion: "prueba", planPrecio: 0}),
  ];
  const result = summarize(rows, {now: new Date("2026-09-08T00:00:00Z")});
  assert.equal(result.B_MATRICES.planPorEstado.Mensual.activa, 1); assert.equal(result.B_MATRICES.planPorPrecio.Anual.cero, 1);
  assert.equal(result.C_LEGACY_SEGURO.total, 2); assert.equal(result.C_LEGACY_SEGURO.inconsistenciasPlanCiclo.length, 1);
  assert.equal(result.G_ANOMALIAS_PRECIO.legacyActivoOGraciaSinPrecioPositivo.length, 1);
  assert.equal(result.G_ANOMALIAS_PRECIO.precioCeroPorPlan["Prueba gratis 7 días"], 1);
});

test("clasifica casos especiales con salida compacta", () => {
  const result = summarize([
    classifyClient("personalizado", {nombre: "Uno", plan: "Personalizado", estadoSuscripcion: "activa", planPrecio: 50, frecuenciaCobro: "mensual"}),
    classifyClient("instalacion", {nombre: "Dos", plan: "instalacion", estadoSuscripcion: "activa", costoInstalacion: 100, planPrecio: 0}),
    classifyClient("sin-plan", {nombre: "Tres", estadoSuscripcion: "suspendida", planPrecio: 0}),
  ]);
  assert.equal(result.D_PERSONALIZADO[0].clasificacion, "PARECE_SUSCRIPCION");
  assert.equal(result.E_INSTALACION[0].clasificacion, "PARECE_PAGO_UNICO");
  assert.equal(result.F_SIN_PLAN.casos[0].clasificacion, "PARECE_REGISTRO_ABANDONADO");
  assert.equal(Object.prototype.hasOwnProperty.call(result.D_PERSONALIZADO[0], "email"), false);
});

test("separa adopción de campos nuevos y monedas llamativas", () => {
  const result = summarize([
    classifyClient("nuevo", {planId: "start", billingCycle: "monthly", currency: "ARS", subscriptionStatus: "active", price: 19000, pais: "Argentina"}),
    classifyClient("parcial", {planId: "start", currency: "USD", pais: "México"}),
    classifyClient("historico", {plan: "Mensual", moneda: "CLP", pais: "Colombia"}),
  ]);
  assert.deepEqual([result.I_ADOPCION_CAMPOS_NUEVOS.completos, result.I_ADOPCION_CAMPOS_NUEVOS.parciales, result.I_ADOPCION_CAMPOS_NUEVOS.soloHistoricos], [1, 1, 1]);
  assert.equal(result.H_COMBINACIONES_MONEDA.find((row) => row.clienteId === "parcial").clasificacion, "POSIBLE_ELECCION_EXPLICITA");
  assert.equal(result.H_COMBINACIONES_MONEDA.some((row) => row.clienteId === "historico"), false);
});

test("distribuye suspendidos por antigüedad usando fecha confiable", () => {
  const result = summarize([
    classifyClient("reciente", {estadoSuscripcion: "suspendida", fechaSuspension: "2026-09-01"}),
    classifyClient("antiguo", {estadoSuscripcion: "suspendida", fechaSuspension: "2026-01-01"}),
    classifyClient("sin-fecha", {estadoSuscripcion: "suspendida"}),
  ], {now: new Date("2026-09-08T00:00:00Z")});
  assert.equal(result.J_ANTIGUEDAD_SUSPENDIDOS["0_30_dias"], 1); assert.equal(result.J_ANTIGUEDAD_SUSPENDIDOS.mas_90_dias, 1);
  assert.equal(result.J_ANTIGUEDAD_SUSPENDIDOS.sin_fecha_confiable, 1);
});

test("marca recorrido incompleto y valida CLI sin conectarse", () => {
  const result = summarize([], {complete: false, errors: [{code: "READ_ERROR"}]});
  assert.equal(result.A_RESUMEN_GENERAL.totalesDefinitivos, false); assert.equal(result.A_RESUMEN_GENERAL.errores, 1);
  assert.deepEqual(parseArgs(["--project", "demo", "--page-size", "50"]), {projectId: "demo", pageSize: 50});
  assert.throws(() => parseArgs(["--project", "demo", "--page-size", "0"]));
});
