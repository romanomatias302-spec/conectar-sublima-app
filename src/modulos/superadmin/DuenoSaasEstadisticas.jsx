import React, { useMemo, useState } from "react";

export default function DuenoSaasEstadisticas({
  clientes = [],
  movimientosSaas = [],
  usoClientes = {},
  pagosPorCliente = {},
  formatearMoneda,
  formatearFecha,
}) {
  const [rango, setRango] = useState("general");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const estaEnRango = (valor) => {
    if (rango === "general") return true;
    if (!valor) return false;

    const fecha = valor?.seconds
      ? new Date(valor.seconds * 1000)
      : new Date(valor);

    if (isNaN(fecha.getTime())) return false;

    const hoy = new Date();
    const inicio = new Date();
    const fin = new Date();

    if (rango === "7") inicio.setDate(hoy.getDate() - 7);
    if (rango === "30") inicio.setDate(hoy.getDate() - 30);

    if (rango === "mes") {
      inicio.setDate(1);
      fin.setMonth(hoy.getMonth() + 1);
      fin.setDate(0);
    }

    if (rango === "anio") {
      inicio.setMonth(0, 1);
      fin.setMonth(11, 31);
    }

    if (rango === "custom") {
      const d = desde ? new Date(desde) : null;
      const h = hasta ? new Date(hasta) : null;

      if (d && fecha < d) return false;
      if (h && fecha > h) return false;

      return true;
    }

    return fecha >= inicio && fecha <= fin;
  };

  const data = useMemo(() => {
    const movimientosActivos = movimientosSaas.filter((m) => m.anulado !== true);

    const pagosFiltrados = movimientosActivos.filter(
      (m) => m.tipoMovimiento === "pago" && estaEnRango(m.fechaPago)
    );

    const clientesFiltrados =
      rango === "general"
        ? clientes
        : clientes.filter((c) => estaEnRango(c.fechaAlta || c.createdAt));

    const esActivo = (c) =>
      (c.estado || "activo") === "activo" &&
      (c.estadoSuscripcion || "activo") !== "cancelado" &&
      (c.estadoSuscripcion || "activo") !== "prueba";

    const esSuspendido = (c) => (c.estado || "") === "suspendido";

    const esPrueba = (c) =>
      (c.estadoSuscripcion || "") === "prueba" ||
      (c.planNombre || "") === "Prueba gratis 7 días";

    const esCancelado = (c) =>
      (c.estadoSuscripcion || "") === "cancelado" ||
      (c.estado || "") === "inactivo";

    const activos = clientesFiltrados.filter(esActivo);
    const suspendidos = clientesFiltrados.filter(esSuspendido);
    const pruebas = clientesFiltrados.filter(esPrueba);
    const cancelados = clientesFiltrados.filter(esCancelado);

    const mrr = activos.reduce((acc, c) => {
      const plan = (c.planNombre || c.plan || "").toLowerCase();
      const esMensual =
        plan.includes("mensual") ||
        plan.includes("pro") ||
        plan.includes("basic") ||
        plan.includes("básico");

      if (!esMensual) return acc;

      return acc + Number(c.planPrecio || c.mantenimientoMensual || 0);
    }, 0);

    const totalCobrado = pagosFiltrados.reduce(
      (acc, p) => acc + Number(p.monto || 0),
      0
    );

const deudaPorMoneda = [...activos, ...suspendidos, ...cancelados].reduce(
  (acc, c) => {
    const saldo = Number(c.saldoCuentaCorriente || 0);
    if (saldo <= 0) return acc;

const moneda = String(
  c.billingCurrency ||
  c.moneda ||
  "ARS"
).toUpperCase();
    const grupo = esActivo(c) ? "activos" : "inactivos";

    if (!acc[moneda]) {
      acc[moneda] = {
        moneda,
        activos: 0,
        inactivos: 0,
        total: 0,
      };
    }

    acc[moneda][grupo] += saldo;
    acc[moneda].total += saldo;

    return acc;
  },
  {}
);

const deudaActivos = Object.values(deudaPorMoneda).reduce(
  (acc, m) => acc + m.activos,
  0
);

const deudaInactivos = Object.values(deudaPorMoneda).reduce(
  (acc, m) => acc + m.inactivos,
  0
);

const clientesActivosConDeuda = activos.filter(
  (c) => Number(c.saldoCuentaCorriente || 0) > 0
).length;

const clientesInactivosConDeuda = [...suspendidos, ...cancelados].filter(
  (c) => Number(c.saldoCuentaCorriente || 0) > 0
).length;

const ultimosPagos = pagosFiltrados
  .slice()
  .sort((a, b) => {
    const fechaA = a.fechaPago?.seconds
      ? a.fechaPago.seconds * 1000
      : new Date(a.fechaPago || 0).getTime();

    const fechaB = b.fechaPago?.seconds
      ? b.fechaPago.seconds * 1000
      : new Date(b.fechaPago || 0).getTime();

    return fechaB - fechaA;
  })
  .slice(0, 8);

    const mayorPago = pagosFiltrados.reduce(
      (max, p) => Math.max(max, Number(p.monto || 0)),
      0
    );

    const porPlan = Object.values(
      clientesFiltrados.reduce((acc, c) => {
        const plan = c.planNombre || c.plan || "Sin plan";

        if (!acc[plan]) {
          acc[plan] = {
            nombre: plan,
            total: 0,
            activos: 0,
            suspendidos: 0,
            pruebas: 0,
            cancelados: 0,
            mrr: 0,
          };
        }

        acc[plan].total += 1;
        if (esActivo(c)) {
          acc[plan].activos += 1;
          acc[plan].mrr += Number(c.planPrecio || c.mantenimientoMensual || 0);
        }
        if (esSuspendido(c)) acc[plan].suspendidos += 1;
        if (esPrueba(c)) acc[plan].pruebas += 1;
        if (esCancelado(c)) acc[plan].cancelados += 1;

        return acc;
      }, {})
    ).sort((a, b) => b.total - a.total);

    const planes = ["Mensual", "Anual", "Personalizado"].filter((plan) =>
    porPlan.some((p) => p.nombre === plan)
    );

    const porPais = Object.values(
      clientesFiltrados.reduce((acc, c) => {
        const pais = c.pais || "Sin país";
        const plan = c.planNombre || c.plan || "Sin plan";

        if (!acc[pais]) {
          acc[pais] = {
            pais,
            total: 0,
            activos: 0,
            suspendidos: 0,
            pruebas: 0,
            mrr: 0,
            planes: {},
          };
        }

        acc[pais].total += 1;

        if (!acc[pais].planes[plan]) {
          acc[pais].planes[plan] = 0;
        }

        if (esActivo(c)) {
          acc[pais].activos += 1;
          acc[pais].planes[plan] += 1;
          acc[pais].mrr += Number(c.planPrecio || c.mantenimientoMensual || 0);
        }

        if (esSuspendido(c)) acc[pais].suspendidos += 1;
        if (esPrueba(c)) acc[pais].pruebas += 1;

        return acc;
      }, {})
    ).sort((a, b) => b.total - a.total);

    const uso = clientes
      .filter((c) => (c.estado || "activo") === "activo")
      .map((c) => ({
        id: c.id,
        nombre: c.nombre || "-",
        plan: c.planNombre || c.plan || "-",
        pais: c.pais || "-",
        pedidos30: usoClientes[c.id]?.pedidosUltimos30 || 0,
        ventas30: usoClientes[c.id]?.ventasUltimos30 || 0,

        storage30:
        usoClientes[c.id]?.storageUltimos30MB ||
        c.storageUltimos30MB ||
        0,

        imagenesPedido30:
        usoClientes[c.id]?.imagenesPedidoUltimos30 ||
        c.imagenesPedidoUltimos30 ||
        0,

        lecturas30:
        usoClientes[c.id]?.lecturasUltimos30 ||
        c.lecturasUltimos30 ||
        0,

        escrituras30:
        usoClientes[c.id]?.escriturasUltimos30 ||
        c.escriturasUltimos30 ||
        0,

        pedidos: usoClientes[c.id]?.pedidos || 0,
        ventas: usoClientes[c.id]?.ventas || 0,
        ultimoUso: usoClientes[c.id]?.ultimoUso || "",
        pagos: pagosPorCliente[c.id]?.cantidadPagos || 0,
        totalPagado: pagosPorCliente[c.id]?.totalPagado || 0,
      }))
      .sort((a, b) => {
        if (!a.ultimoUso && !b.ultimoUso) return 0;
        if (!a.ultimoUso) return 1;
        if (!b.ultimoUso) return -1;
        return b.ultimoUso.localeCompare(a.ultimoUso);
      });

const deudaPorMonedaNormalizada = deudaPorMoneda;

    return {
      activos,
      suspendidos,
      pruebas,
      cancelados,
      mrr,
      arr: mrr * 12,
      pagosFiltrados,
      totalCobrado,
      mayorPago,
      deudaActivos,
    deudaInactivos,
    clientesActivosConDeuda,
    clientesInactivosConDeuda,
    ultimosPagos,
    deudaPorMoneda: deudaPorMonedaNormalizada,
      porPlan,
      porPais,
      planes,
      uso,
    };
  }, [clientes, movimientosSaas, usoClientes, pagosPorCliente, rango, desde, hasta]);

  const totalEstado =
    data.activos.length +
    data.suspendidos.length +
    data.pruebas.length +
    data.cancelados.length;

const formatearMonedaPorCodigo = (valor, moneda = "USD") => {
  const codigo = String(moneda || "USD").toUpperCase();

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: codigo,
    minimumFractionDigits: codigo === "ARS" ? 0 : 2,
  }).format(Number(valor || 0));
};

  return (
    <section className="saas-dark-dashboard">
      <header className="saas-dark-header">
        <div>
          <h2>Estadísticas SaaS</h2>
          <p>Visión completa del negocio, clientes, pagos y uso real.</p>
        </div>

        <div className="saas-date-filter">
          <select value={rango} onChange={(e) => setRango(e.target.value)}>
            <option value="general">General</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="mes">Este mes</option>
            <option value="anio">Este año</option>
            <option value="custom">Personalizado</option>
          </select>

          {rango === "custom" && (
            <>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </>
          )}
        </div>
      </header>

      <div className="saas-neon-kpis">
        <Kpi color="blue" label="Activos" value={data.activos.length} />
        <Kpi color="red" label="Suspendidos" value={data.suspendidos.length} />
        <Kpi color="yellow" label="Plan prueba 7 días" value={data.pruebas.length} />
        <Kpi color="green" label="MRR activos mensuales" value={formatearMoneda(data.mrr)} />
        <Kpi color="purple" label="ARR" value={formatearMoneda(data.arr)} />
        <Kpi color="cyan" label="Pagos recibidos" value={data.pagosFiltrados.length} />
      </div>

      <div className="saas-dark-grid">
        <Panel wide title="Clientes por plan">
          <table className="saas-dark-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Total</th>
                <th>Activos</th>
                <th>Suspendidos</th>
                <th>Prueba</th>
                <th>MRR</th>
              </tr>
            </thead>
            <tbody>
              {data.porPlan.map((p) => (
                <tr key={p.nombre}>
                  <td>{p.nombre}</td>
                  <td>{p.total}</td>
                  <td className="ok">{p.activos}</td>
                  <td className="bad">{p.suspendidos}</td>
                  <td className="warn">{p.pruebas}</td>
                  <td>{formatearMoneda(p.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Deuda de clientes">
            <div className="saas-debt-chart">
                <div
                className="saas-debt-ring"
                style={{
                    background: `conic-gradient(
                    #22c55e 0 ${
                        data.deudaActivos + data.deudaInactivos > 0
                        ? (data.deudaActivos /
                            (data.deudaActivos + data.deudaInactivos)) *
                            100
                        : 50
                    }%,
                    #ef4444 0 100%
                    )`,
                }}
                >
                <div>
                    <span>Total deuda</span>
                    <strong>
                    {Object.values(data.deudaPorMoneda).length} monedas
                    </strong>
                </div>
                </div>

          <div className="saas-debt-legend">
            <div>
                <span className="dot green"></span>
                <p>Activos con deuda</p>
                <strong>{data.clientesActivosConDeuda} clientes</strong>

                <div className="saas-debt-currency-list">
                {Object.values(data.deudaPorMoneda)
                    .filter((m) => m.activos > 0)
                    .map((m) => (
                    <small key={`activos-${m.moneda}`}>
                        {m.moneda}: {formatearMonedaPorCodigo(m.activos, m.moneda)}
                    </small>
                    ))}
                </div>
            </div>

            <div>
                <span className="dot red"></span>
                <p>Inactivos / suspendidos con deuda</p>
                <strong>{data.clientesInactivosConDeuda} clientes</strong>

                <div className="saas-debt-currency-list">
                {Object.values(data.deudaPorMoneda)
                    .filter((m) => m.inactivos > 0)
                    .map((m) => (
                    <small key={`inactivos-${m.moneda}`}>
                        {m.moneda}: {formatearMonedaPorCodigo(m.inactivos, m.moneda)}
                    </small>
                    ))}
                </div>
            </div>
            </div>
            </div>
            </Panel>

        <Panel title="Estado de clientes">
          <div className="saas-ring-wrap">
            <div
              className="saas-ring"
              style={{
                background: `conic-gradient(
                  #22c55e 0 ${(data.activos.length / Math.max(totalEstado, 1)) * 100}%,
                  #ef4444 0 ${((data.activos.length + data.suspendidos.length) / Math.max(totalEstado, 1)) * 100}%,
                  #facc15 0 ${((data.activos.length + data.suspendidos.length + data.pruebas.length) / Math.max(totalEstado, 1)) * 100}%,
                  #64748b 0 100%
                )`,
              }}
            >
              <div>
                <strong>{totalEstado}</strong>
                <span>Total</span>
              </div>
            </div>
          </div>

          <div className="saas-state-list">
            <State label="Activos" value={data.activos.length} />
            <State label="Suspendidos" value={data.suspendidos.length} />
            <State label="Prueba" value={data.pruebas.length} />
            <State label="Cancelados" value={data.cancelados.length} />
          </div>
        </Panel>

        <Panel wide title="Clientes por país y plan activo">
          <div className="saas-country-grid">
            <table className="saas-dark-table">
              <thead>
                <tr>
                  <th>País</th>
                  <th>Total</th>
                  <th>Activos</th>
                  {data.planes.slice(0, 4).map((plan) => (
                    <th key={plan}>{plan}</th>
                  ))}
                  <th>MRR</th>
                </tr>
              </thead>
              <tbody>
                {data.porPais.map((p) => (
                  <tr key={p.pais}>
                    <td>{p.pais}</td>
                    <td>{p.total}</td>
                    <td className="ok">{p.activos}</td>
                    {data.planes.slice(0, 4).map((plan) => (
                      <td key={plan}>{p.planes[plan] || 0}</td>
                    ))}
                    <td>{formatearMoneda(p.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Pagos registrados">
          <div className="saas-payment-neon">
            <strong>{formatearMoneda(data.totalCobrado)}</strong>
            <span>Total cobrado</span>
          </div>

          <div className="saas-payment-stats">
            <div>
              <span>Pagos</span>
              <strong>{data.pagosFiltrados.length}</strong>
            </div>
            <div>
              <span>Promedio</span>
              <strong>
                {formatearMoneda(
                  data.pagosFiltrados.length
                    ? data.totalCobrado / data.pagosFiltrados.length
                    : 0
                )}
              </strong>
            </div>
            <div>
              <span>Mayor pago</span>
              <strong>{formatearMoneda(data.mayorPago)}</strong>
            </div>
          </div>
        </Panel>

        <Panel title="Últimos pagos recibidos">
            <div className="saas-last-payments">
                {data.ultimosPagos.length === 0 && (
                <div className="saas-empty-state">No hay pagos en este período.</div>
                )}

                {data.ultimosPagos.map((p) => (
                <div className="saas-last-payment-row" key={p.id}>
                    <div>
                    <strong>
                        {p.clienteSaasNombre ||
                        p.clienteNombre ||
                        p.nombreCliente ||
                        p.clienteSaas?.nombre ||
                        "Cliente SaaS"}
                    </strong>
                    <span>
                        {formatearFecha(p.fechaPago)} · {p.medioPago || "Sin medio"}
                    </span>
                    </div>

                    <b>{formatearMoneda(p.monto)}</b>
                </div>
                ))}
            </div>
            </Panel>

            <Panel wide title="Últimos usos de la aplicación">
                <div className="saas-usage-table-scroll">
                <div className="saas-usage-head">
                <span>Cliente</span>
                <span>Pedidos 30d</span>
                <span>Ventas 30d</span>
                
                <span>Imágenes 30d</span>
                <span>Lecturas</span>
                <span>Escrituras</span>
                <span>Último uso</span>
                </div>
                

            <div className="saas-usage-scroll">
                {data.uso.map((u) => (
                <div className="saas-usage-dark-row" key={u.id}>
                <div>
                    <strong>{u.nombre}</strong>
                    <span>{u.plan} · {u.pais}</span>
                </div>

                <b>{u.pedidos30}</b>
                <b>{u.ventas30}</b>
                <b>{u.imagenesPedido30}</b>
                <b>{u.lecturas30}</b>
                <b>{u.escrituras30}</b>

                <span>{formatearFecha(u.ultimoUso)}</span>
                </div>
            ))}
          </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className={`saas-neon-kpi ${color}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, children, wide }) {
  return (
    <article className={wide ? "saas-dark-panel wide" : "saas-dark-panel"}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function State({ label, value }) {
  return (
    <div className="saas-state-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}