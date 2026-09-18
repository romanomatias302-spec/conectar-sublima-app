// IDs del catálogo de enforcement. No inferir planes por precio o ciclo.
const PLAN_IDS_BY_NAME = Object.freeze({
  "prueba gratis 7 días": "trial",
  trial: "trial",
  start: "start",
  profesional: "profesional",
  "profesional plus": "profesional_plus",
  profesional_plus: "profesional_plus",
  empresa: "empresa",
});

export function camposPlanParaEnforcement(planNombre, clienteAnterior = {}) {
  const nombre = String(planNombre || "").trim().toLowerCase();
  const planId = PLAN_IDS_BY_NAME[nombre];
  if (planId) return { planId };

  const nombreAnterior = String(
    clienteAnterior.planNombre || clienteAnterior.plan || ""
  ).trim().toLowerCase();
  // Una elección explícita de ciclo legacy no debe conservar un ID moderno
  // anterior. Los históricos sin ID siguen usando el fallback del backend.
  if (
    ["mensual", "anual", "personalizado"].includes(nombre) &&
    nombreAnterior && nombre !== nombreAnterior
  ) {
    return { planId: "legacy" };
  }
  return clienteAnterior.planId ? { planId: clienteAnterior.planId } : {};
}
