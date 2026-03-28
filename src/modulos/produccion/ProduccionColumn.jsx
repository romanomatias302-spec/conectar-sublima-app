import { useDroppable } from "@dnd-kit/core";
import ProduccionCard from "./ProduccionCard";

export default function ProduccionColumn({
  columna,
  pedidos = [],
  onVerPedido,
  onEditarColumna,
  onEliminarColumna,
  columnaEditandoId,
  nombreEditarColumna,
  setNombreEditarColumna,
  onGuardarEdicionColumna,
  guardandoEdicionColumna,
  eliminandoColumnaId,
  estaContraida = false,
  onToggleContraer,
}) {
  const { setNodeRef } = useDroppable({
    id: columna.id,
    data: {
      columnaId: columna.id,
    },
  });

  const esEditando = columnaEditandoId === columna.id;
  const sePuedeEliminar = !columna.esInicial && !columna.esFinal;

  return (
    <div
        className={`produccion-column ${estaContraida ? "contraida" : ""}`}
        style={{
        background: columna.colorFondo || "#f6f7f9",
        borderColor: columna.colorBorde || "#d9dee8",
        }}
    >
      <div className="produccion-column-header">
        <div className="produccion-column-header-main">
          {esEditando && !estaContraida ? (
            <div className="produccion-columna-editar-box">
              <input
                type="text"
                value={nombreEditarColumna}
                onChange={(e) => setNombreEditarColumna(e.target.value)}
                className="produccion-columna-editar-input"
              />
              <button
                className="produccion-columna-btn-guardar"
                onClick={onGuardarEdicionColumna}
                disabled={guardandoEdicionColumna}
              >
                {guardandoEdicionColumna ? "..." : "OK"}
              </button>
            </div>
          ) : (
            <div
              className="produccion-column-title"
              title={columna.nombre}
            >
              {columna.nombre}
            </div>
          )}
        </div>

        <div className="produccion-column-header-right">
          <div className="produccion-column-count">{pedidos.length}</div>

          {!esEditando && (
            <div className="produccion-column-actions">
              <button
                className="produccion-columna-btn"
                onClick={onToggleContraer}
                title={estaContraida ? "Expandir columna" : "Contraer columna"}
              >
                {estaContraida ? "⟫" : "⟪"}
              </button>

              {!estaContraida && (
                <>
                  <button
                    className="produccion-columna-btn"
                    onClick={() => onEditarColumna?.(columna)}
                    title="Editar nombre"
                  >
                    ✎
                  </button>

                  {sePuedeEliminar && (
                    <button
                      className="produccion-columna-btn eliminar"
                      onClick={() => onEliminarColumna?.(columna)}
                      disabled={eliminandoColumnaId === columna.id}
                      title="Eliminar columna"
                    >
                      {eliminandoColumnaId === columna.id ? "..." : "×"}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={setNodeRef} className="produccion-column-body">
        {!estaContraida &&
          pedidos.map((pedido) => (
            <ProduccionCard
              key={pedido.firebaseId || pedido.id}
              pedido={pedido}
              onVerPedido={onVerPedido}
            />
          ))}
      </div>
    </div>
  );
}