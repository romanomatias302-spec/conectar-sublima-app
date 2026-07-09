export function obtenerTimezonePerfil(perfil) {
  return (
    perfil?.timezone ||
    perfil?.zonaHoraria ||
    "America/Argentina/Buenos_Aires"
  );
}

export function fechaHoyNegocio(perfil) {
  const timezone = obtenerTimezonePerfil(perfil);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatearFechaNegocio(fechaISO) {
  if (!fechaISO) return "-";

  const [yyyy, mm, dd] = String(fechaISO).split("-");
  if (!yyyy || !mm || !dd) return fechaISO;

  return `${dd}-${mm}-${yyyy}`;
}