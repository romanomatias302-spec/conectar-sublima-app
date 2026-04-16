import React, { useMemo } from "react";
import "./ColumnasDetallePedidoModal.css";

export default function ColumnasDetallePedidoModal({
  open,
  columnas,
  onClose,
  onGuardar,
}) {
  const columnasOrdenadas = useMemo(() => {
    return [...columnas].sort((a, b) => a.orden - b.orden);
  }, [columnas]);

  if (!open) return null;

  const moverColumna = (key, direccion) => {
    const lista = [...columnasOrdenadas];
    const index = lista.findIndex((c) => c.key === key);
    if (index === -1) return;

    const nuevoIndex = direccion === "up" ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= lista.length) return;

    const actual = lista[index];
    const destino = lista[nuevoIndex];

    // No mover columnas fijas fuera de lugar si querés mantenerlas firmes
    if (actual.fija || destino.fija) return;

    [lista[index], lista[nuevoIndex]] = [lista[nuevoIndex], lista[index]];

    const reordenadas = lista.map((col, i) => ({
      ...col,
      orden: i + 1,
    }));

    onGuardar(reordenadas);
  };

  const toggleVisible = (key) => {
    const actualizadas = columnasOrdenadas.map((col) => {
      if (col.key !== key) return col;
      if (col.fija) return col;

      return {
        ...col,
        visible: !col.visible,
      };
    });

    onGuardar(actualizadas);
  };

  return (
    <div className="cdpm-overlay" onMouseDown={onClose}>
      <div
        className="cdpm-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cdpm-header">
          <div>
            <h2 className="cdpm-title">Configurar columnas</h2>
            <p className="cdpm-subtitle">
              Elegí qué columnas mostrar en el detalle del pedido y en qué orden.
            </p>
          </div>

          <button className="cdpm-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="cdpm-list">
          {columnasOrdenadas.map((col, index) => {
            const puedeSubir =
              !col.fija &&
              index > 0 &&
              !columnasOrdenadas[index - 1]?.fija;

            const puedeBajar =
              !col.fija &&
              index < columnasOrdenadas.length - 1 &&
              !columnasOrdenadas[index + 1]?.fija;

            return (
              <div key={col.key} className="cdpm-row">
                <div className="cdpm-row-left">
                  <div className="cdpm-label-wrap">
                    <div className="cdpm-label">{col.label}</div>
                    {col.fija ? (
                      <div className="cdpm-badge-lock">Fija</div>
                    ) : null}
                  </div>

                  <div className="cdpm-key">{col.key}</div>
                </div>

                <div className="cdpm-row-actions">
                  <label className="cdpm-toggle">
                    <input
                      type="checkbox"
                      checked={!!col.visible}
                      onChange={() => toggleVisible(col.key)}
                      disabled={col.fija}
                    />
                    <span>{col.visible ? "Visible" : "Oculta"}</span>
                  </label>

                  <div className="cdpm-order-actions">
                    <button
                      type="button"
                      className="cdpm-btn-move"
                      onClick={() => moverColumna(col.key, "up")}
                      disabled={!puedeSubir}
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      className="cdpm-btn-move"
                      onClick={() => moverColumna(col.key, "down")}
                      disabled={!puedeBajar}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="cdpm-footer">
          <button className="cdpm-btn-secondary" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}