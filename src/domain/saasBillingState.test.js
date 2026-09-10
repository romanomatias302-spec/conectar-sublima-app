import {
  buildRecurringChargeAdvancePatch,
  buildSaasReactivationPatch,
  deterministicSaasChargeId,
  nextSaasBillingDate,
  recurringSaasPeriodKey,
} from "./saasBillingState";

const suspended = {suspendidoPorSistema: true, frecuenciaCobro: "mensual"};

test("deuda saldada reactiva y congela meses omitidos", () => {
  expect(buildSaasReactivationPatch(suspended, 0, new Date("2026-09-09T12:00:00Z"))).toMatchObject({
    estado: "activo", fechaReactivacion: "2026-09-09", nextBillingDate: "2026-10-09", billingCycleSequence: 0,
  });
});

test("deuda parcial y suspensión manual no reactivan", () => {
  expect(buildSaasReactivationPatch(suspended, 1, new Date())).toBeNull();
  expect(buildSaasReactivationPatch({...suspended, suspendidoManual: true}, 0, new Date())).toBeNull();
});

test("reactivación anual calcula el próximo año", () => {
  expect(buildSaasReactivationPatch({...suspended, frecuenciaCobro: "anual"}, 0, new Date("2026-09-09T00:00:00Z")).nextBillingDate).toBe("2027-09-09");
});

test("ciclo mensual preserva el día y ajusta fin de mes", () => {
  expect(nextSaasBillingDate("2026-01-31", "monthly")).toBe("2026-02-28");
  expect(nextSaasBillingDate("2024-02-29", "annual")).toBe("2025-02-28");
});

test("cargo recurrente usa una clave determinística", () => {
  expect(deterministicSaasChargeId("tenant", "2026-09")).toBe("cargo_tenant_2026-09");
});

test("cargo manual y scheduler resuelven el mismo período", () => {
  const client = {billingCycle: "monthly", nextBillingDate: "2026-09-30", billingCycleSequence: 2};
  expect(recurringSaasPeriodKey(client, new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
  expect(recurringSaasPeriodKey({...client, billingCycle: "annual"})).toBe("2026-09-30-ANUAL");
});

test("cargo recurrente manual avanza el ciclo de calendario", () => {
  expect(buildRecurringChargeAdvancePatch({billingCycle: "monthly", nextBillingDate: "2026-01-31"}, "2026-01")).toMatchObject({
    ultimoPeriodoFacturado: "2026-01",
    nextBillingDate: "2026-02-28",
    fechaVencimiento: "2026-02-07",
    billingCycleSequence: 1,
  });
});
