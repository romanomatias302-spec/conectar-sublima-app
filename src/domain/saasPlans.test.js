import {
  canAddBranch, canAddUser, getPlanDefinition, priceAfterCurrencyChange, priceForPlan,
  rehydrateSaasClient, resolveCurrencyAfterCountryChange, resolveManualSaasPlanId,
  resolveSaasEntitlements,
  SUPPORTED_CURRENCIES, validateSaasSubscription,
} from "./saasPlans";

test.each([
  ["start", 2, 1], ["profesional", 5, 2], ["profesional_plus", 10, 5],
])("%s expone límites correctos", (id, users, branches) => {
  const plan = getPlanDefinition(id);
  expect([plan.maxUsers, plan.maxBranches]).toEqual([users, branches]);
  expect(canAddUser({ planId: id }, users - 1)).toBe(true);
  expect(canAddUser({ planId: id }, users)).toBe(false);
  expect(canAddBranch({ planId: id }, branches)).toBe(false);
});

test.each(["empresa", "legacy"])("%s conserva usuarios y sucursales ilimitados", (planId) => {
  expect(canAddUser({ planId }, 99999)).toBe(true);
  expect(canAddBranch({ planId }, 99999)).toBe(true);
});

test.each([["Mensual", "monthly"], ["Anual", "annual"]])("histórico %s resuelve legacy y preserva ciclo", (plan, cycle) => {
  expect(resolveSaasEntitlements({ plan, planPrecio: 100 })).toMatchObject({ planId: "legacy", billingCycle: cycle, isLegacy: true, unlimitedUsers: true, unlimitedBranches: true });
});

test("rehidratación separa moneda operativa de facturación", () => {
  expect(rehydrateSaasClient({
    plan: "Mensual", billingCurrency: "USD", currency: "ARS", moneda: "MXN",
  })).toMatchObject({planId: "legacy", currency: "USD"});
  expect(rehydrateSaasClient({
    plan: "Mensual", currency: "ARS", moneda: "MXN",
  }).currency).toBe("ARS");
  expect(rehydrateSaasClient({
    plan: "Mensual", moneda: "MXN",
  }).currency).toBe("USD");
});

test("legacy permanece legacy mientras no se elige otro plan", () => {
  const legacy = {plan: "Mensual", moneda: "MXN"};
  expect(resolveManualSaasPlanId(legacy, rehydrateSaasClient(legacy).planId)).toBe("legacy");
});

test.each(["start", "profesional", "profesional_plus", "empresa"])(
  "legacy puede cambiarse explícitamente a %s",
  (planId) => {
    const legacy = {plan: "Mensual", moneda: "MXN", usuarios: 8, sucursales: 4};
    const persisted = {...legacy, planId: resolveManualSaasPlanId(legacy, planId)};
    expect(persisted.planId).toBe(planId);
    expect(persisted.moneda).toBe("MXN");
    expect(persisted.usuarios).toBe(8);
    expect(persisted.sucursales).toBe(4);
  }
);

test("resolver un cambio manual no crea cargos ni altera fechas históricas", () => {
  const legacy = {
    plan: "Anual", fechaProximoCargo: "2027-04-10",
    saldoCuentaCorriente: 250, movimientos: ["cargo-historico"],
  };
  const snapshot = JSON.parse(JSON.stringify(legacy));
  expect(resolveManualSaasPlanId(legacy, "start")).toBe("start");
  expect(legacy).toEqual(snapshot);
});

test("cambiar país nunca modifica la moneda de billing", () => {
  expect(resolveCurrencyAfterCountryChange({country: "Colombia", currentCurrency: "USD", currencyExplicit: true, isNew: true})).toBe("USD");
  expect(resolveCurrencyAfterCountryChange({country: "Colombia", currentCurrency: "", currencyExplicit: false, isNew: false})).toBe("");
  expect(resolveCurrencyAfterCountryChange({country: "Colombia", currentCurrency: "", currencyExplicit: false, isNew: true})).toBe("USD");
});

test.each([undefined, null, "", -1, Number.NaN])("plan pago rechaza precio %p", (price) => {
  expect(validateSaasSubscription({ planId: "start", billingCycle: "monthly", currency: "ARS", price }).valid).toBe(false);
});

test("plan pago permite precio cero", () => {
  expect(validateSaasSubscription({
    planId: "start", billingCycle: "monthly", currency: "USD", price: 0,
  }).valid).toBe(true);
});

test("trial permite precio cero y los precios mensuales están versionados", () => {
  expect(validateSaasSubscription({ planId: "trial", billingCycle: "monthly", currency: "ARS", price: 0 }).valid).toBe(true);
  expect(priceForPlan("profesional_plus", "ARS")).toBe(79000);
  expect(priceForPlan("empresa", "USD")).toBe(140);
  expect(priceForPlan("start", "ARS", "annual")).toBeNull();
});

test("representación monetaria y precios automáticos son conceptos separados", () => {
  expect(SUPPORTED_CURRENCIES).toEqual(["ARS", "USD", "MXN", "COP", "PEN", "CLP"]);
  expect(priceForPlan("start", "ARS")).toBe(19000);
  expect(priceForPlan("start", "USD")).toBe(19);
  expect(["MXN", "COP", "PEN", "CLP"].map((currency) => priceForPlan("start", currency))).toEqual([null, null, null, null]);
  expect(["MXN", "COP", "PEN", "CLP"].every((currency) => !validateSaasSubscription({planId: "start", billingCycle: "monthly", currency, price: ""}).valid)).toBe(true);
  expect(["MXN", "COP", "PEN", "CLP"].every((currency) => validateSaasSubscription({planId: "start", billingCycle: "monthly", currency, price: 1}).valid)).toBe(true);
  expect(priceAfterCurrencyChange({planId: "start", currency: "COP", billingCycle: "monthly", currentPrice: 19000})).toBe("");
  expect(priceAfterCurrencyChange({planId: "legacy", currency: "COP", billingCycle: "monthly", currentPrice: 25000})).toBe(25000);
});
