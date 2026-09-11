import React, {useMemo, useState} from "react";
import {FaCheck, FaCloud, FaExclamationTriangle, FaStore, FaUsers} from "react-icons/fa";
import {getSelectablePlans, priceForPlan, resolveSaasEntitlements} from "../../domain/saasPlans";
import {normalizeBillingProvider} from "../../domain/saasPaymentProvider";

const STATUS_LABELS = {
  trial: "Prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

const CYCLE_LABELS = {monthly: "Mensual", annual: "Anual"};
const PROVIDER_LABELS = {hotmart: "Hotmart", mercadopago: "Mercado Pago", manual: "Manual"};

function formatMoney(value, currency) {
  if (value === null || value === undefined || value === "") return "A confirmar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "No informada";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", {day: "2-digit", month: "short", year: "numeric"}).format(date);
}

function usageLabel(used, limit, unlimited) {
  return unlimited ? `${used} usados · Ilimitado` : `${used} de ${limit} usados`;
}

export default function ConfiguracionCuentaPlan({account, usage}) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const entitlements = useMemo(() => resolveSaasEntitlements(account), [account]);
  const plans = getSelectablePlans();
  const provider = normalizeBillingProvider(account);
  const providerAvailable = Boolean(account.billingProvider || account.metodoCobro);
  const nextCharge = account.nextBillingDate || account.fechaProximoCargo || account.fechaVencimiento;
  const suspended = account.suspendidoManual || account.suspendidoPorSistema;
  const status = suspended ? "suspended" : entitlements.subscriptionStatus;

  return (
    <div className="account-plan-section">
      <div className="account-plan-summary">
        <div className="account-plan-heading">
          <div>
            <span className="account-plan-eyebrow">Plan actual</span>
            <h3>{entitlements.planName}</h3>
            {entitlements.isLegacy && (
              <span className="account-plan-legacy">Plan histórico compatible</span>
            )}
          </div>
          <span className={`account-plan-status account-plan-status-${status}`}>
            {STATUS_LABELS[status] || "Activa"}
          </span>
        </div>

        <div className="account-plan-details">
          <div><span>Ciclo</span><strong>{CYCLE_LABELS[entitlements.billingCycle] || "No informado"}</strong></div>
          <div><span>Precio</span><strong>{formatMoney(entitlements.price, entitlements.currency)}</strong></div>
          <div><span>Moneda de facturación</span><strong>{entitlements.currency}</strong></div>
          <div><span>Próximo cobro</span><strong>{formatDate(nextCharge)}</strong></div>
          {providerAvailable && <div><span>Proveedor</span><strong>{PROVIDER_LABELS[provider]}</strong></div>}
        </div>

        <div className="account-usage-grid">
          <div className={`account-usage-card ${usage.usersOverLimit ? "is-over" : ""}`}>
            <FaUsers />
            <div><span>Usuarios</span><strong>{usageLabel(usage.usedUsers, entitlements.maxUsers, entitlements.unlimitedUsers)}</strong></div>
          </div>
          <div className={`account-usage-card ${usage.branchesOverLimit ? "is-over" : ""}`}>
            <FaStore />
            <div><span>Sucursales</span><strong>{usageLabel(usage.activeBranches, entitlements.maxBranches, entitlements.unlimitedBranches)}</strong></div>
          </div>
        </div>

        {(usage.usersOverLimit || usage.branchesOverLimit) && (
          <div className="account-plan-warning">
            <FaExclamationTriangle />
            <span>Tu uso actual supera el límite del plan. Conservás los recursos existentes, pero no podrás crear ni reactivar más hasta liberar capacidad o mejorar el plan.</span>
          </div>
        )}
      </div>

      <div className="account-plans-header">
        <div><h3>Planes disponibles</h3><p>Elegí más capacidad sin alterar tus datos ni tu historial.</p></div>
      </div>
      <div className="account-plans-grid">
        {plans.map((plan) => {
          const isCurrent = entitlements.planId === plan.id;
          const price = priceForPlan(plan.id, entitlements.currency, "monthly");
          return (
            <article key={plan.id} className={`account-plan-card ${isCurrent ? "is-current" : ""}`}>
              <div className="account-plan-card-head">
                <h4>{plan.name}</h4>
                {isCurrent && <span><FaCheck /> Actual</span>}
              </div>
              <div className="account-plan-price">
                {formatMoney(price, entitlements.currency)}
                <small>{price === null ? "Precio personalizado" : "/ mes"}</small>
              </div>
              <ul>
                <li><FaUsers /> {plan.unlimitedUsers ? "Usuarios ilimitados" : `Hasta ${plan.maxUsers} usuarios`}</li>
                <li><FaStore /> {plan.unlimitedBranches ? "Sucursales ilimitadas" : `Hasta ${plan.maxBranches} sucursales`}</li>
                <li><FaCloud /> Acceso remoto desde cualquier dispositivo</li>
              </ul>
              <button className={isCurrent ? "account-plan-button is-current" : "account-plan-button"} disabled={isCurrent} onClick={() => setSelectedPlan(plan)}>
                {isCurrent ? "Plan actual" : entitlements.isLegacy ? "Mejorar plan" : "Cambiar plan"}
              </button>
            </article>
          );
        })}
      </div>

      {selectedPlan && (
        <div className="account-plan-modal-backdrop" role="presentation" onMouseDown={() => setSelectedPlan(null)}>
          <div className="account-plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-change-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="account-plan-eyebrow">Siguiente paso</span>
            <h3 id="plan-change-title">Cambiar a {selectedPlan.name}</h3>
            <p>Revisaremos disponibilidad, moneda y medio de cobro antes de confirmar. Este paso no modifica tu plan ni genera cargos.</p>
            <div className="account-plan-modal-note">
              <strong>Tu cuenta permanece intacta</strong>
              <span>No se eliminan usuarios, sucursales, historial ni datos comerciales.</span>
            </div>
            <p className="account-plan-flow-note">El envío de la solicitud y el checkout se habilitarán cuando el circuito comercial del proveedor esté confirmado.</p>
            <div className="account-plan-modal-actions">
              <button className="account-plan-button secondary" onClick={() => setSelectedPlan(null)}>Volver</button>
              <button className="account-plan-button" onClick={() => setSelectedPlan(null)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
