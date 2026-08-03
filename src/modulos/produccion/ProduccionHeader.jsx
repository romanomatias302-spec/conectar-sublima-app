import {
  FaClipboardList,
  FaColumns,
  FaFilter,
  FaHistory,
  FaLayerGroup,
  FaSearch,
  FaTags,
} from "react-icons/fa";
import ActionMenu from "../../comunes/componentes/ActionMenu";

export default function ProduccionHeader({
  busqueda = "",
  onCambiarBusqueda = () => {},

  cantidadFiltrosActivos = 0,
  filtrosAbiertos = false,
  onToggleFiltros = () => {},
  filtrosTriggerRef = null,

  puedeCrearPedido = false,
  onCrearPedido = () => {},

    puedeGestionarColumnas = false,
    onCrearColumna = () => {},

    puedeUsarVistaSectores = false,
    vistaSectoresDisponible = true,
    sectorVistaNombre = "",
    onAbrirVistaSectores = () => {},

    onAbrirHistorial = () => {},
  puedeGestionarEtiquetas = false,
  onGestionarEtiquetas = () => {},
}) {
  const accionesMenu = [
    {
      id: "historial-produccion",
      label: "Historial de producción",
      icon: <FaHistory />,
      onClick: onAbrirHistorial,
    },
    {
      id: "gestionar-etiquetas",
      label: "Gestionar etiquetas",
      icon: <FaTags />,
      onClick: onGestionarEtiquetas,
      visible: puedeGestionarEtiquetas,
    },
  ];

  return (
    <header className="produccion-toolbar">
      <div className="produccion-toolbar-titulo">
        <h2>Producción</h2>
      </div>

      <div className="produccion-toolbar-buscador">
        <FaSearch className="produccion-toolbar-buscador-icono" />

        <input
            type="text"
            value={busqueda}
            onChange={(e) => onCambiarBusqueda(e.target.value)}
            placeholder="Buscar pedido o cliente"
            aria-label="Buscar pedido o cliente"
            autoComplete="off"
        />

        {busqueda && (
          <button
            type="button"
            className="produccion-toolbar-limpiar"
            onClick={() => onCambiarBusqueda("")}
            title="Limpiar búsqueda"
            aria-label="Limpiar búsqueda"
          >
            ×
          </button>
        )}
      </div>

      {puedeUsarVistaSectores && (
        <button
          type="button"
          className={[
            "produccion-toolbar-btn",
            "produccion-toolbar-btn-vista",
            sectorVistaNombre ? "activo" : "",
            !vistaSectoresDisponible ? "bloqueado" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={onAbrirVistaSectores}
          title={
            vistaSectoresDisponible
              ? sectorVistaNombre
                ? `Vista activa: ${sectorVistaNombre}`
                : "Abrir visión general por sectores"
              : "Disponible a partir del plan Pro"
          }
        >
          <FaLayerGroup />

          <span>
            {sectorVistaNombre || "Vista"}
          </span>

          {!vistaSectoresDisponible && (
            <span
              className="produccion-toolbar-vista-corona"
              aria-hidden="true"
            >
              ♛
            </span>
          )}
        </button>
      )}

      <button
        ref={filtrosTriggerRef}
        type="button"
        className={`produccion-toolbar-btn produccion-toolbar-btn-filtros ${
          filtrosAbiertos ? "activo" : ""
        }`}
        onClick={onToggleFiltros}
      >
        <FaFilter />

        <span>Filtros</span>

        {cantidadFiltrosActivos > 0 && (
          <span className="produccion-toolbar-contador">
            {cantidadFiltrosActivos}
          </span>
        )}
      </button>

        {puedeGestionarColumnas && (
        <button
            type="button"
            className="produccion-toolbar-btn produccion-toolbar-btn-secundario"
            onClick={onCrearColumna}
        >
            <FaColumns />
            <span>Nueva columna</span>
        </button>
        )}

        {puedeCrearPedido && (
            <button
                type="button"
                className="produccion-toolbar-btn produccion-toolbar-btn-primario"
                onClick={onCrearPedido}
            >
                <FaClipboardList />
                <span>Nuevo pedido</span>
            </button>
        )}

      <ActionMenu
        items={accionesMenu}
        title="Opciones de producción"
        triggerClassName="produccion-header-menu-trigger"
      />
    </header>
  );
}