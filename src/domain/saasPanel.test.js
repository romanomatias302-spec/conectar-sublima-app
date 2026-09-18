import {
  activateSaasClientRow,
  buildSaasPanelMetrics,
  buildSaasTabUrl,
  classifySaasClient,
  filterSaasClients,
  formatSaasMoney,
  formatRecentSaasPayment,
  getActiveSaasClients,
  getSaasTabFromSearch,
  groupActiveClientsByCountry,
  groupActiveSubscriptionsByBillingCycle,
  initialSaasBillingRecordStatus,
  isInteractiveSaasTarget,
  matchesSaasClientSearch,
  refreshAfterSaasMutation,
  resolveSaasCurrency,
  resolveSaasMovementCurrency,
  resolveSaasPlanLabel,
  syncSaasTabFromLocation,
  saasBalanceStatus,
  indexInitialSaasBilling,
  groupActiveClientsByCountryAndPlan,
  summarizeSaasMovements,
  buildPaidSaasSummary,
  sumSaasPlanRows,
  restoreSaasSection,
  persistSaasSection,
  isCommerciallyActivePaidClient,
  resolveSaasClientStatus,
} from "./saasPanel";

test.each([undefined, null, "", " ", "invalid", NaN, Infinity, true, {}])("pago reciente rechaza monto inválido %p", (monto) => {
  expect(formatRecentSaasPayment({monto})).toBe("—");
});
test("pago reciente conserva moneda explícita y no inventa moneda histórica", () => {
  expect(formatRecentSaasPayment({monto: 1234, billingCurrency: "USD"})).toBe(formatSaasMoney(1234, "USD"));
  expect(formatRecentSaasPayment({monto: 1234})).toBe("1.234 · moneda no informada");
  expect(formatRecentSaasPayment({monto: 0})).toBe("0 · moneda no informada");
  expect(formatRecentSaasPayment({monto: 0, currency: "ARS"})).toBe(formatSaasMoney(0, "ARS"));
  expect(formatSaasMoney(1234, "")).toBe("—");
});

test.each([
  [{estado: "activo", subscriptionStatus: "active"}, "active"],
  [{estado: "activo", subscriptionStatus: "suspended"}, "suspended"],
  [{suspendidoManual: true}, "suspended"], [{suspendidoPorSistema: true}, "suspended"],
  [{subscriptionStatus: "past_due"}, "grace"], [{estadoSuscripcion: "gracia"}, "grace"],
  [{estadoSuscripcion: "mora"}, "grace"], [{estado: "cancelado"}, "canceled"],
  [{subscriptionStatus: "canceled"}, "canceled"], [{planId: "trial"}, "trial"],
  [{planId: "trial", suspendidoManual: true}, "suspended"],
  [{estado: "cancelado", suspendidoManual: true}, "canceled"],
  [{activo: false, subscriptionStatus: "active"}, "inactive"],
])("estado canónico %j -> %s", (client, expected) => {
  expect(resolveSaasClientStatus(client)).toBe(expected);
  expect(classifySaasClient(client).label).toBe({active: "Activo", suspended: "Suspendido", grace: "En gracia", canceled: "Cancelado", inactive: "Inactivo", trial: "Prueba"}[expected]);
});

test.each(["Prueba", "Prueba 7 dias", "Prueba gratis", "Prueba gratis 7 días", "trial"])("alias %s se agrupa como trial único", (planNombre) => {
  expect(resolveSaasPlanLabel({planNombre})).toBe("Prueba gratis 7 días");
  expect(resolveSaasClientStatus({planNombre})).toBe("trial");
});

test("planId canónico tiene prioridad y filtros usan suspensión canónica", () => {
  expect(resolveSaasPlanLabel({planId: "start", planNombre: "Prueba"})).toBe("Start");
  const client = {id: "a", estado: "activo", subscriptionStatus: "suspended"};
  expect(filterSaasClients([client], {state: "active"})).toEqual([]);
  expect(filterSaasClients([client], {state: "suspended"})).toEqual([client]);
});

test("ingresos separan ciclos y monedas sin prorratear ni usar moneda operativa", () => {
  const clients = [
    {planId: "start", billingCycle: "monthly", price: 40, billingCurrency: "USD", currency: "ARS"},
    {planId: "empresa", billingCycle: "annual", price: 1200, currency: "USD"},
    {plan: "Mensual", price: 3000, currency: "ARS"},
    {planId: "start", billingCycle: "monthly", price: 100, moneda: "MXN"},
  ];
  const result = buildPaidSaasSummary(clients);
  expect(result.monthly).toEqual({USD: 40, ARS: 3000});
  expect(result.annual).toEqual({USD: 1200});
});

test.each([
  {planId: "start", subscriptionStatus: "suspended"},
  {planId: "trial"}, {plan: "Prueba gratis 7 días"},
  {plan: "Personalizado"}, {plan: "instalacion"}, {},
  {planId: "start", estado: "inactivo"},
  {planId: "start", subscriptionStatus: "cancelled"},
])("excluye categorías no pagas/activas: %j", (fields) => {
  const result = buildPaidSaasSummary([{billingCycle: "monthly", price: 99, currency: "USD", ...fields}]);
  expect(result.active).toHaveLength(0);
  expect(result.monthly).toEqual({});
  expect(result.rows).toEqual([]);
});

test("país/plan distingue Legacy mensual/anual y suma columnas y total", () => {
  const result = buildPaidSaasSummary([
    {plan: "Mensual", pais: "Argentina"}, {plan: "Anual", pais: "Argentina"},
    {planId: "start", billingCycle: "monthly", pais: "México"}, {planId: "start", pais: "Argentina", estado: "suspendido"},
  ]);
  expect(result.totals).toEqual({total: 3, monthly: 2, annual: 1, plans: {"Legacy anual": 1, "Legacy mensual": 1, Start: 1}});
  expect(result.rows.find((row) => row.country === "Argentina").total).toBe(2);
});

test.each(["active", "past_due", "gracia", "mora"])("estado %s cuenta como vigente pago", (subscriptionStatus) => {
  expect(isCommerciallyActivePaidClient({planId: "start", billingCycle: "monthly", subscriptionStatus})).toBe(true);
});

test("15 activos y 12 gracia legacy mensual son 27 vigentes", () => {
  const clients = Array.from({length: 27}, (_, i) => ({plan: "Mensual", pais: "Argentina", price: 10, billingCurrency: "USD", estadoSuscripcion: i < 15 ? "activo" : "gracia"}));
  const result = buildPaidSaasSummary(clients);
  expect(result.active).toHaveLength(27);
  expect(result.totals).toMatchObject({total: 27, monthly: 27, annual: 0});
  expect(result.rows[0].plans["Legacy mensual"]).toBe(27);
  expect(result.monthly).toEqual({USD: 270});
});

test("gracia anual suma importe completo y totales coinciden con ciclos", () => {
  const result = buildPaidSaasSummary([
    {plan: "Anual", estadoSuscripcion: "gracia", price: 1200, currency: "USD"},
    {planId: "start", billingCycle: "monthly", subscriptionStatus: "past_due", price: 20, currency: "USD"},
  ]);
  expect(result.annual).toEqual({USD: 1200});
  expect(result.monthly).toEqual({USD: 20});
  expect(result.active.length).toBe(result.totals.monthly + result.totals.annual);
  expect(result.rows[0].total).toBe(result.rows[0].monthly + result.rows[0].annual);
});

test("plan pago sin ciclo no se inventa como mensual ni anual", () => {
  expect(isCommerciallyActivePaidClient({planId: "start", subscriptionStatus: "past_due"})).toBe(false);
});

test("fila TOTAL suma activos de filas sin sumar suspendidos", () => {
  expect(sumSaasPlanRows([{total: 10, active: 9, suspended: 1}, {total: 5, active: 2, grace: 3}]))
    .toEqual({total: 15, active: 11, suspended: 1, grace: 3, trial: 0});
});

test("sección restaura valores válidos, respeta URL y tolera storage inválido", () => {
  const storage = {getItem: () => "estadisticas", setItem: jest.fn()};
  expect(restoreSaasSection(storage)).toBe("estadisticas");
  expect(restoreSaasSection(storage, "?tab=comercial")).toBe("comercial");
  expect(restoreSaasSection({getItem: () => "otra"})).toBe("clientes");
  expect(restoreSaasSection({getItem: () => {throw new Error();}})).toBe("clientes");
  persistSaasSection(storage, "auditoria");
  expect(storage.setItem).toHaveBeenCalledWith("duenoSaasSeccionActiva", "auditoria");
});

test.each([[40, "Con deuda"], [0, "Al día"], [-10, "Crédito a favor"]])("saldo %s: %s", (balance, label) => {
  expect(saasBalanceStatus({saldoCuentaCorriente: balance})).toMatchObject({balance, label});
});

test("index inicial conserva evidencia y excluye movimientos anulados", () => {
  const clients = [{id: "a", planId: "start"}, {id: "b", planId: "trial"}];
  expect(indexInitialSaasBilling(clients, [{clienteSaasId: "a", tipoMovimiento: "cargo", anulado: true}]).a.needsAttention).toBe(true);
  expect(indexInitialSaasBilling(clients, [{clienteSaasId: "a", tipoMovimiento: "pago"}]).a.needsAttention).toBe(false);
  expect(indexInitialSaasBilling(clients, []).b.needsAttention).toBe(false);
});

test("país y plan mantienen Legacy y excluyen cancelados", () => {
  const clients = [{pais: "Argentina", planId: "start"},
    {pais: "Argentina", planId: "legacy", billingCycle: "monthly"},
    {pais: "Argentina", planId: "empresa", estado: "inactivo"}];
  expect(groupActiveClientsByCountryAndPlan(clients)).toEqual([
    {country: "Argentina", total: 2, plans: {Start: 1, Legacy: 1}},
  ]);
});

test("cargos y pagos se separan por moneda, sin anulados ni moneda operativa", () => {
  expect(summarizeSaasMovements([
    {tipoMovimiento: "cargo", monto: 100, billingCurrency: "USD", currency: "ARS"},
    {tipoMovimiento: "pago", monto: 30, currency: "USD"},
    {tipoMovimiento: "cargo", monto: 1000, moneda: "ARS"},
    {tipoMovimiento: "pago", monto: 800, moneda: "ARS"},
    {tipoMovimiento: "cargo", monto: 9999, currency: "USD", anulado: true},
    {tipoMovimiento: "pago", monto: 2},
  ])).toEqual({expected: {USD: 100, ARS: 1000}, collected: {USD: 30, ARS: 800}, pending: {USD: 70, ARS: 200}, withoutCurrency: 1});
});

test("indicador inicial distingue plan pago completo, incompleto y legacy gratuito", () => {
  const client = {id: "paid", planId: "start", billingCycle: "monthly", subscriptionStatus: "active"};
  expect(initialSaasBillingRecordStatus(client, [])).toMatchObject({applicable: true, needsAttention: true});
  expect(initialSaasBillingRecordStatus(client, [{clienteSaasId: "paid", tipoMovimiento: "cargo", anulado: false}]))
    .toMatchObject({complete: true, needsAttention: false});
  expect(initialSaasBillingRecordStatus({...client, ultimoPago: "2026-09-01"}, [])).toMatchObject({complete: true});
  expect(initialSaasBillingRecordStatus({id: "legacy", planId: "legacy", billingCycle: "monthly", price: 0}, []))
    .toMatchObject({applicable: false, needsAttention: false});
});

test("moneda comercial del cliente nunca cae en moneda operativa", () => {
  expect(resolveSaasCurrency({
    billingCurrency: "USD", currency: "ARS", moneda: "MXN",
  }, "USD")).toBe("USD");
  expect(resolveSaasCurrency({currency: "ARS", moneda: "MXN"}, "USD")).toBe("ARS");
  expect(resolveSaasCurrency({moneda: "MXN"}, "USD")).toBe("USD");
  expect(resolveSaasMovementCurrency({moneda: "PEN"})).toBe("PEN");
});

test("MRR y cobrado nunca mezclan monedas y preservan monedas minoritarias", () => {
  const clients = [
    {id: "a", billingCycle: "monthly", price: 100, currency: "ARS", subscriptionStatus: "active"},
    {id: "u", billingCycle: "monthly", price: 10, currency: "USD", subscriptionStatus: "active"},
    {id: "m", billingCycle: "monthly", price: 20, currency: "MXN", subscriptionStatus: "past_due"},
    {id: "t", billingCycle: "monthly", price: 999, currency: "ARS", subscriptionStatus: "trial"},
    {id: "c", billingCycle: "monthly", price: 50, currency: "COP", subscriptionStatus: "suspended", fechaSuspension: "2026-06-01"},
  ];
  const movements = [
    {tipoMovimiento: "pago", monto: 30, moneda: "ARS"},
    {tipoMovimiento: "pago", monto: 2, moneda: "USD"},
    {tipoMovimiento: "pago", monto: 7, moneda: "PEN"},
  ];
  const data = buildSaasPanelMetrics(clients, movements, new Date("2026-09-09T00:00:00Z"));
  expect(data.mrr.active).toEqual({ARS: 100, USD: 10});
  expect(data.mrr.grace).toEqual({MXN: 20});
  expect(data.mrr.recoverable).toEqual({});
  expect(data.collected).toEqual({ARS: 30, USD: 2, PEN: 7});
});

test.each([
  ["2026-08-20", "risk", "suspended"],
  ["2026-07-25", "recovery", "suspended"],
  ["2026-06-01", "not_recovered", "churn"],
  [null, "unclassified", "suspended"],
])("clasifica antigüedad de suspensión %s", (date, churn, group) => {
  expect(classifySaasClient({subscriptionStatus: "suspended", fechaSuspension: date}, new Date("2026-09-09T00:00:00Z"))).toMatchObject({churn, group});
});

test.each(["Acme", "ventas@acme.com", "tenant-7", "Perú", "Profesional Plus"])("busca por %s ignorando mayúsculas y tildes", (search) => {
  const client = {id: "tenant-7", nombre: "Ácme", email: "ventas@acme.com", pais: "Peru", planId: "profesional_plus"};
  expect(matchesSaasClientSearch(client, search)).toBe(true);
});

test("filtros admiten estado, plan, país y moneda", () => {
  const clients = [
    {id: "a", planId: "start", pais: "Argentina", currency: "ARS", subscriptionStatus: "active"},
    {id: "b", planId: "start", pais: "México", currency: "MXN", subscriptionStatus: "past_due"},
  ];
  expect(filterSaasClients(clients, {state: "grace", plan: "Start", country: "México", currency: "MXN"}).map((c) => c.id)).toEqual(["b"]);
});

test("tabs soportan refresh, enlaces directos y fallback", () => {
  expect(getSaasTabFromSearch("?tab=estadisticas")).toBe("estadisticas");
  expect(getSaasTabFromSearch("?tab=invalida")).toBe("clientes");
  expect(buildSaasTabUrl({pathname: "/panel", search: "?x=1"}, "estadisticas")).toBe("/panel?x=1&tab=estadisticas");
  const changes = [];
  syncSaasTabFromLocation({search: "?tab=estadisticas"}, (tab) => changes.push(tab));
  syncSaasTabFromLocation({search: "?tab=clientes"}, (tab) => changes.push(tab));
  expect(changes).toEqual(["estadisticas", "clientes"]);
});

test("refresh dirigido actualiza sólo las fuentes afectadas", async () => {
  const calls = [];
  const loaders = {clients: async () => calls.push("clients"), movements: async () => calls.push("movements")};
  expect(await refreshAfterSaasMutation("payment", loaders)).toEqual(["clients", "movements"]);
  expect(calls).toEqual(["clients", "movements"]);
  calls.length = 0;
  expect(await refreshAfterSaasMutation("plan", loaders)).toEqual(["clients"]);
  expect(calls).toEqual(["clients"]);
  calls.length = 0;
  expect(await refreshAfterSaasMutation("suspension", loaders)).toEqual(["clients"]);
  expect(calls).toEqual(["clients"]);
});

test("controles interactivos no disparan apertura de fila", () => {
  const row = document.createElement("tr");
  const button = document.createElement("button");
  row.appendChild(button);
  expect(isInteractiveSaasTarget(button)).toBe(true);
  expect(isInteractiveSaasTarget(row)).toBe(false);
});

test("la fila abre el cliente y el botón de acciones no", () => {
  const opened = [];
  const row = document.createElement("tr");
  row.setAttribute("role", "button");
  const cell = document.createElement("td");
  const button = document.createElement("button");
  row.append(cell, button);
  expect(activateSaasClientRow({target: row, currentTarget: row}, {id: "a"}, (client) => opened.push(client.id))).toBe(true);
  expect(activateSaasClientRow({target: cell, currentTarget: row}, {id: "b"}, (client) => opened.push(client.id))).toBe(true);
  expect(activateSaasClientRow({target: button, currentTarget: row}, {id: "c"}, (client) => opened.push(client.id))).toBe(false);
  expect(opened).toEqual(["a", "b"]);
});

test("presentación legacy y moneda ausente son seguras", () => {
  expect(resolveSaasPlanLabel({plan: "Mensual", frecuenciaCobro: "mensual"})).toBe("Legacy mensual");
  expect(resolveSaasPlanLabel({})).toBe("Sin plan");
  expect(formatSaasMoney(10, "")).toBe("—");
});

test("alias históricos de estado y cargos únicos no distorsionan el MRR", () => {
  const clients = [
    {id: "grace", plan: "Mensual", frecuenciaCobro: "mensual", planPrecio: 120, moneda: "ARS", estadoSuscripcion: "mora"},
    {id: "one-off", plan: "Instalación", frecuenciaCobro: "mensual", planPrecio: 500, moneda: "USD", estadoSuscripcion: "activa"},
  ];
  const data = buildSaasPanelMetrics(clients, []);
  expect(data.counts.grace).toBe(1);
  expect(data.mrr.grace).toEqual({USD: 120});
  expect(data.mrr.active).toEqual({});
});

describe("suscripciones activas ejecutivas", () => {
  const now = new Date("2026-09-09T00:00:00Z");
  const clients = [
    {id: "legacy-monthly", plan: "Mensual", estadoSuscripcion: "activa", pais: "Argentina"},
    {id: "legacy-annual", plan: "Anual", estadoSuscripcion: "activa", pais: "Argentina"},
    {id: "new-monthly", planId: "start", billingCycle: "monthly", subscriptionStatus: "active", pais: "México"},
    {id: "new-annual", planId: "empresa", billingCycle: "annual", subscriptionStatus: "active", pais: "Colombia"},
    {id: "new-no-cycle", planId: "profesional", subscriptionStatus: "active"},
    {id: "trial", planId: "trial", billingCycle: "monthly", subscriptionStatus: "trial", pais: "Argentina"},
    {id: "suspended", plan: "Mensual", estado: "suspendido", fechaSuspension: "2026-09-01", pais: "Argentina"},
    {id: "churn", plan: "Mensual", estado: "suspendido", fechaSuspension: "2026-01-01", pais: "Argentina"},
    {id: "installation", plan: "Instalación", frecuenciaCobro: "mensual", estadoSuscripcion: "activa", pais: "Chile"},
    {id: "custom-no-cycle", plan: "Personalizado", estadoSuscripcion: "activa", pais: "Perú"},
  ];

  test("activos excluye prueba, suspendidos, churn e instalación", () => {
    expect(getActiveSaasClients(clients, now).map((client) => client.id)).toEqual([
      "legacy-monthly", "legacy-annual", "new-monthly", "new-annual", "new-no-cycle",
    ]);
  });

  test("agrupa ciclos nuevos e históricos sin duplicar", () => {
    const cycles = groupActiveSubscriptionsByBillingCycle(clients, now);
    expect(cycles).toEqual({monthly: 2, annual: 2, withoutCycle: 1});
    expect(cycles.monthly + cycles.annual + cycles.withoutCycle).toBeLessThanOrEqual(getActiveSaasClients(clients, now).length);
  });

  test("un suspendido mensual no cuenta como suscripción mensual activa", () => {
    expect(groupActiveSubscriptionsByBillingCycle([clients[6]], now)).toEqual({monthly: 0, annual: 0, withoutCycle: 0});
  });

  test("país agrupa sólo activos, conserva Sin país y coincide con el total", () => {
    const countries = groupActiveClientsByCountry(clients, now);
    expect(countries).toEqual([
      {country: "Argentina", total: 2},
      {country: "Colombia", total: 1},
      {country: "México", total: 1},
      {country: "Sin país", total: 1},
    ]);
    expect(countries.reduce((total, row) => total + row.total, 0)).toBe(getActiveSaasClients(clients, now).length);
  });
});
