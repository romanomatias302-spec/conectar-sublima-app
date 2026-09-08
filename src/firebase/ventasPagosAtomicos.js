export function vincularPagoYMovimiento({
  pagoBase,
  movimientoBase,
  ventaId,
  pagoId,
  movimientoId,
}) {
  if (!ventaId || !pagoId || !movimientoId) {
    throw new Error("Faltan identificadores para vincular pago y movimiento.");
  }
  if (!pagoBase?.clienteId || pagoBase.clienteId !== movimientoBase?.clienteId) {
    throw new Error("Pago y movimiento deben pertenecer al mismo tenant.");
  }
  if (!pagoBase.fechaPago || !Number.isFinite(Number(pagoBase.monto))) {
    throw new Error("El pago requiere fecha y monto válidos.");
  }
  return {
    pago: {
      ...pagoBase,
      ventaRefId: ventaId,
      ventaId,
      estadoPagoRegistro: pagoBase.estadoPagoRegistro || "activo",
      movimientoRefId: movimientoId,
    },
    movimiento: {
      ...movimientoBase,
      origenRefId: ventaId,
      pagoRefId: pagoId,
    },
  };
}

export async function confirmarPagoYMovimientoAtomico({
  batch,
  pagoRef,
  movimientoRef,
  pago,
  movimiento,
}) {
  batch.set(pagoRef, pago);
  batch.set(movimientoRef, movimiento);
  await batch.commit();
}

export function calcularVentaTrasAnularPago({ venta, pago }) {
  const total = Number(venta?.total || 0);
  const totalPagadoActual = Number(venta?.totalPagado || 0);
  const montoPago = Number(pago?.monto || 0);
  if (![total, totalPagadoActual, montoPago].every(Number.isFinite) || montoPago <= 0) {
    throw new Error("No se pueden recalcular los totales del pago con seguridad.");
  }
  const totalPagado = Math.max(0, totalPagadoActual - montoPago);
  const saldoPendiente = Math.max(0, total - totalPagado);
  const saldoAFavor = Math.max(0, totalPagado - total);
  let estadoPago = "pendiente";
  if (totalPagado > 0 && saldoPendiente > 0) estadoPago = "parcial";
  if (saldoPendiente <= 0 && total > 0) estadoPago = "pagado";
  return { totalPagado, saldoPendiente, saldoAFavor, estadoPago };
}

export function crearCambiosAnulacionPago({ totales, motivoAnulacion, actor, marcaTiempo }) {
  const auditoria = {
    motivoAnulacion,
    anuladoAt: marcaTiempo,
    anuladoPor: actor || "",
    updatedAt: marcaTiempo,
  };
  return {
    pago: { estadoPagoRegistro: "anulado", ...auditoria },
    movimiento: { estadoMovimiento: "anulado", activo: false, ...auditoria },
    venta: { ...totales, updatedAt: marcaTiempo },
  };
}
