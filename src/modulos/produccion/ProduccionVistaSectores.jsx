import {
  FaCrown,
  FaExpandArrowsAlt,
} from "react-icons/fa";

export default function ProduccionVistaSectores({
  sectores = [],
  columnas = [],
  pedidosPorColumna = {},

  sectorSeleccionadoId = "",
  onSeleccionarSector = () => {},
  onVistaCompleta = () => {},

  disponible = true,
  motivoBloqueo = "Disponible en el plan Pro",
}) {
  const columnasOrdenadas = [...columnas].sort(
    (a, b) =>
      Number(a?.orden ?? 0) -
      Number(b?.orden ?? 0)
  );

  const sectoresConColumnas = sectores
    .map((sector) => {
      const columnasSector = columnasOrdenadas.filter(
        (columna) =>
          String(columna.sectorId || "") ===
          String(sector.id)
      );

      const cantidadPedidos = columnasSector.reduce(
        (total, columna) =>
          total +
          Number(
            pedidosPorColumna?.[columna.id]?.length || 0
          ),
        0
      );

      return {
        ...sector,
        columnas: columnasSector,
        cantidadPedidos,
        primerOrden:
          columnasSector.length > 0
            ? Number(columnasSector[0].orden ?? 0)
            : Number.POSITIVE_INFINITY,
      };
    })
    .filter((sector) => sector.columnas.length > 0)
    .sort(
      (a, b) =>
        Number(a.primerOrden) -
        Number(b.primerOrden)
    );

  const columnasSinSector = columnasOrdenadas.filter(
    (columna) =>
      !columna.esInicial &&
      !columna.esFinal &&
      !columna.sectorId
  );

  const vistaCompletaActiva = !sectorSeleccionadoId;

  function seleccionarSector(sectorId) {
    if (!disponible) return;
    onSeleccionarSector(sectorId);
  }

  return (
    <section
      className={`produccion-vista-sectores produccion-vista-sectores-modal ${
        !disponible ? "bloqueada" : ""
      }`}
    >
      <div className="produccion-vista-sectores-contenido">
        <button
          type="button"
          className={`produccion-vista-completa-card ${
            vistaCompletaActiva ? "activa" : ""
          }`}
          onClick={() => {
            if (!disponible) return;
            onVistaCompleta();
          }}
          disabled={!disponible}
        >
          <div className="produccion-vista-completa-icono">
            <FaExpandArrowsAlt />
          </div>

          <div>
            <strong>Vista completa</strong>

            <span>
              Mostrar las {columnasOrdenadas.length} columnas
              del flujo.
            </span>
          </div>
        </button>

        <div className="produccion-vista-flujo-grid">
          {sectoresConColumnas.map(
            (sector, sectorIndex) => {
              const seleccionado =
                sectorSeleccionadoId === sector.id;

              return (
                <div
                key={sector.id}
                className="produccion-vista-sector-wrap"
                style={{
                "--cantidad-columnas-sector": Math.min(
                    Math.max(sector.columnas.length, 2),
                    10
                ),
                }}
                >
                
                  <button
                    type="button"
                    className={`produccion-vista-sector ${
                      seleccionado ? "seleccionado" : ""
                    }`}
                    onClick={() =>
                      seleccionarSector(sector.id)
                    }
                    disabled={!disponible}
                    title={
                      disponible
                        ? `Ver sector ${sector.nombre}`
                        : motivoBloqueo
                    }
                  >
                    <div className="produccion-vista-sector-header">
                      <div>
                        <span className="produccion-vista-sector-kicker">
                          Sector {sectorIndex + 1}
                        </span>

                        <strong>{sector.nombre}</strong>
                      </div>

                        <span className="produccion-vista-sector-cantidad">
                        {sector.columnas.length}{" "}
                        {sector.columnas.length === 1
                            ? "columna"
                            : "columnas"}
                        </span>
                    </div>

                    <div className="produccion-vista-mini-columnas">
                      {sector.columnas.map(
                        (columna, columnaIndex) => {
                          const cantidadPedidos = Number(
                            pedidosPorColumna?.[
                              columna.id
                            ]?.length || 0
                          );

                          const altura =
                            42 +
                            Math.min(
                              cantidadPedidos,
                              8
                            ) *
                              4;

                          return (
                            <div
                              key={columna.id}
                              className="produccion-vista-mini-columna"
                              title={`${columna.nombre} · ${cantidadPedidos} pedido${
                                cantidadPedidos === 1
                                  ? ""
                                  : "s"
                              }`}
                            >
                              <div
                                className="produccion-vista-mini-columna-cuerpo"
                                style={{
                                  height: `${altura}px`,
                                }}
                              >
                                <span className="produccion-vista-mini-columna-numero">
                                  {cantidadPedidos}
                                </span>
                              </div>

                              <span className="produccion-vista-mini-columna-nombre">
                                {columna.nombre}
                              </span>


                            </div>
                          );
                        }
                      )}
                    </div>

                    <div className="produccion-vista-sector-footer">
                      <span>
                        {sector.cantidadPedidos} pedido
                        {sector.cantidadPedidos === 1
                          ? ""
                          : "s"}
                      </span>

                      <span>
                        {seleccionado
                          ? "Vista activa"
                          : "Abrir sector"}
                      </span>
                    </div>

                    {sectorIndex <
                      sectoresConColumnas.length - 1 && (
                      <span
                        className="produccion-vista-sector-siguiente"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    )}
                  </button>
                </div>
              );
            }
          )}

          {columnasSinSector.length > 0 && (
            <div className="produccion-vista-sector-wrap">
              <div className="produccion-vista-sector produccion-vista-sector-sin-sector">
                <div className="produccion-vista-sector-header">
                  <div>
                    <span className="produccion-vista-sector-kicker">
                      Sin agrupación
                    </span>

                    <strong>Columnas sin sector</strong>
                  </div>

                <span className="produccion-vista-sector-cantidad neutral">
                {columnasSinSector.length}{" "}
                {columnasSinSector.length === 1
                    ? "columna"
                    : "columnas"}
                </span>
                </div>

                <div className="produccion-vista-mini-columnas">
                  {columnasSinSector.map(
                    (columna, columnaIndex) => {
                      const cantidadPedidos = Number(
                        pedidosPorColumna?.[
                          columna.id
                        ]?.length || 0
                      );

                      return (
                        <div
                          key={columna.id}
                          className="produccion-vista-mini-columna neutral"
                          title={`${columna.nombre} · ${cantidadPedidos} pedido${
                            cantidadPedidos === 1
                              ? ""
                              : "s"
                          }`}
                        >
                          <div className="produccion-vista-mini-columna-cuerpo">
                            <span className="produccion-vista-mini-columna-numero">
                              {cantidadPedidos}
                            </span>
                          </div>

                          <span className="produccion-vista-mini-columna-nombre">
                            {columna.nombre}
                          </span>

                      
                        </div>
                      );
                    }
                  )}
                </div>

                <div className="produccion-vista-sector-footer">
                  <span>Fuera de sectores</span>
                  <span>Visible en vista completa</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {!disponible && (
          <div className="produccion-vista-bloqueo-overlay">
            <FaCrown />

            <strong>Vista avanzada por sectores</strong>

            <span>
              Actualizá al plan Pro para navegar y organizar
              la producción por sectores.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}