'use strict';

const PROJECT = 'conectarsublimados-7881e';
const DATABASE = '(default)';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DETAIL_LIMIT = 50;
const KNOWN_PROBLEM_PAYMENTS = Object.freeze([
  Object.freeze({ tenant: 'elgol', saleId: '39iO7tiIMJa9k2X3K8Vw', paymentId: 'ICYOFj9oi7vZSPb1kwC7' }),
  Object.freeze({ tenant: 'elgol', saleId: '39iO7tiIMJa9k2X3K8Vw', paymentId: 'KW3vecpp6BMBYveP2K9Q' }),
  Object.freeze({ tenant: 'elgol', saleId: '39iO7tiIMJa9k2X3K8Vw', paymentId: 'oP0yX3PUyJVs0B2hB4SK' }),
  Object.freeze({ tenant: 'elgol3', saleId: 'ugBXc7nUUqkHlvkY7dl4', paymentId: 'zrCmHAg2jRv3Ov1wQk8K' }),
]);
const CLASSES = [
  'LISTO_PARA_COLLECTION_GROUP',
  'LEGACY_NORMALIZABLE',
  'AMBIGUO',
  'INCONSISTENTE',
  'INVALIDO',
];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function usage() {
  return [
    'Auditoría read-only de pagos de ventas y movimientos de cobro.',
    '',
    'Tenant individual:',
    '  node auditoria-pagos.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --page-size 100',
    '',
    'Inventario global:',
    '  node auditoria-pagos.cjs --project conectarsublimados-7881e --inventory-global --page-size 100',
    '',
    'Inspección cerrada de los cuatro pagos conocidos:',
    '  node auditoria-pagos.cjs --project conectarsublimados-7881e --inspect-known-payments --page-size 100',
    '',
    'Opciones:',
    '  --project        Debe ser conectarsublimados-7881e.',
    '  --tenant         Document ID exacto de clientes-saas.',
    '  --inventory-global  Audita todos los tenants y detecta huérfanos.',
    '  --inspect-known-payments  Lee exclusivamente los cuatro pagos registrados en el diagnóstico.',
    '  --page-size      Tamaño de página entre 1 y 500 (predeterminado: 100).',
    '  --limit-details  Máximo de casos detallados impresos (predeterminado: 50).',
    '  --help           Muestra esta ayuda sin cargar Firebase Admin.',
    '',
    'La herramienta no posee modo de escritura ni genera archivos locales.',
  ].join('\n');
}

function parseInteger(value, flag, min = 1, max = 500) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${flag}: debe ser un entero.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag}: debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function documentId(value, flag = '--tenant') {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.includes('/')) {
    throw new Error(`${flag}: document ID inválido.`);
  }
  return value;
}

function parseArgs(argv) {
  const flags = new Set(['--inventory-global', '--inspect-known-payments', '--help']);
  const valued = new Set(['--project', '--tenant', '--page-size', '--limit-details']);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if ((!flags.has(key) && !valued.has(key)) || hasOwn(options, key)) {
      throw new Error(`Argumento desconocido o repetido: ${key}`);
    }
    if (flags.has(key)) options[key] = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Falta valor para ${key}.`);
      options[key] = value;
    }
  }
  if (options['--help']) {
    if (Object.keys(options).length !== 1) throw new Error('--help debe usarse solo.');
    return { help: true };
  }
  if (options['--project'] !== PROJECT) throw new Error(`Proyecto obligatorio: ${PROJECT}.`);
  const global = options['--inventory-global'] === true;
  const inspectKnown = options['--inspect-known-payments'] === true;
  if ([global, inspectKnown, Boolean(options['--tenant'])].filter(Boolean).length !== 1) {
    throw new Error('Elegir exactamente uno: --tenant, --inventory-global o --inspect-known-payments.');
  }
  return {
    help: false,
    project: PROJECT,
    database: DATABASE,
    global,
    inspectKnown,
    tenant: global || inspectKnown ? null : documentId(options['--tenant']),
    pageSize: parseInteger(options['--page-size'] || DEFAULT_PAGE_SIZE, '--page-size'),
    detailLimit: parseInteger(options['--limit-details'] || DEFAULT_DETAIL_LIMIT, '--limit-details', 0, 500),
  };
}

function tenantName(data) {
  for (const field of ['nombreVisible', 'nombre', 'nombreCliente']) {
    if (typeof data[field] === 'string' && data[field].trim()) return data[field].trim();
  }
  return '';
}

function tenantRecord(snapshot) {
  const data = snapshot.data || {};
  return {
    clienteId: snapshot.id,
    nombre: tenantName(data),
    estado: data.estado ?? null,
    estadoSuscripcion: data.estadoSuscripcion ?? null,
    anomaliaIdentidad: hasOwn(data, 'clienteId') && data.clienteId !== snapshot.id,
  };
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validAmount(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
}

function paymentState(data) {
  if (!hasOwn(data, 'estadoPagoRegistro') || data.estadoPagoRegistro === '') return 'sin_estado';
  const value = String(data.estadoPagoRegistro).trim().toLowerCase();
  if (value === 'activo' || value === 'anulado') return value;
  return 'invalido';
}

function legacyStateHint(data) {
  const saysCancelled = data?.anulado === true || data?.activo === false;
  const saysActive = data?.anulado === false || data?.activo === true;
  if (saysCancelled && saysActive) return 'contradictorio';
  if (saysCancelled) return 'anulado';
  if (saysActive) return 'activo';
  return null;
}

function movementIsActive(data) {
  return String(data.estadoMovimiento || 'activo').trim().toLowerCase() === 'activo' && data.activo !== false;
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function stableEmbeddedId(data) {
  for (const field of ['firebaseId', 'pagoId', 'pagoRefId', 'id']) {
    if (typeof data?.[field] === 'string' && data[field].trim()) return data[field].trim();
  }
  return null;
}

function signature(data, dateField = 'fechaPago') {
  const date = typeof data?.[dateField] === 'string' ? data[dateField] : '';
  const amount = Number(data?.monto);
  const method = String(data?.medioPago || '').trim().toLowerCase();
  if (!date || !Number.isFinite(amount)) return null;
  return `${date}|${amount}|${method}`;
}

function equivalentPayment(left, right) {
  return signature(left) !== null && signature(left) === signature(right) &&
    paymentState(left) === paymentState(right);
}

function emptyMetrics() {
  return {
    ventasExaminadas: 0,
    ventasConPagosSubcoleccion: 0,
    ventasConPagosEmbebidos: 0,
    ventasConAmbasRepresentaciones: 0,
    pagosSubcoleccion: 0,
    pagosEmbebidos: 0,
    pagosActivos: 0,
    pagosAnulados: 0,
    pagosSinClienteId: 0,
    pagosSinFechaPago: 0,
    pagosSinEstadoPagoRegistro: 0,
    pagosConMovimientoRelacionado: 0,
    pagosSinMovimientoRelacionado: 0,
    movimientosCobroVenta: 0,
    movimientosHuerfanos: 0,
    anulacionesInconsistentes: 0,
    posiblesAnulacionesInconsistentes: 0,
    duplicadosSeguros: 0,
    duplicadosAmbiguos: 0,
    errores: 0,
    clasificaciones: Object.fromEntries(CLASSES.map(value => [value, 0])),
  };
}

function addMetrics(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key === 'clasificaciones') {
      for (const item of CLASSES) target.clasificaciones[item] += value[item];
    } else if (typeof value === 'number') target[key] += value;
  }
}

function classifySubPayment(payment, saleTenant) {
  const data = payment.data || {};
  const state = paymentState(data);
  if (!validIsoDate(data.fechaPago) || !validAmount(data.monto)) {
    return { classification: 'INVALIDO', reason: 'fechaPago o monto esencial inválido' };
  }
  if (typeof saleTenant !== 'string' || !saleTenant) {
    return { classification: 'INVALIDO', reason: 'venta sin clienteId válido' };
  }
  const missingTenant = !hasOwn(data, 'clienteId') || data.clienteId === '';
  if (!missingTenant && (typeof data.clienteId !== 'string' || data.clienteId !== saleTenant)) {
    return { classification: 'INCONSISTENTE', reason: 'clienteId del pago difiere de la venta padre' };
  }
  if (state === 'sin_estado') {
    const hint = legacyStateHint(data);
    if (hint === 'contradictorio') {
      return { classification: 'INCONSISTENTE', reason: 'indicadores legacy de estado contradictorios' };
    }
    if (!hint) {
      return { classification: 'AMBIGUO', reason: 'estado histórico ausente sin indicador estable' };
    }
  }
  if (state === 'invalido') {
    return { classification: 'INVALIDO', reason: 'estadoPagoRegistro no reconocido' };
  }
  if (missingTenant || state === 'sin_estado') {
    return { classification: 'LEGACY_NORMALIZABLE', reason: 'tenant o estado derivable de datos estables' };
  }
  return { classification: 'LISTO_PARA_COLLECTION_GROUP', reason: 'tenant, fecha, estado e identidad documental válidos' };
}

function classifyEmbeddedPayment(payment, matchingSubdocuments) {
  const data = payment.data || {};
  const state = paymentState(data);
  if (!validIsoDate(data.fechaPago) || !validAmount(data.monto)) {
    return { classification: 'INVALIDO', reason: 'fechaPago o monto esencial inválido' };
  }
  if (state === 'invalido') return { classification: 'INVALIDO', reason: 'estadoPagoRegistro no reconocido' };
  if (state === 'sin_estado' && !legacyStateHint(data)) {
    return { classification: 'AMBIGUO', reason: 'estado histórico ausente sin indicador estable' };
  }
  const stableId = stableEmbeddedId(data);
  if (stableId) {
    const exact = matchingSubdocuments.find(candidate => candidate.id === stableId);
    if (exact) {
      return equivalentPayment(data, exact.data)
        ? { classification: 'LEGACY_NORMALIZABLE', reason: 'duplicado seguro por ID estable; conservar subcolección' }
        : { classification: 'INCONSISTENTE', reason: 'mismo ID estable con datos distintos' };
    }
    return { classification: 'LEGACY_NORMALIZABLE', reason: 'ID estable sin documento equivalente en subcolección' };
  }
  const possible = matchingSubdocuments.filter(candidate => signature(candidate.data) === signature(data));
  if (possible.length) {
    return { classification: 'AMBIGUO', reason: 'coincidencia solo por fecha, monto y medio' };
  }
  return { classification: 'AMBIGUO', reason: 'pago embebido sin identificador estable' };
}

async function readAllPages(readPage, pageSize, label, errors) {
  const documents = [];
  let cursor = null;
  let complete = false;
  try {
    for (;;) {
      const page = await readPage(cursor, pageSize);
      if (!Array.isArray(page) || page.length > pageSize) throw new Error('Página inválida.');
      documents.push(...page);
      if (page.length < pageSize) {
        complete = true;
        break;
      }
      if (!page.length || page[page.length - 1].id === cursor) throw new Error('Cursor sin avance.');
      cursor = page[page.length - 1].id;
    }
  } catch (error) {
    errors.push({ scope: label, cursor, message: String(error.message || error) });
  }
  return { documents, complete };
}

function detail(details, entry, limit) {
  if (details.length < limit) details.push(entry);
}

async function runAudit(config, adapter) {
  const errors = [];
  const details = [];
  const tenantsRead = await readAllPages(
    (cursor, size) => adapter.pageTenants(config.tenant, cursor, size),
    config.pageSize,
    'clientes-saas',
    errors
  );
  const tenants = new Map(tenantsRead.documents.map(snapshot => {
    const tenant = tenantRecord(snapshot);
    return [tenant.clienteId, tenant];
  }));
  if (!config.global) {
    const tenant = tenants.get(config.tenant);
    if (!tenant) throw new Error(`No existe clientes-saas/${config.tenant}.`);
    if (tenant.anomaliaIdentidad) throw new Error(`Identidad inconsistente en clientes-saas/${config.tenant}.`);
  }

  const salesRead = await readAllPages(
    (cursor, size) => adapter.pageSales(config.tenant, cursor, size),
    config.pageSize,
    'ventas',
    errors
  );
  const movementsRead = await readAllPages(
    (cursor, size) => adapter.pageMovements(config.tenant, cursor, size),
    config.pageSize,
    'movimientos',
    errors
  );

  const buckets = new Map();
  const bucketFor = tenantId => {
    const key = typeof tenantId === 'string' && tenantId ? tenantId : '(clienteId inválido)';
    if (!buckets.has(key)) {
      const tenant = tenants.get(key);
      buckets.set(key, {
        clienteId: key,
        nombre: tenant?.nombre || '',
        registrado: Boolean(tenant),
        estado: tenant?.estado ?? null,
        estadoSuscripcion: tenant?.estadoSuscripcion ?? null,
        metricas: emptyMetrics(),
      });
    }
    return buckets.get(key);
  };
  if (config.global) tenants.forEach(tenant => bucketFor(tenant.clienteId));
  else bucketFor(config.tenant);

  const subPayments = [];
  const embeddedPayments = [];
  let paymentsComplete = true;
  for (const sale of salesRead.documents) {
    const saleData = sale.data || {};
    const tenantId = saleData.clienteId;
    if (!config.global && tenantId !== config.tenant) continue;
    const bucket = bucketFor(tenantId);
    bucket.metricas.ventasExaminadas += 1;
    const paymentsRead = await readAllPages(
      (cursor, size) => adapter.pagePayments(sale.id, cursor, size),
      config.pageSize,
      `ventas/${sale.id}/pagos`,
      errors
    );
    paymentsComplete = paymentsComplete && paymentsRead.complete;
    if (paymentsRead.documents.length) bucket.metricas.ventasConPagosSubcoleccion += 1;
    if (Array.isArray(saleData.pagos) && saleData.pagos.length) bucket.metricas.ventasConPagosEmbebidos += 1;
    if (paymentsRead.documents.length && Array.isArray(saleData.pagos) && saleData.pagos.length) {
      bucket.metricas.ventasConAmbasRepresentaciones += 1;
    }
    for (const payment of paymentsRead.documents) {
      subPayments.push({ ...payment, saleId: sale.id, saleTenant: tenantId, bucket });
    }
    (Array.isArray(saleData.pagos) ? saleData.pagos : []).forEach((data, index) => {
      embeddedPayments.push({ id: `embebido-${index}`, data, saleId: sale.id, saleTenant: tenantId, bucket });
    });
  }

  const movements = movementsRead.documents
    .filter(item => item.data?.subtipo === 'cobro_venta')
    .map(item => ({ ...item, tenantId: item.data?.clienteId }));
  const movementsByReliablePayment = new Map();
  for (const movement of movements) {
    const bucket = bucketFor(movement.tenantId);
    bucket.metricas.movimientosCobroVenta += 1;
    const paymentId = typeof movement.data?.pagoRefId === 'string' && movement.data.pagoRefId.trim()
      ? movement.data.pagoRefId.trim() : null;
    if (paymentId && typeof movement.data?.origenRefId === 'string') {
      const key = `${movement.tenantId}|${movement.data.origenRefId}|${paymentId}`;
      if (!movementsByReliablePayment.has(key)) movementsByReliablePayment.set(key, []);
      movementsByReliablePayment.get(key).push(movement);
    }
  }

  for (const payment of subPayments) {
    const metrics = payment.bucket.metricas;
    metrics.pagosSubcoleccion += 1;
    const state = paymentState(payment.data);
    if (state === 'activo') metrics.pagosActivos += 1;
    if (state === 'anulado') metrics.pagosAnulados += 1;
    if (!hasOwn(payment.data, 'clienteId') || payment.data.clienteId === '') metrics.pagosSinClienteId += 1;
    if (!validIsoDate(payment.data.fechaPago)) metrics.pagosSinFechaPago += 1;
    if (state === 'sin_estado') metrics.pagosSinEstadoPagoRegistro += 1;
    const classified = classifySubPayment(payment, payment.saleTenant);
    metrics.clasificaciones[classified.classification] += 1;
    if (classified.classification !== 'LISTO_PARA_COLLECTION_GROUP') {
      detail(details, { tipo: 'pago_subcoleccion', tenant: payment.saleTenant, ventaId: payment.saleId,
        pagoId: payment.id, ...classified }, config.detailLimit);
    }

    const key = `${payment.saleTenant}|${payment.saleId}|${payment.id}`;
    const related = movementsByReliablePayment.get(key) || [];
    if (related.length) metrics.pagosConMovimientoRelacionado += 1;
    else metrics.pagosSinMovimientoRelacionado += 1;
    if (state === 'anulado' && related.some(movement => movementIsActive(movement.data))) {
      metrics.anulacionesInconsistentes += 1;
      metrics.clasificaciones.INCONSISTENTE += 1;
      detail(details, { tipo: 'estado_pago_movimiento', tenant: payment.saleTenant,
        ventaId: payment.saleId, pagoId: payment.id, classification: 'INCONSISTENTE',
        reason: 'pago anulado con movimiento relacionado activo' }, config.detailLimit);
    }
  }

  for (const embedded of embeddedPayments) {
    const metrics = embedded.bucket.metricas;
    metrics.pagosEmbebidos += 1;
    const state = paymentState(embedded.data);
    if (state === 'activo') metrics.pagosActivos += 1;
    if (state === 'anulado') metrics.pagosAnulados += 1;
    if (!hasOwn(embedded.data, 'clienteId') || embedded.data.clienteId === '') metrics.pagosSinClienteId += 1;
    if (!validIsoDate(embedded.data.fechaPago)) metrics.pagosSinFechaPago += 1;
    if (state === 'sin_estado') metrics.pagosSinEstadoPagoRegistro += 1;
    const matchingSubs = subPayments.filter(item => item.saleId === embedded.saleId);
    const classified = classifyEmbeddedPayment(embedded, matchingSubs);
    metrics.clasificaciones[classified.classification] += 1;
    const stableId = stableEmbeddedId(embedded.data);
    const safe = stableId && matchingSubs.some(item => item.id === stableId && equivalentPayment(embedded.data, item.data));
    const possible = !safe && matchingSubs.some(item => signature(item.data) === signature(embedded.data));
    if (safe) metrics.duplicadosSeguros += 1;
    if (possible) metrics.duplicadosAmbiguos += 1;
    if (classified.classification !== 'LEGACY_NORMALIZABLE' || !safe) {
      detail(details, { tipo: 'pago_embebido', tenant: embedded.saleTenant,
        ventaId: embedded.saleId, pagoIdEstable: stableId, ...classified }, config.detailLimit);
    }
  }

  const reliableMovementIds = new Set();
  for (const payment of subPayments) {
    const key = `${payment.saleTenant}|${payment.saleId}|${payment.id}`;
    (movementsByReliablePayment.get(key) || []).forEach(item => reliableMovementIds.add(item.id));
  }
  for (const movement of movements) {
    if (reliableMovementIds.has(movement.id)) continue;
    const bucket = bucketFor(movement.tenantId);
    bucket.metricas.movimientosHuerfanos += 1;
    const fuzzy = subPayments.filter(payment =>
      payment.saleTenant === movement.tenantId &&
      payment.saleId === movement.data?.origenRefId &&
      signature(payment.data) === signature(movement.data, 'fecha')
    );
    const classification = fuzzy.length ? 'AMBIGUO' : 'INCONSISTENTE';
    if (movementIsActive(movement.data) && fuzzy.some(payment => paymentState(payment.data) === 'anulado')) {
      bucket.metricas.posiblesAnulacionesInconsistentes += 1;
    }
    bucket.metricas.clasificaciones[classification] += 1;
    detail(details, { tipo: 'movimiento_sin_pago_confiable', tenant: movement.tenantId,
      movimientoId: movement.id, ventaId: movement.data?.origenRefId || null,
      classification, reason: fuzzy.length
        ? `hay ${fuzzy.length} coincidencia(s) solo por fecha, monto y medio`
        : 'no existe pago relacionado mediante pagoRefId' }, config.detailLimit);
  }

  for (const error of errors) {
    const match = /^ventas\/([^/]+)\/pagos$/.exec(error.scope);
    const sale = match && salesRead.documents.find(item => item.id === match[1]);
    bucketFor(sale?.data?.clienteId || config.tenant || '(clienteId inválido)').metricas.errores += 1;
  }
  const rows = [...buckets.values()].sort((left, right) => left.clienteId.localeCompare(right.clienteId));
  const totals = emptyMetrics();
  rows.forEach(row => addMetrics(totals, row.metricas));
  totals.errores = errors.length;
  return {
    project: config.project,
    database: config.database,
    mode: config.global ? 'INVENTARIO_GLOBAL_READ_ONLY' : 'TENANT_READ_ONLY',
    tenant: config.tenant,
    complete: { clientesSaas: tenantsRead.complete, ventas: salesRead.complete,
      pagos: paymentsComplete, movimientos: movementsRead.complete },
    definitive: errors.length === 0 && tenantsRead.complete && salesRead.complete &&
      paymentsComplete && movementsRead.complete,
    tenants: rows,
    totals,
    details,
    errors,
  };
}

function classifyKnownPayment({ target, sale, payment, movements }) {
  if (!sale) return { classification: 'NO_NORMALIZABLE', reason: 'la venta padre no existe', suggestedChanges: {} };
  if (!payment) return { classification: 'NO_NORMALIZABLE', reason: 'el pago no existe', suggestedChanges: {} };
  if (sale.data?.clienteId !== target.tenant) {
    return { classification: 'NO_NORMALIZABLE', reason: 'tenant de la venta padre inconsistente', suggestedChanges: {} };
  }
  const data = payment.data || {};
  if (hasOwn(data, 'clienteId') && data.clienteId !== target.tenant) {
    return { classification: 'NO_NORMALIZABLE', reason: 'tenant del pago inconsistente', suggestedChanges: {} };
  }
  if (!validAmount(data.monto)) {
    return { classification: 'NO_NORMALIZABLE', reason: 'monto ausente o inválido', suggestedChanges: {} };
  }
  if (!validIsoDate(data.fechaPago)) {
    return {
      classification: 'NO_NORMALIZABLE',
      reason: 'fechaPago ausente o inválida; createdAt y fechaVenta no prueban la fecha del cobro',
      suggestedChanges: {},
    };
  }
  const state = paymentState(data);
  if (state === 'invalido') {
    return { classification: 'NO_NORMALIZABLE', reason: 'estadoPagoRegistro tiene un valor inválido', suggestedChanges: {} };
  }
  const suggestedChanges = {};
  if (!hasOwn(data, 'clienteId') || data.clienteId === '') suggestedChanges.clienteId = target.tenant;
  if (!hasOwn(data, 'ventaId') || data.ventaId === '') suggestedChanges.ventaId = target.saleId;
  if (state === 'sin_estado') {
    const hint = legacyStateHint(data);
    const saleCancelled = ['anulada', 'cancelada', 'cancelado'].includes(
      String(sale.data?.estadoVenta || '').trim().toLowerCase()
    );
    if (hint === 'contradictorio') {
      return { classification: 'AMBIGUO', reason: 'indicadores legacy de estado contradictorios', suggestedChanges: {} };
    }
    if (hint === 'activo' || hint === 'anulado') suggestedChanges.estadoPagoRegistro = hint;
    else if (saleCancelled) suggestedChanges.estadoPagoRegistro = 'anulado';
    else {
      const exactMovements = movements.filter(item => item.data?.pagoRefId === target.paymentId);
      return {
        classification: 'AMBIGUO',
        reason: exactMovements.length
          ? 'el movimiento enlazado no prueba que el pago siga activo debido al bug histórico de anulación individual'
          : 'estado ausente sin indicador legacy ni movimiento identificado por pagoRefId',
        suggestedChanges,
      };
    }
  }
  return {
    classification: 'NORMALIZABLE_SEGURO',
    reason: Object.keys(suggestedChanges).length
      ? 'los campos propuestos se derivan de identidad o evidencia estable'
      : 'el documento ya posee la estructura esencial válida',
    suggestedChanges,
  };
}

function selectedRecord(snapshot, fields) {
  if (!snapshot) return null;
  const data = snapshot.data || {};
  return {
    id: snapshot.id,
    ...Object.fromEntries(fields.filter(field => hasOwn(data, field)).map(field => [field, data[field]])),
  };
}

function tenantEssentials(tenant) {
  return selectedRecord(tenant, ['nombre', 'nombreVisible', 'estado', 'timezone', 'moneda']);
}

function saleEssentials(sale) {
  return selectedRecord(sale, [
    'estadoVenta', 'estadoPago', 'total', 'totalPagado', 'saldoPendiente',
    'saldoAFavor', 'fechaVenta', 'anuladaAt', 'motivoAnulacion',
  ]);
}

function paymentEssentials(payment) {
  return selectedRecord(payment, [
    'clienteId', 'ventaRefId', 'ventaId', 'fechaPago', 'monto', 'medioPago',
    'estadoPagoRegistro', 'createdAt', 'updatedAt', 'movimientoRefId',
  ]);
}

function movementEssentials(movement) {
  return selectedRecord(movement, [
    'origenRefId', 'pagoRefId', 'subtipo', 'origen', 'monto', 'fecha',
    'medioPago', 'estadoMovimiento', 'activo',
  ]);
}

async function runKnownPaymentsDiagnostic(config, adapter) {
  if (!config.inspectKnown || config.global || config.tenant) throw new Error('Modo dirigido inválido.');
  const errors = [];
  const tenantCache = new Map();
  const saleCache = new Map();
  const movementsCache = new Map();
  const cases = [];

  for (const target of KNOWN_PROBLEM_PAYMENTS) {
    if (!tenantCache.has(target.tenant)) {
      const tenantRead = await readAllPages(
        (cursor, size) => adapter.pageTenants(target.tenant, cursor, size),
        config.pageSize,
        `clientes-saas/${target.tenant}`,
        errors
      );
      tenantCache.set(target.tenant, tenantRead.documents[0] || null);
    }
    const saleKey = `${target.tenant}/${target.saleId}`;
    if (!saleCache.has(saleKey)) saleCache.set(saleKey, await adapter.getSale(target.saleId));
    if (!movementsCache.has(target.tenant)) {
      movementsCache.set(target.tenant, await readAllPages(
        (cursor, size) => adapter.pageMovements(target.tenant, cursor, size),
        config.pageSize,
        `movimientos/${target.tenant}`,
        errors
      ));
    }
    const sale = saleCache.get(saleKey);
    const payment = await adapter.getPayment(target.saleId, target.paymentId);
    const relatedMovements = movementsCache.get(target.tenant).documents.filter(
      item => item.data?.origenRefId === target.saleId
    );
    const tenant = tenantCache.get(target.tenant);
    const classification = classifyKnownPayment({ target, sale, payment, movements: relatedMovements });
    cases.push({
      target,
      tenant: tenantEssentials(tenant),
      sale: saleEssentials(sale),
      payment: paymentEssentials(payment),
      movementsByOriginRefId: relatedMovements.map(movementEssentials),
      identityWarning: 'Los movimientos se muestran por origenRefId; solo pagoRefId exacto demuestra identidad con el pago.',
      ...classification,
    });
  }
  const complete = errors.length === 0 && [...movementsCache.values()].every(value => value.complete);
  return { project: config.project, database: config.database, mode: 'KNOWN_PAYMENTS_READ_ONLY',
    complete, definitive: complete, cases, errors };
}

function printKnownPaymentsReport(result, log = console.log) {
  log(`Proyecto: ${result.project}`);
  log(`Base: ${result.database}`);
  log(`Modo: ${result.mode}`);
  log(`Totales definitivos: ${result.definitive ? 'sí' : 'no'}`);
  for (const item of result.cases) {
    log('');
    log(`PAGO ${item.target.tenant}/${item.target.saleId}/${item.target.paymentId}`);
    log(`Clasificación: ${item.classification}`);
    log(`Motivo: ${item.reason}`);
    log(`Cambios potenciales: ${JSON.stringify(item.suggestedChanges)}`);
    log(`Tenant: ${JSON.stringify(item.tenant, null, 2)}`);
    log(`Venta padre: ${JSON.stringify(item.sale, null, 2)}`);
    log(`Pago: ${JSON.stringify(item.payment, null, 2)}`);
    log(item.identityWarning);
    log(`Movimientos relacionados: ${JSON.stringify(item.movementsByOriginRefId, null, 2)}`);
  }
  result.errors.forEach(error => log(`ERROR ${error.scope}: ${error.message}`));
}

function printMetrics(metrics, log) {
  for (const [key, value] of Object.entries(metrics)) {
    if (key !== 'clasificaciones') log(`  ${key}: ${value}`);
  }
  log(`  clasificaciones: ${JSON.stringify(metrics.clasificaciones)}`);
}

function printReport(result, log = console.log) {
  log(`Proyecto: ${result.project}`);
  log(`Base: ${result.database}`);
  log(`Modo: ${result.mode}`);
  if (result.tenant) log(`Tenant: ${result.tenant}`);
  log(`Recorridos completos: ${JSON.stringify(result.complete)}`);
  log(`Totales definitivos: ${result.definitive ? 'sí' : 'no'}`);
  log('');
  for (const row of result.tenants) {
    log(`TENANT ${row.clienteId} | ${row.nombre || '(sin nombre)'} | registrado=${row.registrado ? 'sí' : 'no'}`);
    printMetrics(row.metricas, log);
  }
  log('');
  log('TOTALES GLOBALES');
  printMetrics(result.totals, log);
  log('');
  log(`CASOS DETALLADOS (${result.details.length})`);
  result.details.forEach(item => log(JSON.stringify(item)));
  result.errors.forEach(error => log(`ERROR ${error.scope}: ${error.message}`));
}

function plain(snapshot) {
  return { id: snapshot.id, data: snapshot.data(), updateTime: timestampToIso(snapshot.updateTime) };
}

function createReadOnlyAdapter(db, FieldPath) {
  async function page(query, cursor, size) {
    let current = query.orderBy(FieldPath.documentId()).limit(size);
    if (cursor !== null) current = current.startAfter(cursor);
    return (await current.get()).docs.map(plain);
  }
  return Object.freeze({
    pageTenants: async (tenant, cursor, size) => {
      if (tenant) {
        if (cursor !== null) return [];
        const snapshot = await db.collection('clientes-saas').doc(tenant).get();
        return snapshot.exists ? [plain(snapshot)] : [];
      }
      return page(db.collection('clientes-saas').select(
        'clienteId', 'nombreVisible', 'nombre', 'nombreCliente', 'estado', 'estadoSuscripcion'
      ), cursor, size);
    },
    pageSales: (tenant, cursor, size) => {
      let query = db.collection('ventas');
      if (tenant) query = query.where('clienteId', '==', tenant);
      return page(query.select('clienteId', 'pagos'), cursor, size);
    },
    pagePayments: (saleId, cursor, size) => page(
      db.collection('ventas').doc(saleId).collection('pagos').select(
        'clienteId', 'fechaPago', 'monto', 'medioPago', 'estadoPagoRegistro', 'activo', 'anulado'
      ), cursor, size
    ),
    pageMovements: (tenant, cursor, size) => {
      let query = db.collection('movimientos');
      if (tenant) query = query.where('clienteId', '==', tenant);
      return page(query.select(
        'clienteId', 'subtipo', 'origen', 'origenRefId', 'pagoRefId', 'fecha', 'monto',
        'medioPago', 'estadoMovimiento', 'activo', 'createdAt', 'updatedAt', 'anuladoAt',
        'motivoAnulacion'
      ), cursor, size);
    },
    getSale: async saleId => {
      const snapshot = await db.collection('ventas').doc(saleId).get();
      return snapshot.exists ? plain(snapshot) : null;
    },
    getPayment: async (saleId, paymentId) => {
      const snapshot = await db.collection('ventas').doc(saleId).collection('pagos').doc(paymentId).get();
      return snapshot.exists ? plain(snapshot) : null;
    },
  });
}

async function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv);
  if (config.help) {
    console.log(usage());
    return 0;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador no permitido para esta auditoría.');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldPath } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: config.project, credential: applicationDefault() });
  const db = getFirestore(app, config.database);
  try {
    const adapter = createReadOnlyAdapter(db, FieldPath);
    const result = config.inspectKnown
      ? await runKnownPaymentsDiagnostic(config, adapter)
      : await runAudit(config, adapter);
    if (config.inspectKnown) printKnownPaymentsReport(result);
    else printReport(result);
    return result.definitive ? 0 : 2;
  } finally {
    await db.terminate();
  }
}

module.exports = {
  CLASSES,
  KNOWN_PROBLEM_PAYMENTS,
  parseArgs,
  validIsoDate,
  paymentState,
  stableEmbeddedId,
  classifySubPayment,
  classifyEmbeddedPayment,
  runAudit,
  classifyKnownPayment,
  runKnownPaymentsDiagnostic,
  createReadOnlyAdapter,
  printReport,
  printKnownPaymentsReport,
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Abortado: ${error.message || error}`);
    process.exitCode = 1;
  });
}
