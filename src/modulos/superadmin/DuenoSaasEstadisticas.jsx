import React, {useMemo, useState} from "react";
import {
  buildSaasPanelMetrics,
  classifySaasClient,
  formatSaasMoney,
  getActiveSaasClients,
  groupActiveClientsByCountry,
  groupActiveSubscriptionsByBillingCycle,
  resolveSaasMovementCurrency,
  resolveSaasPlanLabel,
} from "../../domain/saasPanel";

function toDate(value) {
  if (!value) return null;
  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInRange(value, range, from, to, now = new Date()) {
  if (range === "general") return true;
  const date = toDate(value);
  if (!date) return false;
  const start = new Date(now);
  const end = new Date(now);
  if (range === "7") start.setDate(now.getDate() - 7);
  if (range === "30") start.setDate(now.getDate() - 30);
  if (range === "mes") {
    start.setDate(1);
    end.setMonth(now.getMonth() + 1, 0);
  }
  if (range === "anio") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  if (range === "custom") {
    const customStart = from ? new Date(`${from}T00:00:00`) : null;
    const customEnd = to ? new Date(`${to}T23:59:59`) : null;
    return (!customStart || date >= customStart) && (!customEnd || date <= customEnd);
  }
  return date >= start && date <= end;
}

function currencyRows(values = {}) {
  return Object.entries(values)
    .filter(([, amount]) => Number(amount) !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

export default function DuenoSaasEstadisticas({
  clientes = [],
  movimientosSaas = [],
  usoClientes = {},
  pagosPorCliente = {},
  formatearFecha,
}) {
  const [rango, setRango] = useState("general");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const data = useMemo(() => {
    const filteredClients = rango === "general"
      ? clientes
      : clientes.filter((client) => isInRange(client.fechaAlta || client.createdAt, rango, desde, hasta));
    const filteredMovements = movimientosSaas.filter((movement) =>
      isInRange(movement.fechaPago || movement.createdAt, rango, desde, hasta)
    );
    const metrics = buildSaasPanelMetrics(filteredClients, filteredMovements);
    const activeClients = getActiveSaasClients(filteredClients);
    const activeClientSet = new Set(activeClients);
    const activeSubscriptions = groupActiveSubscriptionsByBillingCycle(filteredClients);
    const activeClientsByCountry = groupActiveClientsByCountry(filteredClients);
    const planCounts = Object.values(filteredClients.reduce((result, client) => {
      const plan = resolveSaasPlanLabel(client);
      if (!result[plan]) result[plan] = {plan, total: 0, active: 0, grace: 0, suspended: 0, trial: 0};
      const group = classifySaasClient(client).group;
      result[plan].total += 1;
      if (group === "active" && activeClientSet.has(client)) result[plan].active += 1;
      else if (group !== "active" && Object.prototype.hasOwnProperty.call(result[plan], group)) result[plan][group] += 1;
      return result;
    }, {})).sort((a, b) => b.total - a.total);
    const latestPayments = filteredMovements
      .filter((movement) => movement.anulado !== true && movement.estado !== "anulado" && movement.tipoMovimiento === "pago")
      .sort((a, b) => (toDate(b.fechaPago)?.getTime() || 0) - (toDate(a.fechaPago)?.getTime() || 0))
      .slice(0, 8);
    const usage = filteredClients
      .filter((client) => activeClientSet.has(client) || classifySaasClient(client).group === "grace")
      .map((client) => ({
        id: client.id,
        name: client.nombre || client.nombreCliente || client.id,
        plan: resolveSaasPlanLabel(client),
        country: client.pais || "Sin país",
        orders: usoClientes[client.id]?.pedidosUltimos30 || 0,
        sales: usoClientes[client.id]?.ventasUltimos30 || 0,
        lastUse: usoClientes[client.id]?.ultimoUso || "",
        payments: pagosPorCliente[client.id]?.cantidadPagos || 0,
      }))
      .sort((a, b) => String(b.lastUse).localeCompare(String(a.lastUse)));
    return {...metrics, activeClients, activeSubscriptions, activeClientsByCountry, planCounts, latestPayments, usage};
  }, [clientes, movimientosSaas, usoClientes, pagosPorCliente, rango, desde, hasta]);

  return (
    <section className="saas-dark-dashboard">
      <header className="saas-dark-header">
        <div>
          <h2>Estadísticas SaaS</h2>
          <p>Métricas comerciales separadas por estado y moneda.</p>
        </div>
        <div className="saas-date-filter">
          <select value={rango} onChange={(event) => setRango(event.target.value)}>
            <option value="general">General</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="mes">Este mes</option>
            <option value="anio">Este año</option>
            <option value="custom">Personalizado</option>
          </select>
          {rango === "custom" && <>
            <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
            <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
          </>}
        </div>
      </header>

      <div className="saas-neon-kpis">
        <Kpi color="blue" label="Clientes activos" value={data.activeClients.length} />
        <Kpi color="green" label="Suscripciones mensuales" value={data.activeSubscriptions.monthly} />
        <Kpi color="green" label="Suscripciones anuales" value={data.activeSubscriptions.annual} />
        <Kpi color="cyan" label="En gracia" value={data.counts.grace} />
        <Kpi color="red" label="Suspendidos recuperables" value={data.churn.risk + data.churn.recovery} />
        <Kpi color="purple" label="No recuperados" value={data.counts.churn} />
        <Kpi color="yellow" label="Pruebas" value={data.counts.trial} />
      </div>

      <div className="saas-dark-grid">
        <Panel title="Clientes activos por país">
          <div className="saas-country-grid">
            <table className="saas-dark-table">
              <thead><tr><th>País</th><th>Clientes activos</th></tr></thead>
              <tbody>{data.activeClientsByCountry.map((row) => (
                <tr key={row.country}><td>{row.country}</td><td className="ok">{row.total}</td></tr>
              ))}</tbody>
            </table>
            {data.activeClientsByCountry.length === 0 && <div className="saas-empty-state">No hay clientes activos.</div>}
          </div>
        </Panel>
        <Panel wide title="MRR por moneda">
          <div className="saas-currency-groups">
            <CurrencyGroup title="MRR activo" values={data.mrr.active} />
            <CurrencyGroup title="MRR en gracia" values={data.mrr.grace} />
            <CurrencyGroup title="MRR suspendido recuperable" values={data.mrr.recoverable} />
          </div>
        </Panel>
        {data.activeSubscriptions.withoutCycle > 0 && (
          <Panel title="Suscripciones sin ciclo">
            <State label="Activas sin ciclo confiable" value={data.activeSubscriptions.withoutCycle} />
          </Panel>
        )}
        <Panel title="Cobrado por moneda">
          <CurrencyGroup values={data.collected} empty="No hay cobros con moneda en el período." />
          {data.paymentsWithoutCurrency > 0 && (
            <p className="saas-data-note">{data.paymentsWithoutCurrency} pagos históricos sin moneda no se sumaron.</p>
          )}
        </Panel>
        <Panel title="Suspensión y recuperación">
          <State label="Riesgo · 0–30 días" value={data.churn.risk} />
          <State label="Recuperación · 31–60 días" value={data.churn.recovery} />
          <State label="No recuperado · más de 60 días" value={data.churn.not_recovered} />
          <State label="Sin fecha confiable" value={data.churn.unclassified} />
        </Panel>
        <Panel title="Deuda por moneda">
          <CurrencyGroup values={data.debt} empty="No hay deuda registrada." />
        </Panel>
        <Panel wide title="Clientes por plan">
          <div className="saas-country-grid">
            <table className="saas-dark-table">
              <thead><tr><th>Plan</th><th>Total</th><th>Activos</th><th>Gracia</th><th>Suspendidos</th><th>Prueba</th></tr></thead>
              <tbody>{data.planCounts.map((row) => (
                <tr key={row.plan}><td>{row.plan}</td><td>{row.total}</td><td className="ok">{row.active}</td><td className="warn">{row.grace}</td><td className="bad">{row.suspended}</td><td>{row.trial}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Últimos pagos recibidos">
          <div className="saas-last-payments">
            {data.latestPayments.length === 0 && <div className="saas-empty-state">No hay pagos en este período.</div>}
            {data.latestPayments.map((payment) => {
              const currency = resolveSaasMovementCurrency(payment);
              return <div className="saas-last-payment-row" key={payment.id}>
                <div><strong>{payment.clienteNombre || "Cliente SaaS"}</strong><span>{formatearFecha(payment.fechaPago)} · {payment.medioPago || "Sin medio"}</span></div>
                <b>{currency ? formatSaasMoney(payment.monto, currency) : "Sin moneda"}</b>
              </div>;
            })}
          </div>
        </Panel>
        <Panel wide title="Uso reciente">
          <div className="saas-usage-table-scroll">
            <div className="saas-usage-head saas-usage-head-compact"><span>Cliente</span><span>Pedidos 30d</span><span>Ventas 30d</span><span>Pagos</span><span>Último uso</span></div>
            <div className="saas-usage-scroll">{data.usage.map((client) => (
              <div className="saas-usage-dark-row saas-usage-row-compact" key={client.id}>
                <div className="saas-usage-client"><strong>{client.name}</strong><span>{client.plan} · {client.country}</span></div>
                <b>{client.orders}</b><b>{client.sales}</b><b>{client.payments}</b><span className="saas-usage-date">{formatearFecha(client.lastUse)}</span>
              </div>
            ))}</div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function CurrencyGroup({title, values, empty = "Sin valores relevantes."}) {
  const rows = currencyRows(values);
  return <div className="saas-currency-group">
    {title && <h4>{title}</h4>}
    {rows.length === 0 ? <span className="saas-empty-inline">{empty}</span> : rows.map(([currency, amount]) => (
      <div className="saas-currency-row" key={currency}><span>{currency}</span><strong>{formatSaasMoney(amount, currency)}</strong></div>
    ))}
  </div>;
}

function Kpi({label, value, color}) {
  return <div className={`saas-neon-kpi ${color}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({title, children, wide}) {
  return <article className={wide ? "saas-dark-panel wide" : "saas-dark-panel"}><h3>{title}</h3>{children}</article>;
}

function State({label, value}) {
  return <div className="saas-state-row"><span>{label}</span><strong>{value}</strong></div>;
}
