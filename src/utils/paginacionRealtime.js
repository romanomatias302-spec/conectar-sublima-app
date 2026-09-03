function valorOrden(valor) {
  if (valor?.toMillis) return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  return valor ?? "";
}

export function compararDocumentosDesc(a, b, campos = ["createdAt"]) {
  for (const campo of campos) {
    const valorA = valorOrden(a?.[campo]);
    const valorB = valorOrden(b?.[campo]);
    if (valorA < valorB) return 1;
    if (valorA > valorB) return -1;
  }
  return String(b?.firebaseId || "").localeCompare(String(a?.firebaseId || ""));
}

export function fusionarDocumentosPaginados({
  actuales = [],
  entrantes = [],
  camposOrden = ["createdAt"],
}) {
  const porId = new Map();
  actuales.forEach((documento) => {
    if (documento?.firebaseId) porId.set(documento.firebaseId, documento);
  });
  entrantes.forEach((documento) => {
    if (documento?.firebaseId) porId.set(documento.firebaseId, documento);
  });
  return Array.from(porId.values()).sort((a, b) =>
    compararDocumentosDesc(a, b, camposOrden)
  );
}
