import {
  activateSaasClientRow,
  buildSaasPanelMetrics,
  buildSaasTabUrl,
  classifySaasClient,
  filterSaasClients,
  formatSaasMoney,
  getActiveSaasClients,
  getSaasTabFromSearch,
  groupActiveClientsByCountry,
  groupActiveSubscriptionsByBillingCycle,
  isInteractiveSaasTarget,
  matchesSaasClientSearch,
  refreshAfterSaasMutation,
  resolveSaasCurrency,
  resolveSaasMovementCurrency,
  resolveSaasPlanLabel,
  syncSaasTabFromLocation,
} from "./saasPanel";

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
