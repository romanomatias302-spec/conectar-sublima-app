import { fusionarDocumentosPaginados } from "./paginacionRealtime";

test("una actualización de la primera página preserva páginas históricas", () => {
  const actuales = [
    { firebaseId: "reciente", createdAt: 3, valor: "anterior" },
    { firebaseId: "pagina-2", createdAt: 1 },
  ];
  const entrantes = [
    { firebaseId: "nuevo", createdAt: 4 },
    { firebaseId: "reciente", createdAt: 3, valor: "actualizado" },
  ];

  const resultado = fusionarDocumentosPaginados({ actuales, entrantes });

  expect(resultado.map((item) => item.firebaseId)).toEqual([
    "nuevo",
    "reciente",
    "pagina-2",
  ]);
  expect(resultado.find((item) => item.firebaseId === "reciente").valor).toBe(
    "actualizado"
  );
});

test("la fusión elimina duplicados y respeta el orden indicado", () => {
  const resultado = fusionarDocumentosPaginados({
    actuales: [{ firebaseId: "a", fecha: "2026-09-01", createdAt: 1 }],
    entrantes: [
      { firebaseId: "a", fecha: "2026-09-01", createdAt: 2 },
      { firebaseId: "b", fecha: "2026-09-02", createdAt: 1 },
    ],
    camposOrden: ["fecha", "createdAt"],
  });

  expect(resultado).toHaveLength(2);
  expect(resultado.map((item) => item.firebaseId)).toEqual(["b", "a"]);
  expect(resultado[1].createdAt).toBe(2);
});
