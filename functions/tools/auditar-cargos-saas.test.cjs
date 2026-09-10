"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {auditClients, compactMovement, parseArgs} = require("./auditar-cargos-saas.cjs");

test("detecta duplicados, pendientes y anomalías sin objetos completos", () => {
  const clients = [{id: "a", data: {planId: "start", billingCycle: "monthly", currency: "ARS", price: 10, subscriptionStatus: "suspended", suspendidoPorSistema: true, fechaSuspension: "2026-08-01", fechaAlta: "2026-01-01"}}];
  const movements = [
    compactMovement("c1", {clienteSaasId: "a", tipoMovimiento: "cargo", monto: 10, moneda: "ARS", periodoFacturado: "2026-08", fechaPago: "2026-08-02"}),
    compactMovement("c2", {clienteSaasId: "a", tipoMovimiento: "cargo", monto: 10, moneda: "ARS", periodoFacturado: "2026-08", fechaPago: "2026-08-03"}),
    compactMovement("p1", {clienteSaasId: "a", tipoMovimiento: "pago", monto: 5, periodoFacturado: "2026-08", fechaPago: "2026-08-04"}),
    compactMovement("bad", {clienteSaasId: "a", tipoMovimiento: "cargo", monto: 0}),
  ];
  const result = auditClients(clients, movements, new Date("2026-09-09T00:00:00Z"));
  assert.equal(result.resumen.clientesConDuplicados, 1);
  assert.equal(result.resumen.suspendidosConCargosPosteriores, 1);
  assert.equal(result.resumen.cargosPrecioInvalido, 1);
  assert.equal(result.clientes[0].cargosPendientes, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(result.clientes[0], "email"), false);
});

test("detecta activo sin cargo esperado y movimientos huérfanos", () => {
  const clients = [{id: "a", data: {planId: "start", billingCycle: "monthly", currency: "ARS", price: 10, subscriptionStatus: "active", nextBillingDate: "2026-09-01"}}];
  const movements = [compactMovement("orphan", {clienteSaasId: "missing", tipoMovimiento: "cargo", monto: 2, moneda: "USD", periodoFacturado: "2026-09", fechaPago: "2026-08-22"})];
  const result = auditClients(clients, movements, new Date("2026-08-22T00:00:00Z"));
  assert.equal(result.clientes[0].activoSinCargoEsperado, "2026-09");
  assert.deepEqual(result.movimientosHuerfanos, ["orphan"]);
  assert.equal(result.resumen.lecturasDocumentalesAproximadas, 2);
});

test("distingue reactivación de un cargo realmente emitido durante suspensión", () => {
  const clients = [
    {id: "reactivado", data: {subscriptionStatus: "active", fechaSuspension: "2026-01-01", fechaReactivacion: "2026-02-01"}},
    {id: "sin_historial", data: {subscriptionStatus: "active", fechaSuspension: "2026-01-01"}},
  ];
  const movements = [
    compactMovement("durante", {clienteSaasId: "reactivado", tipoMovimiento: "cargo", monto: 1, fechaPago: "2026-01-15"}),
    compactMovement("despues", {clienteSaasId: "reactivado", tipoMovimiento: "cargo", monto: 1, fechaPago: "2026-02-15"}),
    compactMovement("incierto", {clienteSaasId: "sin_historial", tipoMovimiento: "cargo", monto: 1, fechaPago: "2026-02-15"}),
  ];
  const result = auditClients(clients, movements);
  assert.deepEqual(result.clientes[0].cargosDuranteSuspensionConfirmados, ["durante"]);
  assert.deepEqual(result.clientes[0].cargosPosterioresSuspensionPorRevisar, []);
  assert.deepEqual(result.clientes[1].cargosPosterioresSuspensionPorRevisar, ["incierto"]);
  assert.equal(result.resumen.activosConCargosPosterioresPorRevisar, 1);
});

test("valida CLI localmente", () => {
  assert.deepEqual(parseArgs(["--project", "demo", "--page-size", "100"]), {projectId: "demo", pageSize: 100});
  assert.throws(() => parseArgs(["--project", "demo", "--page-size", "0"]));
});
