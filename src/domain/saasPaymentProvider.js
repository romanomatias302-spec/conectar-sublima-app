export const HOTMART_SUBSCRIPTION_PORTAL_URL = "https://consumer.hotmart.com";

export function normalizeBillingProvider(account = {}) {
  const value = String(account.billingProvider || account.metodoCobro || "")
    .trim()
    .toLowerCase();
  if (value === "mercadopago") return "mercadopago";
  if (value === "hotmart") return "hotmart";
  return "manual";
}

export function accountPaymentAction(account = {}) {
  const provider = normalizeBillingProvider(account);
  if (provider === "hotmart") {
    return {
      provider,
      label: "Administrar en Hotmart",
      url: HOTMART_SUBSCRIPTION_PORTAL_URL,
      createsSubscription: false,
    };
  }
  if (provider === "mercadopago") {
    return {provider, label: "Pagar con Mercado Pago", url: "", createsSubscription: false};
  }
  return {provider, label: "Informar pago", url: "", createsSubscription: false};
}
