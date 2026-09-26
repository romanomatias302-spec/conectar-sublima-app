export const HOTMART_SUBSCRIPTION_PORTAL_URL = "https://consumer.hotmart.com";

function safeAccount(account) {
  return account && typeof account === "object" ? account : {};
}

export function normalizeBillingProvider(account = {}) {
  const currentAccount = safeAccount(account);
  const value = String(currentAccount.billingProvider || currentAccount.metodoCobro || "")
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

export function resolveSaasPaymentCurrency(account = {}) {
  const currentAccount = safeAccount(account);
  return String(currentAccount.billingCurrency || currentAccount.currency || "USD")
    .trim()
    .toUpperCase();
}

export function canPaySuspendedAccountWithMercadoPago(account = {}) {
  const currentAccount = safeAccount(account);
  return (
    currentAccount.usuarioActivo === true &&
    currentAccount.rolUsuario === "admin" &&
    String(currentAccount.pais || "").trim().toLowerCase() === "argentina" &&
    resolveSaasPaymentCurrency(currentAccount) === "ARS" &&
    normalizeBillingProvider(currentAccount) !== "hotmart" &&
    Number(currentAccount.saldoCuentaCorriente) > 0
  );
}
