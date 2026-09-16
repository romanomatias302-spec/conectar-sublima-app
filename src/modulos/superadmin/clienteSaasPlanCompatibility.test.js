import { camposPlanParaEnforcement } from "./clienteSaasPlanCompatibility";

test.each([
  ["Prueba gratis 7 días", "trial"],
  ["Start", "start"],
  ["Profesional", "profesional"],
  ["Profesional Plus", "profesional_plus"],
  ["Empresa", "empresa"],
])("guardar %s sincroniza el ID consumido por enforcement", (nombre, id) => {
  expect(camposPlanParaEnforcement(nombre, { planId: "start" })).toEqual({ planId: id });
});

test("histórico sin ID no se migra al editar", () => {
  expect(camposPlanParaEnforcement("Mensual", { planNombre: "Mensual" })).toEqual({});
  expect(camposPlanParaEnforcement("Personalizado", { planNombre: "Personalizado", planId: "legacy" }))
    .toEqual({ planId: "legacy" });
});

test("cambiar a ciclo legacy no conserva un ID moderno obsoleto", () => {
  expect(camposPlanParaEnforcement("Anual", { planNombre: "Start", planId: "start" }))
    .toEqual({ planId: "legacy" });
});

test("nombre desconocido no reinterpreta el plan existente", () => {
  expect(camposPlanParaEnforcement("Especial", { planId: "custom" })).toEqual({ planId: "custom" });
});
