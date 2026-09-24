import {
  accountPaymentAction,
  canPaySuspendedAccountWithMercadoPago,
  HOTMART_SUBSCRIPTION_PORTAL_URL,
  normalizeBillingProvider,
  resolveSaasPaymentCurrency,
} from "./saasPaymentProvider";

test("Hotmart dirige al portal de la suscripción existente", () => {
  const action = accountPaymentAction({billingProvider: "hotmart"});
  expect(action).toEqual({
    provider: "hotmart",
    label: "Administrar en Hotmart",
    url: HOTMART_SUBSCRIPTION_PORTAL_URL,
    createsSubscription: false,
  });
});

test("Mercado Pago y manual conservan sus acciones", () => {
  expect(normalizeBillingProvider({metodoCobro: "mercadopago"})).toBe("mercadopago");
  expect(accountPaymentAction({metodoCobro: "mercadopago"}).label)
    .toBe("Pagar con Mercado Pago");
  expect(accountPaymentAction({}).label).toBe("Informar pago");
});

test("la acción Hotmart sólo navega al portal y nunca reactiva ni crea suscripción", () => {
  const action = accountPaymentAction({
    billingProvider: "hotmart",
    hotmartSubscriptionId: "SUB-1",
    suspendidoPorSistema: true,
  });
  expect(action.createsSubscription).toBe(false);
  expect(action).not.toHaveProperty("reactivatesAccount");
  expect(action.url).toBe("https://consumer.hotmart.com");
});

test("habilita pago suspendido sólo al admin activo elegible y usa moneda SaaS", () => {
  const eligible = {
    usuarioActivo: true,
    rolUsuario: "admin",
    pais: "Argentina",
    billingProvider: "mercadopago",
    billingCurrency: "ARS",
    moneda: "USD",
    saldoCuentaCorriente: 10,
  };
  expect(canPaySuspendedAccountWithMercadoPago(eligible)).toBe(true);
  expect(canPaySuspendedAccountWithMercadoPago({...eligible, rolUsuario: "usuario"})).toBe(false);
  expect(canPaySuspendedAccountWithMercadoPago({...eligible, usuarioActivo: false})).toBe(false);
  expect(canPaySuspendedAccountWithMercadoPago({...eligible, billingCurrency: "USD"})).toBe(false);
  expect(canPaySuspendedAccountWithMercadoPago({...eligible, pais: "Uruguay"})).toBe(false);
  expect(canPaySuspendedAccountWithMercadoPago({...eligible, billingProvider: "manual"})).toBe(false);
  expect(canPaySuspendedAccountWithMercadoPago({...eligible, saldoCuentaCorriente: 0})).toBe(false);
});

test.each([
  ["anónimo", null],
  ["perfil todavía cargando", undefined],
  ["estado inicial vacío", {}],
  ["usuario común", {usuarioActivo: true, rolUsuario: "usuario"}],
])("%s nunca queda autorizado durante autenticación o carga", (_case, account) => {
  expect(canPaySuspendedAccountWithMercadoPago(account)).toBe(false);
  expect(() => accountPaymentAction(account)).not.toThrow();
  expect(() => resolveSaasPaymentCurrency(account)).not.toThrow();
});

test("recarga con sesión habilita sólo después de cargar la empresa suspendida elegible", () => {
  const loadingAccount = null;
  const suspendedAccount = {
    usuarioActivo: true,
    rolUsuario: "admin",
    pais: "Argentina",
    billingProvider: "mercadopago",
    billingCurrency: "ARS",
    saldoCuentaCorriente: 100,
  };

  expect(canPaySuspendedAccountWithMercadoPago(loadingAccount)).toBe(false);
  expect(canPaySuspendedAccountWithMercadoPago(suspendedAccount)).toBe(true);
});

test("resuelve billingCurrency, luego currency y finalmente USD sin usar moneda", () => {
  expect(resolveSaasPaymentCurrency({billingCurrency: "ARS", currency: "USD"})).toBe("ARS");
  expect(resolveSaasPaymentCurrency({currency: "ARS", moneda: "USD"})).toBe("ARS");
  expect(resolveSaasPaymentCurrency({moneda: "ARS"})).toBe("USD");
});
