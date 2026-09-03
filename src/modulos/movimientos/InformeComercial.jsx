import React, { useEffect, useMemo, useRef, useState } from "react";
import { obtenerInformeComercialCompleto } from "../../firebase/informesComerciales";
import {
  formatearMoneda,
  obtenerConfigMonedaDesdePerfil,
} from "../../utils/moneda";

const TAMANO_PAGINA = 25;
const VACIO = {
  resumen: {
    ventasCantidad: 0,
    pedidosCantidad: 0,
    importeTotalVendido: 0,
    unidadesVendidas: 0,
    productosDistintos: 0,
    pagosCantidad: 0,
    ingresosRecibidos: 0,
    ventasSinItems: 0,
    fuentesInvalidas: 0,
  },
  productos: [],
  clientesVentas: [],
  clientesIngresos: [],
};

function TablaPaginada({ filas, pagina, setPagina, renderEncabezado, renderFila }) {
  const paginas = Math.max(1, Math.ceil(filas.length / TAMANO_PAGINA));
  const paginaSegura = Math.min(pagina, paginas);
  const visibles = filas.slice(
    (paginaSegura - 1) * TAMANO_PAGINA,
    paginaSegura * TAMANO_PAGINA
  );

  return (
    <>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ minWidth: 680 }}>
          <thead>{renderEncabezado()}</thead>
          <tbody>{visibles.map(renderFila)}</tbody>
        </table>
      </div>
      {!filas.length && <p style={{ color: "#666" }}>No hay resultados para el período.</p>}
      {paginas > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            disabled={paginaSegura <= 1}
            onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
          >
            Anterior
          </button>
          <span style={{ alignSelf: "center" }}>Página {paginaSegura} de {paginas}</span>
          <button
            type="button"
            disabled={paginaSegura >= paginas}
            onClick={() => setPagina((actual) => Math.min(paginas, actual + 1))}
          >
            Siguiente
          </button>
        </div>
      )}
    </>
  );
}

export default function InformeComercial({ perfil, fechaDesde, fechaHasta }) {
  const [informe, setInforme] = useState(VACIO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ordenProductos, setOrdenProductos] = useState("importe");
  const [paginaProductos, setPaginaProductos] = useState(1);
  const [paginaVentas, setPaginaVentas] = useState(1);
  const [paginaIngresos, setPaginaIngresos] = useState(1);
  const solicitudRef = useRef(0);
  const perfilConsulta = useMemo(
    () => ({
      clienteId: perfil?.clienteId || "",
      rol: perfil?.rol || "",
    }),
    [perfil?.clienteId, perfil?.rol]
  );
  const configMoneda = obtenerConfigMonedaDesdePerfil(perfil);
  const moneda = (valor) =>
    formatearMoneda(valor, configMoneda.moneda, configMoneda.localeMoneda);

  useEffect(() => {
    const solicitudId = ++solicitudRef.current;
    setLoading(true);
    setError("");
    setPaginaProductos(1);
    setPaginaVentas(1);
    setPaginaIngresos(1);

    obtenerInformeComercialCompleto({
      perfil: perfilConsulta,
      fechaDesde,
      fechaHasta,
    })
      .then((resultado) => {
        if (solicitudId !== solicitudRef.current) return;
        if (resultado.resumen.ventasSinItems > 0 || resultado.resumen.fuentesInvalidas > 0) {
          console.warn("Informe comercial con fuentes históricas no atribuibles:", {
            ventasSinItems: resultado.resumen.ventasSinItems,
            fuentesInvalidas: resultado.resumen.fuentesInvalidas,
          });
        }
        setInforme(resultado);
      })
      .catch((err) => {
        console.error("Error cargando informe comercial completo:", err);
        if (solicitudId === solicitudRef.current) {
          setInforme(VACIO);
          setError("No pudimos cargar el informe comercial. Intentá nuevamente.");
        }
      })
      .finally(() => {
        if (solicitudId === solicitudRef.current) setLoading(false);
      });
  }, [perfilConsulta, fechaDesde, fechaHasta]);

  const productos = useMemo(() => {
    const copia = [...informe.productos];
    return copia.sort((a, b) =>
      ordenProductos === "cantidad"
        ? b.cantidadVendida - a.cantidadVendida
        : b.importeTotal - a.importeTotal
    );
  }, [informe.productos, ordenProductos]);

  if (loading) return <p>Cargando informe comercial completo...</p>;
  if (error) return <div className="ventas-alert ventas-alert-error">{error}</div>;

  const card = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
  };

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={card}><div style={{ color: "#666", fontSize: 13 }}>Total vendido</div><strong style={{ fontSize: 22 }}>{moneda(informe.resumen.importeTotalVendido)}</strong></div>
        <div style={card}><div style={{ color: "#666", fontSize: 13 }}>Ventas realizadas</div><strong style={{ fontSize: 22 }}>{informe.resumen.ventasCantidad}</strong></div>
        <div style={card}><div style={{ color: "#666", fontSize: 13 }}>Cantidad de pedidos</div><strong style={{ fontSize: 22 }}>{informe.resumen.pedidosCantidad}</strong></div>
        <div style={card}><div style={{ color: "#666", fontSize: 13 }}>Unidades vendidas</div><strong style={{ fontSize: 22 }}>{informe.resumen.unidadesVendidas}</strong></div>
        <div style={card}><div style={{ color: "#666", fontSize: 13 }}>Cobros de ventas</div><strong style={{ fontSize: 22 }}>{moneda(informe.resumen.ingresosRecibidos)}</strong></div>
      </div>

      <section style={{ ...card, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Productos vendidos</h2>
            <p style={{ color: "#666", marginTop: 6 }}>
              Productos incluidos en ventas activas del período.
            </p>
          </div>
          <select value={ordenProductos} onChange={(event) => setOrdenProductos(event.target.value)}>
            <option value="importe">Ordenar por importe</option>
            <option value="cantidad">Ordenar por cantidad</option>
          </select>
        </div>
        <TablaPaginada
          filas={productos}
          pagina={paginaProductos}
          setPagina={setPaginaProductos}
          renderEncabezado={() => <tr><th>Producto</th><th>Cantidad vendida</th><th>Ventas</th><th>Importe total</th></tr>}
          renderFila={(producto) => (
            <tr key={producto.clave}>
              <td>
                {producto.productoNombre}
                {producto.varianteNombre ? ` · ${producto.varianteNombre}` : ""}
                {producto.legacy ? <small style={{ display: "block", color: "#777" }}>Referencia histórica por nombre</small> : null}
              </td>
              <td>{producto.cantidadVendida}</td>
              <td>{producto.cantidadVentas}</td>
              <td>{moneda(producto.importeTotal)}</td>
            </tr>
          )}
        />
      </section>

      <section style={{ ...card, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>Ventas por cliente</h2>
        <p style={{ color: "#666" }}>Ventas activas del período.</p>
        <TablaPaginada
          filas={informe.clientesVentas}
          pagina={paginaVentas}
          setPagina={setPaginaVentas}
          renderEncabezado={() => <tr><th>Cliente</th><th>Cantidad de ventas</th><th>Total vendido</th></tr>}
          renderFila={(cliente) => <tr key={cliente.clave}><td>{cliente.clienteNombre}</td><td>{cliente.cantidadVentas}</td><td>{moneda(cliente.totalVendido)}</td></tr>}
        />
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Cobros de ventas por cliente</h2>
        <p style={{ color: "#666" }}>Pagos de ventas según su fecha de cobro.</p>
        <TablaPaginada
          filas={informe.clientesIngresos}
          pagina={paginaIngresos}
          setPagina={setPaginaIngresos}
          renderEncabezado={() => <tr><th>Cliente</th><th>Cantidad de cobros</th><th>Total cobrado</th></tr>}
          renderFila={(cliente) => <tr key={cliente.clave}><td>{cliente.clienteNombre}</td><td>{cliente.cantidadCobros}</td><td>{moneda(cliente.ingresosRecibidos)}</td></tr>}
        />
      </section>

      {(informe.resumen.ventasSinItems > 0 || informe.resumen.fuentesInvalidas > 0) && (
        <p style={{ color: "#666", fontSize: 13, marginTop: 14 }}>
          Algunas fuentes históricas no pudieron atribuirse a productos. Revisá la consola para diagnóstico.
        </p>
      )}
    </div>
  );
}
