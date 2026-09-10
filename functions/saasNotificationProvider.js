/* eslint-disable require-jsdoc */

class SaasNotificationProvider {
  async sendTransactionalEmail() {
    const error = new Error("No hay un proveedor de email configurado.");
    error.code = "EMAIL_PROVIDER_NOT_CONFIGURED";
    throw error;
  }
}

function assertNotificationProvider(provider) {
  if (!provider || typeof provider.sendTransactionalEmail !== "function") {
    const error = new Error(
        "El adaptador de email no cumple la interfaz requerida.");
    error.code = "INVALID_EMAIL_PROVIDER";
    throw error;
  }
  return provider;
}

module.exports = {assertNotificationProvider, SaasNotificationProvider};
