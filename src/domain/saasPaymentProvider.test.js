import {
  accountPaymentAction,
  HOTMART_SUBSCRIPTION_PORTAL_URL,
  normalizeBillingProvider,
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
