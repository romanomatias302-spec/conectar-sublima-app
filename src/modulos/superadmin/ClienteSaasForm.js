import React, { useEffect, useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {nextSaasBillingDate} from "../../domain/saasBillingState";
import {
  getSelectablePlans,
  priceAfterCurrencyChange,
  priceForPlan,
  rehydrateSaasClient,
  resolveManualSaasPlanId,
  resolveSaasEntitlements,
  SUPPORTED_CURRENCIES,
  validateSaasSubscription,
} from "../../domain/saasPlans";

export default function ClienteSaasForm({
  clienteEditando,
  onClose,
  onGuardado,
}) {
const [formData, setFormData] = useState({
nombre: "",
nombreCliente: "",
estado: "activo",
email: "",
telefono: "",



plan: "Prueba gratis 7 días",
planNombre: "Prueba gratis 7 días",
planPrecio: 0,
planId: "trial",
billingCycle: "monthly",
currency: "USD",
price: 0,
subscriptionStatus: "trial",
currencyExplicit: false,
frecuenciaCobro: "prueba",
diasCiclo: 7,

  pais: "Argentina",
  metodoCobro: "manual",

  costoInstalacion: "",
  mantenimientoMensual: "",

  fechaAlta: "",

  fechaProximoCargo: "",
  fechaVencimiento: "",
  
  
  

  estadoCuenta: "al_dia",
  estadoSuscripcion: "activo",

  saldoPeriodo: 0,
  totalPagadoPeriodo: 0,

  observaciones: "",
});

  const [loading, setLoading] = useState(false);
  const [commercialFieldsDirty, setCommercialFieldsDirty] = useState(false);
  const clienteOriginalLegacy = resolveSaasEntitlements(
    clienteEditando || {}
  ).isLegacy;

  useEffect(() => {
    if (clienteEditando) {
      setCommercialFieldsDirty(false);
      const nuevoModelo = rehydrateSaasClient(clienteEditando);
      setFormData({
        nombre: clienteEditando.nombre || "",
        nombreCliente: clienteEditando.nombreCliente || "",
        estado: clienteEditando.estado || "activo",
        email: clienteEditando.email || "",
        telefono: clienteEditando.telefono || "",



        plan: clienteEditando.plan || "instalacion",
        planNombre: clienteEditando.planNombre || clienteEditando.plan || "",
        planPrecio:
          clienteEditando.planPrecio ??
          clienteEditando.mantenimientoMensual ??
          0,
        ...nuevoModelo,
        currency:
          clienteEditando.billingCurrency ||
          clienteEditando.currency ||
          "USD",
        currencyExplicit: true,
        frecuenciaCobro: clienteEditando.frecuenciaCobro || "mensual",
        diasCiclo: clienteEditando.diasCiclo || 30,

        pais: clienteEditando.pais || "Argentina",
        metodoCobro: clienteEditando.metodoCobro || "manual",

        costoInstalacion: clienteEditando.costoInstalacion || "",
        mantenimientoMensual: clienteEditando.mantenimientoMensual || "",

        fechaAlta: clienteEditando.fechaAlta || "",
        fechaProximoCargo: clienteEditando.fechaProximoCargo || "",
        fechaVencimiento: clienteEditando.fechaVencimiento || "",
        
        

        estadoCuenta: clienteEditando.estadoCuenta || "al_dia",
        estadoSuscripcion: clienteEditando.estadoSuscripcion || clienteEditando.estado || "activo",

        saldoPeriodo: clienteEditando.saldoPeriodo || 0,
        totalPagadoPeriodo: clienteEditando.totalPagadoPeriodo || 0,

        observaciones: clienteEditando.observaciones || "",
      });
    }
  }, [clienteEditando]);

    const sumarDias = (fechaStr, dias) => {
      if (!fechaStr) return "";

      const partes = fechaStr.split("-");
      if (partes.length !== 3) return "";

      const anio = Number(partes[0]);
      const mes = Number(partes[1]) - 1;
      const dia = Number(partes[2]);

      const fecha = new Date(anio, mes, dia);
      fecha.setDate(fecha.getDate() + dias);

      const yyyy = fecha.getFullYear();
      const mm = String(fecha.getMonth() + 1).padStart(2, "0");
      const dd = String(fecha.getDate()).padStart(2, "0");

      return `${yyyy}-${mm}-${dd}`;
    };

    const obtenerConfigPlan = (planNombre) => {
     if (planNombre === "Prueba gratis 7 días") {
        return {
          frecuenciaCobro: "prueba",
          diasCiclo: 7,
          estadoSuscripcion: "prueba",
          planPrecio: 0,
          mantenimientoMensual: 0,
        };
      }

      if (planNombre === "Anual") {
        return {
          frecuenciaCobro: "anual",
          diasCiclo: 365,
          estadoSuscripcion: "activa",
        };
      }

      return {
        frecuenciaCobro: "mensual",
        diasCiclo: 30,
        estadoSuscripcion: "activa",
      };
    };

    const calcularFechasPorPlan = ({ fechaAlta, planNombre }) => {
      if (!fechaAlta) {
        return {
          fechaProximoCargo: "",
          fechaVencimiento: "",
        };
      }

      const config = obtenerConfigPlan(planNombre);

      if (config.frecuenciaCobro === "prueba") {
        const vencimientoPrueba = sumarDias(fechaAlta, 7);

        return {
          fechaProximoCargo: vencimientoPrueba,
          fechaVencimiento: vencimientoPrueba,
        };
      }

      const cycle = config.frecuenciaCobro === "anual" ? "annual" : "monthly";
      const proximoCargo = nextSaasBillingDate(fechaAlta, cycle);
      const vencimiento = sumarDias(proximoCargo, 7);

      return {
        fechaProximoCargo: proximoCargo,
        fechaVencimiento: vencimiento,
      };
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (["planId", "billingCycle", "currency", "price", "subscriptionStatus"].includes(name)) {
          setCommercialFieldsDirty(true);
        }

        setFormData((prev) => {
        const nuevoValor =
            name === "costoInstalacion" ||
            name === "mantenimientoMensual" ||
            name === "planPrecio" ||
            name === "saldoPeriodo" ||
            name === "totalPagadoPeriodo"
            ? Number(value)
            : value;

        const nuevoForm = {
            ...prev,
            [name]: nuevoValor,
        };

    if (name === "planId") {
      if (value === "trial") {
        nuevoForm.planNombre = "Prueba gratis 7 días";
        nuevoForm.subscriptionStatus = "trial";
        nuevoForm.price = 0;
        nuevoForm.planPrecio = 0;
      } else {
        const plan = getSelectablePlans().find((item) => item.id === value);
        nuevoForm.planNombre = plan?.name || "";
        if (nuevoForm.subscriptionStatus === "trial") nuevoForm.subscriptionStatus = "active";
        const catalogPrice = priceForPlan(value, nuevoForm.currency, nuevoForm.billingCycle);
        nuevoForm.price = catalogPrice ?? "";
        nuevoForm.planPrecio = catalogPrice ?? "";
      }
    }

      if (name === "currency") {
        nuevoForm.currencyExplicit = true;
        const nextPrice = priceAfterCurrencyChange({
          planId: nuevoForm.planId,
          currency: value,
          billingCycle: nuevoForm.billingCycle,
          currentPrice: prev.price,
        });
        nuevoForm.price = nextPrice;
        nuevoForm.planPrecio = nextPrice;
      }

    if (name === "pais") {
      // El país pertenece a los datos del cliente.
      // No modifica la moneda de facturación Zalfro.
    }

    if (name === "price") {
      nuevoForm.planPrecio = nuevoValor;
    }

    if (name === "billingCycle") {
      nuevoForm.frecuenciaCobro = value === "annual" ? "anual" : "mensual";
      nuevoForm.diasCiclo = value === "annual" ? 365 : 30;
      const catalogPrice = priceForPlan(nuevoForm.planId, nuevoForm.currency, value);
      nuevoForm.price = catalogPrice ?? "";
      nuevoForm.planPrecio = catalogPrice ?? "";
    }

    if (name === "planNombre") {
      const configPlan = obtenerConfigPlan(value);

      nuevoForm.frecuenciaCobro = configPlan.frecuenciaCobro;
      nuevoForm.diasCiclo = configPlan.diasCiclo;
      nuevoForm.estadoSuscripcion = configPlan.estadoSuscripcion;

      if (configPlan.frecuenciaCobro === "prueba") {
        nuevoForm.planPrecio = 0;
        nuevoForm.mantenimientoMensual = 0;
      }

      const fechas = calcularFechasPorPlan({
        fechaAlta: nuevoForm.fechaAlta,
        planNombre: value,
      });

      nuevoForm.fechaProximoCargo = fechas.fechaProximoCargo;
      nuevoForm.fechaVencimiento = fechas.fechaVencimiento;
    }

    if (name === "fechaAlta") {
      const fechas = calcularFechasPorPlan({
        fechaAlta: value,
        planNombre: nuevoForm.planNombre,
      });

      nuevoForm.fechaProximoCargo = fechas.fechaProximoCargo;
      nuevoForm.fechaVencimiento = fechas.fechaVencimiento;
    }

        return nuevoForm;
        });
    };

  const handleGuardar = async (e) => {
  e.preventDefault();

  if (!formData.nombre.trim()) {
    alert("Ingresá el nombre de la empresa.");
    return;
  }

  if (!formData.planNombre) {
    alert("Seleccioná un plan.");
    return;
  }

  const resolved = resolveSaasEntitlements(formData);
  const validation = validateSaasSubscription({
    planId: formData.planId,
    billingCycle: formData.billingCycle,
    currency: formData.currency,
    price: formData.price,
    subscriptionStatus: formData.subscriptionStatus,
  });
  if ((!resolved.isLegacy || commercialFieldsDirty) && !validation.valid) {
    alert(validation.errors[0]);
    return;
  }

  if (!formData.fechaAlta) {
    alert("Ingresá la fecha de alta.");
    return;
  }

  if (
    formData.planId !== "trial" &&
    Number(formData.price) === 0
  ) {
    const confirmarPrecioCero = window.confirm(
      "El precio de facturación Zalfro quedará guardado en 0. ¿Querés continuar?"
    );

    if (!confirmarPrecioCero) {
      return;
    }
  }

    try {
      setLoading(true);

    const configPlan = formData.planId === "trial"
      ? obtenerConfigPlan("Prueba gratis 7 días")
      : obtenerConfigPlan(formData.billingCycle === "annual" ? "Anual" : "Mensual");

    const esPruebaGratis = formData.planId === "trial";
    const modeloAnterior = resolveSaasEntitlements(clienteEditando || {});
    const convierteTrialAPago = Boolean(clienteEditando?.id && modeloAnterior.isTrial && !esPruebaGratis);
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const billingAnchorDate = convierteTrialAPago
      ? fechaHoy
      : clienteEditando?.billingAnchorDate || formData.fechaAlta;
    const fechasCalculadas = calcularFechasPorPlan({
      fechaAlta: billingAnchorDate,
      planNombre: formData.planId === "trial"
        ? "Prueba gratis 7 días"
        : formData.billingCycle === "annual" ? "Anual" : "Mensual",
    });
    const preservaCicloExistente = Boolean(clienteEditando?.id && !convierteTrialAPago && !modeloAnterior.isTrial);
    const fechas = preservaCicloExistente
      ? {
          fechaProximoCargo: clienteEditando.nextBillingDate || clienteEditando.fechaProximoCargo || fechasCalculadas.fechaProximoCargo,
          fechaVencimiento: clienteEditando.fechaVencimiento || fechasCalculadas.fechaVencimiento,
        }
      : fechasCalculadas;

    const precioFinal = esPruebaGratis
      ? 0
      : Number(formData.price);

    const formDataPersistible = { ...formData };
    delete formDataPersistible.currencyExplicit;
    delete formDataPersistible.moneda;
    const estadoSuscripcionLegacy = ({
      trial: "prueba", active: "activa", past_due: "gracia",
      suspended: "suspendida", cancelled: "cancelado",
    })[formData.subscriptionStatus] || configPlan.estadoSuscripcion;
    const dataAGuardar = {
      ...formDataPersistible,

    planId: resolveManualSaasPlanId(clienteEditando || formData, formData.planId),
    billingCycle: formData.billingCycle,
    currency: formData.currency,
    billingCurrency: formData.currency,
    price: precioFinal,
    subscriptionStatus: formData.subscriptionStatus,
    billingAnchorDate,
    nextBillingDate: esPruebaGratis ? "" : fechas.fechaProximoCargo,

    plan: formData.planNombre,
    planNombre: formData.planNombre,
    frecuenciaCobro: configPlan.frecuenciaCobro,
    diasCiclo: configPlan.diasCiclo,

    mantenimientoMensual: precioFinal,
    planPrecio: precioFinal,

      fechaProximoCargo: fechas.fechaProximoCargo,
      fechaVencimiento: fechas.fechaVencimiento,

      estado: formData.estado === "suspendido" ? "suspendido" : "activo",
      estadoSuscripcion: estadoSuscripcionLegacy,
    };

      if (clienteEditando?.id) {
        await updateDoc(doc(db, "clientes-saas", clienteEditando.id), dataAGuardar);
      } else {
        await addDoc(collection(db, "clientes-saas"), dataAGuardar);
      }

      onGuardado();
      onClose();
    } catch (error) {
      console.error("Error al guardar cliente SaaS:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ marginTop: 0 }}>
          {clienteEditando ? "Editar cliente SaaS" : "Nuevo cliente SaaS"}
        </h2>

      <form onSubmit={handleGuardar} style={form}>
        <div style={campo}>
          <label style={label}>Nombre del cliente / responsable</label>
          <input
            name="nombreCliente"
            
            value={formData.nombreCliente}
            onChange={handleChange}
            style={input}
          />
        </div>
      <div style={campo}>
        <label style={label}>Nombre de la empresa</label>
        <input
          name="nombre"
          value={formData.nombre}
          onChange={handleChange}
          style={input}
        />
      </div>
      <div style={campo}>
        <label style={label}>Email de contacto</label>
        <input
          name="email"
          type="email"
          placeholder="cliente@email.com"
          value={formData.email}
          onChange={handleChange}
          style={input}
        />
      </div>

      <div style={campo}>
        <label style={label}>Teléfono / WhatsApp</label>
        <input
          name="telefono"
          placeholder="+54 9 ..."
          value={formData.telefono}
          onChange={handleChange}
          style={input}
        />
      </div>

      <div style={campo}>
        <label style={label}>Estado del cliente</label>
        <select
          name="estado"
          value={formData.estado}
          onChange={handleChange}
          style={input}
        >
          <option value="activo">Activo</option>
          <option value="mora">Mora</option>
          <option value="suspendido">Suspendido</option>
        </select>
      </div>

      <div style={campo}>
        <label style={label}>Plan</label>
        <select
          name="planId"
          value={formData.planId}
          onChange={handleChange}
          style={input}
        >
          {clienteOriginalLegacy && (
            <option value="legacy">Legacy — conserva límites ilimitados</option>
          )}
          <option value="trial">Prueba gratis 7 días</option>
          {getSelectablePlans().map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
        {formData.planId === "legacy" && (
          <small style={{ color: "#64748b" }}>
            Cliente histórico: conserva usuarios y sucursales ilimitados.
          </small>
        )}
      </div>

      <div style={campo}>
        <label style={label}>Ciclo de facturación</label>
        <select name="billingCycle" value={formData.billingCycle} onChange={handleChange} style={input} disabled={formData.planId === "trial"}>
          <option value="monthly">Mensual</option>
          <option value="annual">Anual (precio manual)</option>
        </select>
      </div>

      <div style={campo}>
        <label style={label}>Moneda de facturación Zalfro</label>
        <select
          name="currency"
          value={formData.currency}
          onChange={handleChange}
          style={input}
        >
          <option value="">Sin moneda</option>
          {SUPPORTED_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>

      <div style={campo}>
        <label style={label}>País</label>
        <select
          name="pais"
          value={formData.pais}
          onChange={handleChange}
          style={input}
        >
          <option value="Argentina">Argentina</option>
          <option value="México">México</option>
          <option value="Colombia">Colombia</option>
          <option value="Ecuador">Ecuador</option>
          <option value="Perú">Perú</option>
          <option value="Chile">Chile</option>
          <option value="Estados Unidos">Estados Unidos</option>
          <option value="Otro">Otro</option>
        </select>
      </div>

      <div style={campo}>
        <label style={label}>Método de cobro</label>
        <select
          name="metodoCobro"
          value={formData.metodoCobro}
          onChange={handleChange}
          style={input}
        >
          <option value="manual">Manual</option>
          <option value="mercadopago">Mercado Pago</option>
          <option value="hotmart">Hotmart</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
        </select>
      </div>

      <div style={campo}>
        <label style={label}>{formData.billingCycle === "annual" ? "Precio anual" : "Precio mensual"}</label>
        <input
          name="price"
          type="number"
          placeholder="0"
          value={formData.price}
          onChange={handleChange}
          style={input}
        />
        <small style={{ color: "#64748b" }}>
          {new Intl.NumberFormat("es-AR", {
            style: "currency",
            currency: formData.currency || "ARS",
            minimumFractionDigits: 0,
          }).format(Number(formData.price || 0))}
        </small>
        {formData.planId !== "legacy" && formData.planId !== "trial" && priceForPlan(formData.planId, formData.currency, formData.billingCycle) === null && (
          <small style={{ color: "#64748b" }}>Ingresá el precio manualmente para esta moneda y ciclo.</small>
        )}
      </div>

      <div style={campo}>
        <label style={label}>Fecha de alta</label>
        <input
          name="fechaAlta"
          type="date"
          value={formData.fechaAlta}
          onChange={handleChange}
          style={input}
        />
      </div>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: 12,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div>
          <strong>Próximo cobro:</strong>{" "}
          {formData.fechaProximoCargo || "-"}
        </div>

        <div>
          <strong>Vencimiento límite:</strong>{" "}
          {formData.fechaVencimiento || "-"}
        </div>

        <small style={{ color: "#64748b" }}>
          Se calcula automáticamente según el plan: prueba 7 días, mensual 30 días o anual 365 días + 7 días de gracia.
        </small>
      </div>



      <div style={campo}>
        <label style={label}>Observaciones</label>
        <textarea
          name="observaciones"
          value={formData.observaciones}
          onChange={handleChange}
          style={{ ...input, minHeight: 90, resize: "vertical", paddingTop: 10 }}
        />
      </div>

      <div style={actions}>
        <button type="button" onClick={onClose} style={btnSec}>
          Cancelar
        </button>
        <button type="submit" disabled={loading} style={btnPri}>
          {loading ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modal = {
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
};

const form = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const campo = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const label = {
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
};

const input = {
  width: "100%",
  height: 42,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

const actions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 10,
};

const btnSec = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
};

const btnPri = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#6d28d9",
  color: "#fff",
  cursor: "pointer",
};
