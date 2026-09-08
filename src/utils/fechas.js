export function obtenerTimezonePerfil(perfil) {
  return (
    perfil?.timezone ||
    perfil?.zonaHoraria ||
    "America/Argentina/Buenos_Aires"
  );
}

export function fechaHoyNegocio(perfil, fechaReferencia = new Date()) {
  const timezone = obtenerTimezonePerfil(perfil);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fechaReferencia);
}

export function desplazarFechaISO(fechaISO, dias) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO || ""));
  if (!match) return "";

  const fecha = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias || 0));
  return fecha.toISOString().slice(0, 10);
}

export function obtenerRangoRapidoNegocio({
  periodo = "hoy",
  perfil,
  fechaReferencia = new Date(),
  personalizadoDesde = "",
  personalizadoHasta = "",
}) {
  const hoy = fechaHoyNegocio(perfil, fechaReferencia);

  if (periodo === "ayer") {
    const ayer = desplazarFechaISO(hoy, -1);
    return { desde: ayer, hasta: ayer };
  }
  if (periodo === "7dias") {
    return { desde: desplazarFechaISO(hoy, -6), hasta: hoy };
  }
  if (periodo === "30dias") {
    return { desde: desplazarFechaISO(hoy, -29), hasta: hoy };
  }
  if (periodo === "personalizado") {
    return {
      desde: personalizadoDesde,
      hasta: personalizadoHasta,
    };
  }
  return { desde: hoy, hasta: hoy };
}

function partesFechaEnTimezone(fecha, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(fecha)
    .reduce((partes, parte) => {
      if (parte.type !== "literal") partes[parte.type] = Number(parte.value);
      return partes;
    }, {});
}

export function inicioDiaNegocioUTC(fechaISO, perfil) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaISO || ""));
  if (!match) return null;

  const objetivoUTC = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  const timezone = obtenerTimezonePerfil(perfil);
  let instante = new Date(objetivoUTC);

  // Dos iteraciones compensan cambios de offset por horario de verano.
  for (let intento = 0; intento < 2; intento += 1) {
    const partes = partesFechaEnTimezone(instante, timezone);
    const representadoComoUTC = Date.UTC(
      partes.year,
      partes.month - 1,
      partes.day,
      partes.hour,
      partes.minute,
      partes.second
    );
    instante = new Date(instante.getTime() + objetivoUTC - representadoComoUTC);
  }

  return instante;
}

export function obtenerLimitesPeriodoUTC({ desde, hasta, perfil }) {
  return {
    inicio: inicioDiaNegocioUTC(desde, perfil),
    finExclusivo: inicioDiaNegocioUTC(desplazarFechaISO(hasta, 1), perfil),
  };
}

export function formatearFechaNegocio(fechaISO) {
  if (!fechaISO) return "-";

  const [yyyy, mm, dd] = String(fechaISO).split("-");
  if (!yyyy || !mm || !dd) return fechaISO;

  return `${dd}-${mm}-${yyyy}`;
}
