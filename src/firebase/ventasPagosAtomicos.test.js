import {
  calcularVentaTrasAnularPago,
  confirmarPagoYMovimientoAtomico,
  crearCambiosAnulacionPago,
  vincularPagoYMovimiento,
} from "./ventasPagosAtomicos";

test("un pago nuevo conserva campos obligatorios y referencia el movimiento real", () => {
  const resultado = vincularPagoYMovimiento({
    pagoBase: {
      clienteId: "tenant-a", fechaPago: "2026-09-03", monto: 100,
      medioPago: "efectivo", createdAt: "timestamp",
    },
    movimientoBase: { clienteId: "tenant-a", estadoMovimiento: "activo" },
    ventaId: "venta-1", pagoId: "pago-1", movimientoId: "mov-1",
  });
  expect(resultado.pago).toMatchObject({
    clienteId: "tenant-a", ventaId: "venta-1", ventaRefId: "venta-1",
    fechaPago: "2026-09-03", monto: 100, medioPago: "efectivo",
    estadoPagoRegistro: "activo", createdAt: "timestamp", movimientoRefId: "mov-1",
  });
  expect(resultado.movimiento).toMatchObject({
    clienteId: "tenant-a", origenRefId: "venta-1", pagoRefId: "pago-1",
  });
});

test("rechaza relaciones entre tenants diferentes", () => {
  expect(() => vincularPagoYMovimiento({
    pagoBase: { clienteId: "tenant-a", fechaPago: "2026-09-03", monto: 1 },
    movimientoBase: { clienteId: "tenant-b" },
    ventaId: "v", pagoId: "p", movimientoId: "m",
  })).toThrow("mismo tenant");
});

test("el batch recibe ambos documentos antes de un único commit", async () => {
  const events = [];
  const batch = {
    set: (ref) => events.push(`set:${ref}`),
    commit: async () => events.push("commit"),
  };
  await confirmarPagoYMovimientoAtomico({
    batch, pagoRef: "pago", movimientoRef: "movimiento", pago: {}, movimiento: {},
  });
  expect(events).toEqual(["set:pago", "set:movimiento", "commit"]);
});

test("la anulación descuenta el pago y recalcula estado y saldos", () => {
  expect(calcularVentaTrasAnularPago({
    venta: { total: 100, totalPagado: 100 }, pago: { monto: 40 },
  })).toEqual({
    totalPagado: 60, saldoPendiente: 40, saldoAFavor: 0, estadoPago: "parcial",
  });
});

test("la anulación marca pago y movimiento y actualiza la venta en una misma operación", () => {
  const cambios = crearCambiosAnulacionPago({
    totales: { totalPagado: 60, saldoPendiente: 40, saldoAFavor: 0, estadoPago: "parcial" },
    motivoAnulacion: "corrección", actor: "usuario@example.com", marcaTiempo: "timestamp",
  });
  expect(cambios.pago).toMatchObject({ estadoPagoRegistro: "anulado", anuladoAt: "timestamp" });
  expect(cambios.movimiento).toMatchObject({ estadoMovimiento: "anulado", activo: false });
  expect(cambios.venta).toMatchObject({ totalPagado: 60, saldoPendiente: 40, updatedAt: "timestamp" });
});
