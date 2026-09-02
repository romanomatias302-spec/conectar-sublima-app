'use strict';

// Importar este módulo no carga Firebase, no busca credenciales y no abre red.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT = 'conectarsublimados-7881e';
const DATABASE = '(default)';
const TENANT = 'elgol';
const VERSION = 1;
const FIELDS = Object.freeze({
  ventas: { source: 'clienteNombre', target: 'clienteNombreBusqueda' },
  pedidos: { source: 'cliente', target: 'clienteBusqueda' },
});
const COLLECTIONS = Object.keys(FIELDS);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clone = (value) => JSON.parse(JSON.stringify(value));

function integer(value, flag, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) ||
      Number(value) < min || Number(value) > max) throw new Error(`${flag}: entero inválido.`);
  return Number(value);
}

function documentId(value) {
  if (typeof value !== 'string' || !value || value.includes('/') ||
      value === '.' || value === '..' || Buffer.byteLength(value) > 1500) {
    throw new Error('ID documental/cursor inválido.');
  }
  return value;
}

function parseArgs(argv) {
  const flags = new Set(['--apply', '--dry-run', '--reconcile-only', '--inventory-global', '--help']);
  const values = new Set(['--tenant', '--project', '--database', '--page-size',
    '--confirm-tenant', '--max-updates', '--run-dir', '--resume', '--max-pages',
    '--conflict-retries', '--after-ventas', '--after-pedidos']);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if ((!flags.has(key) && !values.has(key)) || has(options, key)) {
      throw new Error(`Argumento desconocido o repetido: ${key}`);
    }
    if (flags.has(key)) options[key] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Falta valor para ${key}.`);
      options[key] = value;
    }
  }
  if (options['--help']) {
    if (Object.keys(options).length !== 1) throw new Error('--help debe usarse solo.');
    return { help: true };
  }
  if (options['--project'] !== PROJECT) throw new Error(`Proyecto obligatorio y único autorizado: ${PROJECT}.`);
  if ((options['--database'] || DATABASE) !== DATABASE) throw new Error('Solo se permite la base (default).');
  const inventoryGlobal = options['--inventory-global'] === true;
  if (inventoryGlobal) {
    const allowed = new Set(['--inventory-global', '--project', '--database', '--page-size']);
    const incompatible = Object.keys(options).filter(key => !allowed.has(key));
    if (incompatible.length) {
      throw new Error(`--inventory-global no admite: ${incompatible.join(', ')}.`);
    }
    return {
      project: PROJECT, database: DATABASE, inventoryGlobal: true, apply: false,
      reconcileOnly: false,
      pageSize: integer(options['--page-size'] || 100, '--page-size', 1, 500),
      runDir: null,
    };
  }
  if (!options['--tenant']) throw new Error('--tenant es obligatorio.');
  const tenant = documentId(options['--tenant']);
  const apply = options['--apply'] === true;
  const reconcileOnly = options['--reconcile-only'] === true;
  if (apply && options['--dry-run']) throw new Error('--apply y --dry-run son incompatibles.');
  if (reconcileOnly && (apply || options['--dry-run'])) {
    throw new Error('--reconcile-only es incompatible con --apply y --dry-run.');
  }
  if (reconcileOnly && (!options['--resume'] || options['--run-dir'])) {
    throw new Error('--reconcile-only exige --resume y no admite --run-dir.');
  }
  if (apply && options['--confirm-tenant'] !== tenant) {
    throw new Error('--apply exige --confirm-tenant idéntico a --tenant.');
  }
  if (apply && !options['--max-updates']) throw new Error('--apply exige --max-updates.');
  if (apply && Boolean(options['--run-dir']) === Boolean(options['--resume'])) {
    throw new Error('--apply exige exactamente uno de --run-dir o --resume.');
  }
  if (!apply && !reconcileOnly && ['--confirm-tenant', '--max-updates', '--run-dir', '--resume'].some(k => has(options, k))) {
    throw new Error('Opciones de escritura no permitidas en dry-run.');
  }
  if (reconcileOnly && ['--confirm-tenant', '--max-updates', '--page-size', '--max-pages',
    '--conflict-retries', '--after-ventas', '--after-pedidos'].some(k => has(options, k))) {
    throw new Error('--reconcile-only solo admite ámbito y --resume.');
  }
  if (apply && (options['--after-ventas'] || options['--after-pedidos'])) {
    throw new Error('Los cursores manuales son exclusivos del dry-run; apply solo reanuda su checkpoint.');
  }
  return {
    project: PROJECT, database: DATABASE, tenant, confirmTenant: options['--confirm-tenant'] || null,
    apply, reconcileOnly,
    pageSize: integer(options['--page-size'] || 100, '--page-size', 1, 500),
    maxUpdates: apply ? integer(options['--max-updates'], '--max-updates') : reconcileOnly ? null : 0,
    maxPages: options['--max-pages'] ? integer(options['--max-pages'], '--max-pages') : null,
    conflictRetries: integer(options['--conflict-retries'] || 2, '--conflict-retries', 0, 5),
    runDir: apply || reconcileOnly ? path.resolve(options['--resume'] || options['--run-dir']) : null,
    resume: Boolean(options['--resume']),
    after: Object.fromEntries(COLLECTIONS.map(c => [c,
      options[`--after-${c}`] ? documentId(options[`--after-${c}`]) : null])),
  };
}

function emptyInventoryCounts() {
  return {
    ventasExaminadas: 0, ventasCandidatas: 0,
    pedidosExaminados: 0, pedidosCandidatos: 0,
    fuentesInvalidas: 0, derivadosTipoInesperado: 0, errores: 0,
  };
}

function inventoryClassification(collection, data) {
  if (!has(FIELDS, collection)) throw new Error('Colección no autorizada.');
  const { source, target } = FIELDS[collection];
  if (has(data, target) && typeof data[target] !== 'string') return 'invalidTarget';
  if (typeof data[source] !== 'string' || !data[source].trim()) return 'invalidSource';
  if (has(data, target) && data[target].trim()) return 'existing';
  return 'candidate';
}

function tenantName(data) {
  for (const field of ['nombreVisible', 'nombre', 'nombreCliente']) {
    if (typeof data[field] === 'string' && data[field].trim()) return data[field];
  }
  return null;
}

function registeredTenant(snapshot) {
  documentId(snapshot.id);
  const data = snapshot.data || {};
  const identityMismatch = has(data, 'clienteId') && data.clienteId !== snapshot.id;
  const estado = has(data, 'estado') ? data.estado : null;
  const estadoSuscripcion = has(data, 'estadoSuscripcion') ? data.estadoSuscripcion : null;
  return {
    clienteId: snapshot.id,
    nombre: tenantName(data),
    estado,
    estadoSuscripcion,
    elegibleParaApplyPosterior: estado === 'activo' && estadoSuscripcion !== 'cancelado' && !identityMismatch,
    anomaliaIdentidad: identityMismatch,
    clienteIdInterno: has(data, 'clienteId') ? data.clienteId : null,
    ...emptyInventoryCounts(),
  };
}

function invalidTenantIdReason(data) {
  if (!has(data, 'clienteId')) return 'missing';
  if (typeof data.clienteId !== 'string') return 'unexpected-type';
  if (!data.clienteId.trim()) return 'empty';
  return null;
}

async function runInventory(config, adapter, { log = console.log, now = () => new Date() } = {}) {
  if (config.project !== PROJECT || config.database !== DATABASE || config.inventoryGlobal !== true ||
      config.apply || config.reconcileOnly || config.runDir !== null) {
    throw new Error('Ámbito de inventario no autorizado.');
  }
  integer(config.pageSize, 'pageSize', 1, 500);
  const startedAt = now().toISOString();
  const tenants = new Map();
  const orphans = new Map();
  const invalidTenantIds = { missing: 0, empty: 0, unexpectedType: 0 };
  const complete = { clientesSaas: false, ventas: false, pedidos: false };
  const errors = [];
  const totals = {
    ventasExaminadas: 0, ventasCandidatas: 0,
    pedidosExaminados: 0, pedidosCandidatos: 0,
    documentosHuerfanos: 0, documentosClienteIdInvalido: 0,
    fuentesInvalidas: 0, derivadosTipoInesperado: 0,
  };

  async function paginate(label, readPage, consume) {
    let cursor = null;
    try {
      while (true) {
        const docs = await readPage(cursor, config.pageSize);
        if (!Array.isArray(docs) || docs.length > config.pageSize) {
          throw new Error('Página fuera del límite autorizado.');
        }
        for (const snapshot of docs) {
          documentId(snapshot.id);
          consume(snapshot);
          cursor = snapshot.id;
        }
        log(`Inventario ${label}: página examinada; documentos=${docs.length}; cursor=${cursor || '-'}.`);
        if (docs.length < config.pageSize) {
          complete[label] = true;
          break;
        }
      }
    } catch (error) {
      errors.push({ collection: label === 'clientesSaas' ? 'clientes-saas' : label,
        cursor, message: String(error.message || error) });
      log(`ERROR inventario ${label}: ${error.message || error}`);
    }
  }

  await paginate('clientesSaas', (cursor, size) => adapter.pageTenants(cursor, size), snapshot => {
    const tenant = registeredTenant(snapshot);
    if (tenants.has(tenant.clienteId)) throw new Error(`Tenant duplicado: ${tenant.clienteId}.`);
    tenants.set(tenant.clienteId, tenant);
  });

  for (const collection of COLLECTIONS) {
    await paginate(collection, (cursor, size) => adapter.pageCollection(collection, cursor, size), snapshot => {
      const data = snapshot.data || {};
      const examinedKey = collection === 'ventas' ? 'ventasExaminadas' : 'pedidosExaminados';
      const candidatesKey = collection === 'ventas' ? 'ventasCandidatas' : 'pedidosCandidatos';
      totals[examinedKey]++;
      const invalidReason = invalidTenantIdReason(data);
      let bucket = null;
      if (invalidReason) {
        totals.documentosClienteIdInvalido++;
        invalidTenantIds[invalidReason === 'unexpected-type' ? 'unexpectedType' : invalidReason]++;
      } else if (tenants.has(data.clienteId)) {
        bucket = tenants.get(data.clienteId);
      } else {
        totals.documentosHuerfanos++;
        if (!orphans.has(data.clienteId)) {
          orphans.set(data.clienteId, { clienteId: data.clienteId, ...emptyInventoryCounts() });
        }
        bucket = orphans.get(data.clienteId);
      }
      if (bucket) bucket[examinedKey]++;
      const classification = inventoryClassification(collection, data);
      if (classification === 'candidate') {
        totals[candidatesKey]++;
        if (bucket) bucket[candidatesKey]++;
      } else if (classification === 'invalidSource') {
        totals.fuentesInvalidas++;
        if (bucket) bucket.fuentesInvalidas++;
      } else if (classification === 'invalidTarget') {
        totals.derivadosTipoInesperado++;
        if (bucket) bucket.derivadosTipoInesperado++;
      }
    });
  }

  const tenantRows = [...tenants.values()].sort((a, b) => a.clienteId.localeCompare(b.clienteId));
  const orphanRows = [...orphans.values()].sort((a, b) => a.clienteId.localeCompare(b.clienteId));
  const inactiveStates = new Set(['suspendido', 'inactivo', 'bloqueado']);
  const eligibleActiveCandidates = tenantRows.filter(t => t.elegibleParaApplyPosterior &&
    t.ventasCandidatas + t.pedidosCandidatos > 0);
  const inactiveCandidates = tenantRows.filter(t => inactiveStates.has(t.estado) &&
    t.ventasCandidatas + t.pedidosCandidatos > 0);
  const global = {
    tenantsRegistrados: tenantRows.length,
    tenantsActivos: tenantRows.filter(t => t.estado === 'activo').length,
    tenantsSuspendidosInactivos: tenantRows.filter(t => inactiveStates.has(t.estado)).length,
    tenantsEstadoDesconocido: tenantRows.filter(t => t.estado !== 'activo' && !inactiveStates.has(t.estado)).length,
    tenantsElegibles: tenantRows.filter(t => t.elegibleParaApplyPosterior).length,
    tenantsConCandidatos: tenantRows.filter(t => t.ventasCandidatas + t.pedidosCandidatos > 0).length,
    tenantsActivosConCandidatos: eligibleActiveCandidates.length,
    tenantsSuspendidosInactivosConCandidatos: inactiveCandidates.length,
    ventasCandidatasTenantsActivos: eligibleActiveCandidates.reduce((n, t) => n + t.ventasCandidatas, 0),
    pedidosCandidatosTenantsActivos: eligibleActiveCandidates.reduce((n, t) => n + t.pedidosCandidatos, 0),
    ventasCandidatasTenantsSuspendidosInactivos: inactiveCandidates.reduce((n, t) => n + t.ventasCandidatas, 0),
    pedidosCandidatosTenantsSuspendidosInactivos: inactiveCandidates.reduce((n, t) => n + t.pedidosCandidatos, 0),
    ...totals,
    errores: errors.length,
  };
  const finishedAt = now().toISOString();
  return {
    project: PROJECT, database: DATABASE, mode: 'INVENTORY-GLOBAL',
    startedAt, finishedAt, complete, definitive: Object.values(complete).every(Boolean),
    warning: 'Recorrido paginado de solo lectura; no es una snapshot transaccional global.',
    tenants: tenantRows,
    activeTenantsWithCandidates: eligibleActiveCandidates.sort((a, b) =>
      (b.ventasCandidatas + b.pedidosCandidatos) - (a.ventasCandidatas + a.pedidosCandidatos) ||
      a.clienteId.localeCompare(b.clienteId)),
    orphans: orphanRows, invalidTenantIds, global, errors,
  };
}

function classify(collection, data, tenant = TENANT) {
  if (!has(FIELDS, collection)) throw new Error('Colección no autorizada.');
  documentId(tenant);
  if (data.clienteId !== tenant) throw new Error('Inconsistencia de tenant: ejecución detenida.');
  const { source, target } = FIELDS[collection];
  if (has(data, target) && typeof data[target] !== 'string') return { reason: 'invalidTarget' };
  if (typeof data[source] !== 'string' || !data[source].trim()) return { reason: 'invalidSource' };
  if (has(data, target) && data[target].trim()) return { reason: 'existing' };
  return { reason: 'candidate', field: target, value: data[source].trim().toLowerCase(),
    before: { exists: has(data, target), ...(has(data, target) ? { value: data[target] } : {}) } };
}

function initialState(config) {
  return {
    version: VERSION, runId: crypto.randomUUID(), project: PROJECT, database: DATABASE,
    tenant: config.tenant, maxUpdates: config.maxUpdates, reserved: 0, pending: null,
    cursors: { ...config.after }, completed: { ventas: false, pedidos: false },
    counts: Object.fromEntries(COLLECTIONS.map(c => [c, {
      examined: 0, candidates: 0, existing: 0, invalidSource: 0, invalidTarget: 0,
      deleted: 0, updated: 0, uncertain: 0, conflicts: 0,
    }])),
  };
}

function validateState(state, config) {
  if (state.version !== VERSION || state.project !== PROJECT || state.database !== DATABASE ||
      state.tenant !== config.tenant || state.maxUpdates !== config.maxUpdates || typeof state.runId !== 'string') {
    throw new Error('Checkpoint incompatible: proyecto, base, tenant, versión o límite.');
  }
  integer(state.reserved, 'reserved', 0, config.maxUpdates);
  for (const c of COLLECTIONS) {
    if (state.cursors[c] !== null) documentId(state.cursors[c]);
    if (typeof state.completed[c] !== 'boolean') throw new Error('Checkpoint inválido.');
    for (const k of Object.keys(initialState(config).counts[c])) integer(state.counts[c][k], k, 0);
  }
  if (state.pending) {
    if (!has(FIELDS, state.pending.collection) || state.reserved < 1) throw new Error('Operación pendiente inválida.');
    documentId(state.pending.id);
    if (typeof state.pending.value !== 'string' || !state.pending.value ||
        typeof state.pending.attemptId !== 'string') throw new Error('Operación pendiente inválida.');
  }
  const accounted = COLLECTIONS.reduce((n, c) => n + state.counts[c].updated + state.counts[c].uncertain, 0)
    + (state.pending ? 1 : 0);
  if (accounted !== state.reserved) throw new Error('Checkpoint inconsistente: reservas y resultados no coinciden.');
  return state;
}

function durableWrite(file, content, flag) {
  const fd = fs.openSync(file, flag, 0o600);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function openStore(config) {
  // Exclusivo de apply/reconcile-only. Dry-run nunca llama a esta función.
  const dir = config.runDir;
  if ((!config.apply && !config.reconcileOnly) || !dir) {
    throw new Error('Registro local exclusivo de apply/reconcile-only.');
  }
  if (config.resume) {
    if (!fs.statSync(dir).isDirectory()) throw new Error('Directorio de reanudación inválido.');
  } else {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.mkdirSync(dir); // No reutilizar ni sobrescribir una ejecución existente.
  }
  const lock = path.join(dir, 'run.lock');
  durableWrite(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'wx');
  const stateFile = path.join(dir, 'checkpoint.json');
  const eventFile = path.join(dir, 'journal.jsonl');
  const store = {
    save(state) {
      const temp = path.join(dir, 'checkpoint.tmp');
      durableWrite(temp, JSON.stringify(state, null, 2), 'w');
      fs.renameSync(temp, stateFile);
    },
    event(event) {
      durableWrite(eventFile, JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n', 'a');
    },
    close() { fs.unlinkSync(lock); },
  };
  try {
    if (config.resume) {
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const validationConfig = config.reconcileOnly ? { ...config, maxUpdates: saved.maxUpdates } : config;
      store.state = validateState(saved, validationConfig);
    } else store.state = initialState(config);
    if (!config.resume) store.save(store.state);
    return store;
  } catch (error) { store.close(); throw error; }
}

function updateTimeParts(time, label = 'Snapshot.updateTime') {
  if (!time || !Number.isSafeInteger(time.seconds) || !Number.isInteger(time.nanoseconds) ||
      time.nanoseconds < 0 || time.nanoseconds > 999999999) {
    throw new Error(`${label} inválido: no se puede continuar con seguridad.`);
  }
  return { seconds: time.seconds, nanoseconds: time.nanoseconds };
}

function preconditionFailure(error) {
  return [5, 9, 'not-found', 'failed-precondition'].includes(error.code);
}

async function applyDocument(adapter, config, state, store, collection, snapshot, log) {
  let current = snapshot;
  for (let retry = 0; retry <= config.conflictRetries; retry++) {
    if (!current) return { reason: 'deleted' };
    const candidate = classify(collection, current.data, config.tenant);
    if (candidate.reason !== 'candidate') return candidate;
    if (state.reserved >= config.maxUpdates) return { reason: 'limit' };
    const version = updateTimeParts(current.updateTime);
    state.pending = { collection, id: current.id, value: candidate.value,
      before: candidate.before, beforeUpdateTime: version, attemptId: crypto.randomUUID() };
    state.reserved++;
    store.event({ type: 'prepared', ...state.pending });
    store.save(state); // Durable ANTES de enviar la escritura.
    let result;
    try {
      result = await adapter.update(collection, current.id, candidate.field, candidate.value, current.updateTime);
    } catch (error) {
      if (!preconditionFailure(error)) {
        // Resultado desconocido: conservar reserva y pending. No reintentar automáticamente.
        store.event({ type: 'uncertain', attemptId: state.pending.attemptId, code: String(error.code || 'unknown') });
        log(`Resultado incierto: ${collection}/${current.id}. La escritura pudo aplicarse; se conserva la reserva y se detiene la ejecución.`);
        throw error;
      }
      store.event({ type: 'conflict', attemptId: state.pending.attemptId, code: String(error.code) });
      // El SDK puede haber reintentado internamente tras perder una respuesta.
      // Un FAILED_PRECONDITION final no demuestra que el primer envío no escribió.
      // Conservar el cupo de cada llamada enviada, incluso ante un conflicto.
      state.counts[collection].uncertain++;
      state.pending = null;
      state.counts[collection].conflicts++;
      store.save(state);
      if (retry === config.conflictRetries) throw new Error(`Conflicto persistente en ${collection}/${current.id}. Reanudar después.`);
      current = await adapter.read(collection, current.id);
      log(`Conflicto: ${collection}/${snapshot.id}; relectura ${retry + 1}.`);
      continue;
    }
    store.event({ type: 'applied', ...state.pending,
      afterWriteTime: updateTimeParts(result.writeTime, 'WriteResult.writeTime') });
    state.pending = null;
    return { reason: 'updated' };
  }
}

async function reconcilePending(adapter, config, state, store, log) {
  if (!state.pending) return;
  const pending = state.pending;
  const current = await adapter.read(pending.collection, pending.id);
  const classification = current ? classify(pending.collection, current.data, config.tenant) : { reason: 'deleted' };
  // No se puede demostrar autoría solo porque coincida el valor actual.
  // Consumir la reserva conservadoramente, no contar éxito confirmado ni revertir.
  store.event({ type: 'reconciled-uncertain', attemptId: pending.attemptId,
    collection: pending.collection, id: pending.id, currentReason: classification.reason });
  state.counts[pending.collection].uncertain++;
  state.pending = null;
  store.save(state);
  log(`Resultado anterior incierto: ${pending.collection}/${pending.id}. Reserva conservada; se reexaminará sin sobrescribir valores existentes.`);
}

function inspectPending(pending, current, config) {
  if (!pending || !has(FIELDS, pending.collection)) throw new Error('Operación pending inválida.');
  if (!current) return { status: 'deleted', reconciled: true };
  const { source, target } = FIELDS[pending.collection];
  if (current.data.clienteId !== config.tenant) {
    return { status: 'tenant-mismatch', reconciled: false };
  }
  if (typeof current.data[source] !== 'string' || !current.data[source].trim()) {
    return { status: 'invalid-source', reconciled: false };
  }
  const currentExpected = current.data[source].trim().toLowerCase();
  if (currentExpected !== pending.value) {
    return { status: 'source-changed', reconciled: false };
  }
  if (has(current.data, target) && typeof current.data[target] !== 'string') {
    return { status: 'invalid-target', reconciled: false };
  }
  if (!has(current.data, target) || !current.data[target].trim()) {
    return { status: 'still-absent', reconciled: true, updateTime: current.updateTime };
  }
  return current.data[target] === pending.value
    ? { status: 'expected-value', reconciled: true, updateTime: current.updateTime }
    : { status: 'different-value', reconciled: true, updateTime: current.updateTime };
}

async function reconcileOnly(config, adapter, { store, log = console.log } = {}) {
  if (!config.reconcileOnly || config.apply || !store) throw new Error('Modo reconcile-only inválido.');
  if (config.project !== PROJECT || config.database !== DATABASE) {
    throw new Error('Ámbito no autorizado.');
  }
  documentId(config.tenant);
  const state = validateState(store.state, { ...config, maxUpdates: store.state.maxUpdates });
  if (!state.pending) {
    return { project: PROJECT, database: DATABASE, tenant: config.tenant, mode: 'RECONCILE-ONLY',
      status: 'no-pending', reconciled: false, collection: null, id: null,
      reserved: state.reserved, pending: false };
  }
  const pending = state.pending;
  const reservedBefore = state.reserved;
  const cursorsBefore = clone(state.cursors);
  const current = await adapter.read(pending.collection, pending.id);
  const observation = inspectPending(pending, current, config);
  if (observation.updateTime) {
    observation.observedUpdateTime = updateTimeParts(observation.updateTime);
    delete observation.updateTime;
  }
  if (observation.reconciled) {
    store.event({ type: 'reconcile-only', attemptId: pending.attemptId,
      collection: pending.collection, id: pending.id, status: observation.status,
      ...(observation.observedUpdateTime ? { observedUpdateTime: observation.observedUpdateTime } : {}) });
    state.counts[pending.collection].uncertain++;
    state.pending = null;
    store.save(state);
  }
  if (state.reserved !== reservedBefore || JSON.stringify(state.cursors) !== JSON.stringify(cursorsBefore)) {
    throw new Error('La reconciliación intentó alterar reservas o cursores.');
  }
  log(`Reconciliación ${observation.status}: ${pending.collection}/${pending.id}.`);
  return { project: PROJECT, database: DATABASE, tenant: config.tenant, mode: 'RECONCILE-ONLY',
    status: observation.status, reconciled: observation.reconciled,
    collection: pending.collection, id: pending.id, reserved: state.reserved,
    pending: Boolean(state.pending) };
}

function printReconcileReport(result, log = console.log) {
  const descriptions = {
    'no-pending': 'El checkpoint no contiene una operación pending.',
    'expected-value': 'El derivado existe con el valor esperado.',
    'different-value': 'El derivado existe con otro valor.',
    'still-absent': 'El derivado sigue ausente o vacío.',
    deleted: 'El documento ya no existe.',
    'tenant-mismatch': 'Anomalía: el documento pertenece a otro tenant.',
    'invalid-source': 'Anomalía: el campo fuente falta o es inválido.',
    'source-changed': 'Conflicto: la fuente actual deriva un valor diferente.',
    'invalid-target': 'Anomalía: el campo derivado tiene un tipo inesperado.',
  };
  log(`Proyecto: ${result.project}\nBase: ${result.database}\nTenant: ${result.tenant}\nModo: ${result.mode}`);
  log(`Resultado: ${descriptions[result.status] || result.status}`);
  log(`Checkpoint reconciliado: ${result.reconciled ? 'sí' : 'no'}\nPending actual: ${result.pending ? 'sí' : 'no'}\nReservas consumidas: ${result.reserved}`);
  if (result.collection) log(`Documento: ${result.collection}/${result.id}`);
  log('Escrituras en Firestore: 0\nCursores avanzados: no\nContinuación automática: no');
}

function report(config, state, errors, complete, stopReason, pages) {
  return { project: PROJECT, database: DATABASE, tenant: config.tenant,
    mode: config.apply ? 'APPLY' : 'DRY-RUN', counts: clone(state.counts), errors,
    writes: COLLECTIONS.reduce((n, c) => n + state.counts[c].updated, 0),
    reserved: state.reserved, pending: Boolean(state.pending), complete, stopReason, pages, cursors: { ...state.cursors },
    partialStart: COLLECTIONS.some(c => config.after[c] !== null) };
}

async function validateTenantEligibility(tenant, adapter) {
  documentId(tenant);
  if (!adapter || typeof adapter.readTenant !== 'function') {
    throw new Error('La validación exige lectura canónica del tenant.');
  }
  const snapshot = await adapter.readTenant(tenant);
  if (!snapshot) throw new Error(`Tenant inexistente: ${tenant}.`);
  if (snapshot.id !== tenant) throw new Error('El document ID del tenant no coincide exactamente.');
  const data = snapshot.data || {};
  if (has(data, 'clienteId') && data.clienteId !== snapshot.id) {
    throw new Error('Anomalía de identidad en clientes-saas.');
  }
  if (data.estado !== 'activo') {
    throw new Error(`Tenant no activo: estado=${has(data, 'estado') ? JSON.stringify(data.estado) : 'ausente'}.`);
  }
  if (data.estadoSuscripcion === 'cancelado') {
    throw new Error('Tenant con suscripción cancelada.');
  }
  return { id: snapshot.id, estado: data.estado, estadoSuscripcion: data.estadoSuscripcion || null };
}

async function validateApplyTenant(config, adapter) {
  if (!config.apply) throw new Error('Validación administrativa exclusiva de apply.');
  documentId(config.tenant);
  if (config.confirmTenant !== config.tenant) {
    throw new Error('Confirmación de tenant inconsistente.');
  }
  return validateTenantEligibility(config.tenant, adapter);
}

async function run(config, adapter, { store = null, log = console.log, shouldStop = () => false } = {}) {
  // Defensa adicional para consumidores programáticos; validar ANTES de consultar.
  if (config.project !== PROJECT || config.database !== DATABASE) throw new Error('Ámbito no autorizado.');
  documentId(config.tenant);
  integer(config.pageSize, 'pageSize', 1, 500);
  if (config.apply) {
    integer(config.maxUpdates, 'maxUpdates');
    integer(config.conflictRetries, 'conflictRetries', 0, 5);
  }
  if (config.apply && !store) throw new Error('Apply requiere registro durable.');
  if (config.apply) await validateApplyTenant(config, adapter);
  const state = config.apply ? validateState(store.state, config) : initialState(config);
  let pages = 0, stopReason = '', errors = 0;
  try {
    if (config.apply) await reconcilePending(adapter, config, state, store, log);
    outer: for (const collection of COLLECTIONS) {
      if (state.completed[collection]) continue;
      while (true) {
        if (shouldStop()) { stopReason = 'interrumpido'; break outer; }
        if (config.maxPages && pages >= config.maxPages) { stopReason = 'max-pages'; break outer; }
        if (config.apply && state.reserved >= config.maxUpdates) { stopReason = 'max-updates'; break outer; }
        const docs = await adapter.page(collection, config.tenant, state.cursors[collection], config.pageSize);
        pages++;
        if (docs.length > config.pageSize) throw new Error('Página fuera del límite autorizado.');
        for (const snapshot of docs) {
          if (shouldStop()) { stopReason = 'interrumpido'; break outer; }
          documentId(snapshot.id);
          const candidate = classify(collection, snapshot.data, config.tenant);
          const outcome = config.apply && candidate.reason === 'candidate'
            ? await applyDocument(adapter, config, state, store, collection, snapshot, log) : candidate;
          if (outcome.reason === 'limit') { stopReason = 'max-updates'; break outer; }
          const counts = state.counts[collection];
          counts.examined++;
          if (candidate.reason === 'candidate') counts.candidates++;
          if (has(counts, outcome.reason)) counts[outcome.reason]++;
          state.cursors[collection] = snapshot.id;
          if (config.apply) {
            store.event({ type: 'examined', collection, id: snapshot.id, outcome: outcome.reason });
            store.save(state);
          }
          if (outcome.reason === 'invalidSource' || outcome.reason === 'invalidTarget') {
            log(`Anomalía: ${collection}/${snapshot.id}: ${outcome.reason}. Omitido.`);
          }
        }
        log(`Página ${pages}: ${collection}; examinados=${state.counts[collection].examined}; candidatos=${state.counts[collection].candidates}; cursor=${state.cursors[collection] || '-'}`);
        if (docs.length < config.pageSize) {
          state.completed[collection] = true;
          if (config.apply) store.save(state);
          break;
        }
      }
    }
  } catch (error) {
    errors++;
    stopReason = `error: ${error.code || error.message}`;
    log(`ERROR: ${error.message}`);
  }
  return report(config, state, errors, COLLECTIONS.every(c => state.completed[c]), stopReason, pages);
}

function createAdapter(db, FieldPath) {
  const checkCollection = c => { if (!has(FIELDS, c)) throw new Error('Colección no autorizada.'); };
  const convert = snap => snap.exists ? { id: snap.id, data: snap.data(), updateTime: snap.updateTime } : null;
  return {
    async page(collection, tenant, cursor, size) {
      checkCollection(collection);
      documentId(tenant);
      integer(size, 'page-size', 1, 500);
      const fields = FIELDS[collection];
      let query = db.collection(collection).where('clienteId', '==', tenant)
        .orderBy(FieldPath.documentId()).select('clienteId', fields.source, fields.target).limit(size);
      if (cursor !== null) query = query.startAfter(documentId(cursor));
      return (await query.get()).docs.map(convert);
    },
    async read(collection, id) {
      checkCollection(collection);
      return convert(await db.collection(collection).doc(documentId(id)).get());
    },
    async readTenant(tenant) {
      const snap = await db.collection('clientes-saas').doc(documentId(tenant)).get();
      return snap.exists ? { id: snap.id, data: snap.data() } : null;
    },
    async update(collection, id, field, value, updateTime) {
      checkCollection(collection);
      if (field !== FIELDS[collection].target || typeof value !== 'string' || !value) throw new Error('Campo/valor no autorizado.');
      updateTimeParts(updateTime);
      return db.collection(collection).doc(documentId(id)).update({ [field]: value }, { lastUpdateTime: updateTime });
    },
  };
}

function createReadAdapter(db) {
  return {
    async read(collection, id) {
      if (!has(FIELDS, collection)) throw new Error('Colección no autorizada.');
      const snap = await db.collection(collection).doc(documentId(id)).get();
      return snap.exists ? { id: snap.id, data: snap.data(), updateTime: snap.updateTime } : null;
    },
  };
}

function createInventoryAdapter(db, FieldPath) {
  const convert = snap => ({ id: snap.id, data: snap.data() });
  const paged = async (collection, fields, cursor, size) => {
    integer(size, 'page-size', 1, 500);
    let query = db.collection(collection).orderBy(FieldPath.documentId()).select(...fields).limit(size);
    if (cursor !== null) query = query.startAfter(documentId(cursor));
    return (await query.get()).docs.map(convert);
  };
  return {
    pageTenants(cursor, size) {
      return paged('clientes-saas', ['clienteId', 'nombreVisible', 'nombre', 'nombreCliente',
        'estado', 'estadoSuscripcion'], cursor, size);
    },
    pageCollection(collection, cursor, size) {
      if (!has(FIELDS, collection)) return Promise.reject(new Error('Colección no autorizada.'));
      const fields = FIELDS[collection];
      return paged(collection, ['clienteId', fields.source, fields.target], cursor, size);
    },
  };
}

function printInventoryReport(result, log = console.log) {
  log(`Proyecto: ${result.project}\nBase: ${result.database}\nModo: ${result.mode}`);
  log(`Hora de inicio: ${result.startedAt}\nHora de finalización: ${result.finishedAt}`);
  log(`Advertencia: ${result.warning}`);
  for (const tenant of result.tenants) {
    log(`Tenant: ${tenant.clienteId}\nNombre: ${tenant.nombre === null ? '(sin nombre)' : tenant.nombre}\nEstado: ${tenant.estado === null ? '(ausente)' : String(tenant.estado)}\nEstado de suscripción: ${tenant.estadoSuscripcion === null ? '(ausente)' : String(tenant.estadoSuscripcion)}\nElegible para apply posterior: ${tenant.elegibleParaApplyPosterior ? 'sí' : 'no'}\nVentas examinadas: ${tenant.ventasExaminadas}\nVentas candidatas: ${tenant.ventasCandidatas}\nPedidos examinados: ${tenant.pedidosExaminados}\nPedidos candidatos: ${tenant.pedidosCandidatos}\nFuentes inválidas: ${tenant.fuentesInvalidas}\nDerivados con tipo inesperado: ${tenant.derivadosTipoInesperado}\nErrores: ${tenant.errores}${tenant.anomaliaIdentidad ? `\nAnomalía de identidad: clienteId interno=${JSON.stringify(tenant.clienteIdInterno)}; document ID=${tenant.clienteId}` : ''}`);
  }
  for (const orphan of result.orphans) {
    log(`Tenant huérfano: ${orphan.clienteId}\nVentas examinadas: ${orphan.ventasExaminadas}\nVentas candidatas: ${orphan.ventasCandidatas}\nPedidos examinados: ${orphan.pedidosExaminados}\nPedidos candidatos: ${orphan.pedidosCandidatos}\nFuentes inválidas: ${orphan.fuentesInvalidas}\nDerivados con tipo inesperado: ${orphan.derivadosTipoInesperado}\nErrores: ${orphan.errores}`);
  }
  const g = result.global;
  log(`Resumen global:\nTenants registrados: ${g.tenantsRegistrados}\nTenants activos: ${g.tenantsActivos}\nTenants suspendidos/inactivos: ${g.tenantsSuspendidosInactivos}\nTenants con estado desconocido: ${g.tenantsEstadoDesconocido}\nTenants elegibles para eventual apply: ${g.tenantsElegibles}\nTenants con candidatos: ${g.tenantsConCandidatos}\nTenants activos con candidatos: ${g.tenantsActivosConCandidatos}\nTenants suspendidos/inactivos con candidatos: ${g.tenantsSuspendidosInactivosConCandidatos}\nTotal ventas examinadas: ${g.ventasExaminadas}\nTotal ventas candidatas: ${g.ventasCandidatas}\nTotal pedidos examinados: ${g.pedidosExaminados}\nTotal pedidos candidatos: ${g.pedidosCandidatos}\nVentas candidatas de tenants activos: ${g.ventasCandidatasTenantsActivos}\nPedidos candidatos de tenants activos: ${g.pedidosCandidatosTenantsActivos}\nVentas candidatas de tenants suspendidos/inactivos: ${g.ventasCandidatasTenantsSuspendidosInactivos}\nPedidos candidatos de tenants suspendidos/inactivos: ${g.pedidosCandidatosTenantsSuspendidosInactivos}\nDocumentos huérfanos: ${g.documentosHuerfanos}\nDocumentos con clienteId inválido: ${g.documentosClienteIdInvalido}\n- clienteId faltante: ${result.invalidTenantIds.missing}\n- clienteId vacío: ${result.invalidTenantIds.empty}\n- clienteId con tipo inesperado: ${result.invalidTenantIds.unexpectedType}\nFuentes inválidas: ${g.fuentesInvalidas}\nDerivados con tipo inesperado: ${g.derivadosTipoInesperado}\nErrores: ${g.errores}\nRecorrido completo de clientes-saas: ${result.complete.clientesSaas ? 'sí' : 'no'}\nRecorrido completo de ventas: ${result.complete.ventas ? 'sí' : 'no'}\nRecorrido completo de pedidos: ${result.complete.pedidos ? 'sí' : 'no'}\nTotales definitivos: ${result.definitive ? 'sí' : 'no'}`);
  for (const error of result.errors) {
    log(`Error técnico: colección=${error.collection}; cursor=${error.cursor || '-'}; detalle=${error.message}`);
  }
  log('Escrituras en Firestore: 0\nCheckpoints/journals/run-dir: 0\nReservas/pending: 0');
  log('TENANTS ACTIVOS CON CANDIDATOS');
  log('clienteId | nombre | ventas candidatas | pedidos candidatos');
  if (!result.activeTenantsWithCandidates.length) log('(ninguno)');
  for (const tenant of result.activeTenantsWithCandidates) {
    const cell = value => String(value === null ? '' : value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
    log(`${cell(tenant.clienteId)} | ${cell(tenant.nombre)} | ${tenant.ventasCandidatas} | ${tenant.pedidosCandidatos}`);
  }
}

function printReport(result, log = console.log) {
  const sum = key => COLLECTIONS.reduce((n, c) => n + result.counts[c][key], 0);
  log(`Proyecto: ${result.project}\nBase: ${result.database}\nTenant: ${result.tenant}\nModo: ${result.mode}`);
  log(`Ventas examinadas: ${result.counts.ventas.examined}\nVentas candidatas: ${result.counts.ventas.candidates}`);
  log(`Pedidos examinados: ${result.counts.pedidos.examined}\nPedidos candidatos: ${result.counts.pedidos.candidates}`);
  log(`Omitidos por derivado existente: ${sum('existing')}\nOmitidos por fuente inválida: ${sum('invalidSource')}\nOmitidos por tipo inesperado: ${sum('invalidTarget')}`);
  log(`Errores: ${result.errors}\nEscrituras realizadas: ${result.writes}${result.mode === 'APPLY' ? ' (confirmadas)' : ''}\nOperación preparada pendiente de reconciliación: ${result.pending ? 'sí' : 'no'}\nIntentos sin éxito confirmable: ${sum('uncertain')}\nReservas consumidas: ${result.reserved}`);
  log(`Recorrido completo: ${result.complete && !result.partialStart ? 'sí' : 'no'}${result.partialStart ? ' (inicio con cursor manual)' : ''}\nMotivo de parada: ${result.stopReason || 'fin'}`);
  log(`Cursores: ${JSON.stringify(result.cursors)}`);
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const config = parseArgs(argv); // Ningún SDK/credencial se carga antes de esto.
  if (config.help) {
    console.log('Uso:\nInventario global: node backfill.cjs --project conectarsublimados-7881e --inventory-global [--page-size 100]\nDry-run por tenant: node backfill.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID [--dry-run] [--page-size 100]\nApply exige --tenant CLIENTE_ID --apply --confirm-tenant CLIENTE_ID --max-updates N y --run-dir DIR o --resume DIR.\nReconciliar exige --tenant CLIENTE_ID --reconcile-only --resume DIR. Ver README.md.');
    return 0;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador detectado: este CLI solo admite destino explícito real. Usar tests con adaptador simulado.');
  let store, app, db, stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    let adapter;
    if (dependencies.adapterFactory) adapter = await dependencies.adapterFactory(config);
    else {
      const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
      const { getFirestore, FieldPath } = require('firebase-admin/firestore');
      app = { instance: initializeApp({ projectId: PROJECT, credential: applicationDefault() }), deleteApp };
      db = getFirestore(app.instance, DATABASE);
      adapter = config.inventoryGlobal ? createInventoryAdapter(db, FieldPath)
        : config.reconcileOnly ? createReadAdapter(db) : createAdapter(db, FieldPath);
    }
    if (config.apply) await validateApplyTenant(config, adapter);
    if (config.apply || config.reconcileOnly) store = openStore(config);
    if (config.inventoryGlobal) {
      const result = await runInventory(config, adapter);
      printInventoryReport(result);
      return result.global.errores ? 1 : result.definitive ? 0 : 2;
    } else if (config.reconcileOnly) {
      const result = await reconcileOnly(config, adapter, { store });
      printReconcileReport(result);
      return result.reconciled || result.status === 'no-pending' ? 0 : 2;
    } else {
      const result = await run(config, adapter, { store, shouldStop: () => stopped });
      printReport(result);
      return result.errors ? 1 : result.complete && !result.partialStart ? 0 : 2;
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (store) store.close();
    if (db) await db.terminate();
    if (app) await app.deleteApp(app.instance);
  }
}

module.exports = { PROJECT, DATABASE, TENANT, FIELDS, parseArgs, classify, initialState,
  validateState, openStore, inspectPending, reconcileOnly, printReconcileReport,
  inventoryClassification, registeredTenant, runInventory, printInventoryReport,
  validateTenantEligibility, validateApplyTenant,
  createAdapter, createReadAdapter, createInventoryAdapter, run, printReport, main };
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(`Abortado: ${error.message}`);
  process.exitCode = 1;
});
