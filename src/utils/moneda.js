export function formatearMoneda(valor, moneda = "ARS", locale = "es-AR") {
  const numero = Number(valor || 0);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: moneda,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numero);
  } catch (error) {
    console.error("Error formateando moneda:", error);
    return `${numero}`;
  }
}

export function obtenerConfigMonedaDesdePerfil(perfil) {
  return {
    moneda: perfil?.moneda || "ARS",
    localeMoneda: perfil?.localeMoneda || "es-AR",
  };
}