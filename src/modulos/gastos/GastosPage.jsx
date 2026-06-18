import React from "react";

export default function GastosPage({ perfil }) {
  return (
    <div className="clientes-lista">
      <div className="encabezado-lista">
        <div>
          <h1>Gastos</h1>
          <p style={{ margin: "6px 0 0", color: "#666" }}>
            Registrá y consultá los gastos reales del negocio.
          </p>
        </div>
      </div>

      <div className="container-secundaria">
        <h3 style={{ marginTop: 0 }}>Nuevo gasto</h3>
        <p style={{ color: "#666" }}>
          Próximo paso: formulario para cargar fecha, categoría, descripción,
          monto, proveedor y medio de pago.
        </p>
      </div>

      <div className="container-secundaria">
        <h3 style={{ marginTop: 0 }}>Listado de gastos</h3>
        <p style={{ color: "#666" }}>
          Próximo paso: listado paginado con filtros por fecha, categoría y proveedor.
        </p>
      </div>
    </div>
  );
}