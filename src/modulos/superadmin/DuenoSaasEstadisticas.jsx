import React, {useMemo} from "react";
import {buildPaidSaasSummary, classifySaasClient, formatSaasMoney, resolveSaasMovementCurrency, resolveSaasPlanLabel, saasBalanceStatus, sumSaasPlanRows} from "../../domain/saasPanel";

export default function DuenoSaasEstadisticas({clientes = [], movimientosSaas = [], usoClientes = {}, pagosPorCliente = {}, formatearFecha = (value) => value || "—"}) {
  const data = useMemo(() => {
    const paid = buildPaidSaasSummary(clientes);
    const rows = Object.values(clientes.reduce((result, client) => {
      const plan = resolveSaasPlanLabel(client);
      const row = result[plan] || {plan, total: 0, active: 0, grace: 0, suspended: 0, trial: 0};
      row.total += 1;
      const group = classifySaasClient(client).group;
      if (group === "churn") row.suspended += 1;
      else if (Object.prototype.hasOwnProperty.call(row, group)) row[group] += 1;
      result[plan] = row;
      return result;
    }, {})).sort((a, b) => b.total - a.total);
    return {paid, rows, totals: sumSaasPlanRows(rows),
      trial: clientes.filter((c) => classifySaasClient(c).group === "trial").length,
      debt: clientes.filter((c) => saasBalanceStatus(c).balance > 0).length};
  }, [clientes]);
  const recent = useMemo(() => {
    const timestamp = (value) => {
      const date = typeof value?.toDate === "function" ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : new Date(value || 0);
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };
    const payments = movimientosSaas.filter((m) => m.tipoMovimiento === "pago" && m.anulado !== true && m.estado !== "anulado")
      .slice().sort((a, b) => timestamp(b.fechaPago || b.createdAt) - timestamp(a.fechaPago || a.createdAt)).slice(0, 8);
    const usage = clientes.filter((c) => ["active", "grace"].includes(classifySaasClient(c).group))
      .map((c) => ({...c, usage: usoClientes[c.id] || {}}))
      .sort((a, b) => timestamp(b.usage.ultimoUso) - timestamp(a.usage.ultimoUso));
    return {payments, usage};
  }, [clientes, movimientosSaas, usoClientes]);
  return <section className="saas-dark-dashboard">
    <header className="saas-dark-header"><h2>Estadísticas SaaS</h2></header>
    <div className="saas-neon-kpis saas-executive-kpis">
      <Kpi label="Planes pagos activos" value={data.paid.active.length} color="blue" />
      <Kpi label="En prueba" value={data.trial} color="yellow" />
      <Kpi label="Con deuda" value={data.debt} color="red" />
    </div>
    <div className="saas-dark-grid">
      <Panel title="Ingresos mensuales esperados"><CurrencyRows values={data.paid.monthly} /></Panel>
      <Panel title="Ingresos anuales esperados"><CurrencyRows values={data.paid.annual} /></Panel>
      <Panel wide title="Clientes activos por país">
        <div className="saas-country-grid"><table className="saas-dark-table">
          <thead><tr><th>País</th>{data.paid.columns.map((plan) => <th key={plan}>{plan}</th>)}<th>Total mensuales</th><th>Total anuales</th><th>Total activos</th></tr></thead>
          <tbody>{data.paid.rows.map((row) => <tr key={row.country}>
            <td>{row.country}</td>{data.paid.columns.map((plan) => <td key={plan}>{row.plans[plan] || 0}</td>)}<td>{row.monthly}</td><td>{row.annual}</td><td className="ok">{row.total}</td>
          </tr>)}</tbody>
          <tfoot><tr><th>TOTAL</th>{data.paid.columns.map((plan) => <th key={plan}>{data.paid.totals.plans[plan] || 0}</th>)}<th>{data.paid.totals.monthly}</th><th>{data.paid.totals.annual}</th><th>{data.paid.totals.total}</th></tr></tfoot>
        </table></div>
        {!data.paid.rows.length && <div className="saas-empty-state">No hay planes pagos activos.</div>}
      </Panel>
      <Panel wide title="Clientes por plan">
        <div className="saas-country-grid"><table className="saas-dark-table">
          <thead><tr><th>Plan</th><th>Total</th><th>Activos</th><th>Gracia</th><th>Suspendidos</th><th>Prueba</th><th>Vigentes · activos + gracia</th></tr></thead>
          <tbody>{data.rows.map((row) => <tr key={row.plan}><td>{row.plan}</td><PlanCells row={row} /></tr>)}</tbody>
          <tfoot><tr><th>TOTAL</th><PlanCells row={data.totals} /></tr></tfoot>
        </table></div>
      </Panel>
      <Panel title="Últimos pagos recibidos">
        <div className="saas-last-payments">{recent.payments.map((payment) => <div className="saas-last-payment-row" key={payment.id}>
          <div><strong>{payment.clienteNombre || "Cliente SaaS"}</strong><span>{formatearFecha(payment.fechaPago || payment.createdAt)} · {payment.medioPago || "Sin medio"}</span></div>
          <b>{formatSaasMoney(payment.monto, resolveSaasMovementCurrency(payment))}</b>
        </div>)}{!recent.payments.length && <div className="saas-empty-state">No hay pagos registrados.</div>}</div>
      </Panel>
      <Panel wide title="Últimos usos de la aplicación">
        <div className="saas-country-grid"><table className="saas-dark-table">
          <thead><tr><th>Cliente</th><th>Pedidos 30d</th><th>Ventas 30d</th><th>Pagos</th><th>Último uso</th></tr></thead>
          <tbody>{recent.usage.map((client) => <tr key={client.id}><td>{client.nombre || client.nombreCliente || client.id}</td>
            <td>{client.usage.pedidosUltimos30 || 0}</td><td>{client.usage.ventasUltimos30 || 0}</td><td>{pagosPorCliente[client.id]?.cantidadPagos || 0}</td><td>{formatearFecha(client.usage.ultimoUso)}</td>
          </tr>)}</tbody>
        </table></div>
      </Panel>
    </div>
  </section>;
}
function PlanCells({row}) {
  return <><td>{row.total}</td><td className="ok">{row.active}</td><td className="warn">{row.grace}</td><td className="bad">{row.suspended}</td><td>{row.trial}</td><td>{row.active + row.grace}</td></>;
}
function CurrencyRows({values}) {
  const rows = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  return <div className="saas-currency-group">{rows.length ? rows.map(([currency, amount]) =>
    <div className="saas-currency-row" key={currency}><span>{currency}</span><strong>{formatSaasMoney(amount, currency)}</strong></div>
  ) : <span className="saas-empty-inline">Sin ingresos configurados.</span>}</div>;
}
function Kpi({label, value, color}) {
  return <div className={`saas-neon-kpi ${color}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Panel({title, children, wide}) {
  return <article className={wide ? "saas-dark-panel wide" : "saas-dark-panel"}><h3>{title}</h3>{children}</article>;
}
