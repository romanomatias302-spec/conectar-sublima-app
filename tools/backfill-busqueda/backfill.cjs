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
  const flags = new Set(['--apply', '--dry-run', '--reconcile-only', '--help']);
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
  if (options['--tenant'] !== TENANT) throw new Error('Tenant obligatorio y único autorizado: elgol.');
  if (options['--project'] !== PROJECT) throw new Error(`Proyecto obligatorio y único autorizado: ${PROJECT}.`);
  if ((options['--database'] || DATABASE) !== DATABASE) throw new Error('Solo se permite la base (default).');
  const apply = options['--apply'] === true;
  const reconcileOnly = options['--reconcile-only'] === true;
  if (apply && options['--dry-run']) throw new Error('--apply y --dry-run son incompatibles.');
  if (reconcileOnly && (apply || options['--dry-run'])) {
    throw new Error('--reconcile-only es incompatible con --apply y --dry-run.');
  }
  if (reconcileOnly && (!options['--resume'] || options['--run-dir'])) {
    throw new Error('--reconcile-only exige --resume y no admite --run-dir.');
  }
  if (apply && options['--confirm-tenant'] !== TENANT) throw new Error('--apply exige --confirm-tenant elgol.');
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
    project: PROJECT, database: DATABASE, tenant: TENANT, apply, reconcileOnly,
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

function classify(collection, data, tenant = TENANT) {
  if (!has(FIELDS, collection)) throw new Error('Colección no autorizada.');
  if (tenant !== TENANT || data.clienteId !== tenant) throw new Error('Inconsistencia de tenant: ejecución detenida.');
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
    tenant: TENANT, maxUpdates: config.maxUpdates, reserved: 0, pending: null,
    cursors: { ...config.after }, completed: { ventas: false, pedidos: false },
    counts: Object.fromEntries(COLLECTIONS.map(c => [c, {
      examined: 0, candidates: 0, existing: 0, invalidSource: 0, invalidTarget: 0,
      deleted: 0, updated: 0, uncertain: 0, conflicts: 0,
    }])),
  };
}

function validateState(state, config) {
  if (state.version !== VERSION || state.project !== PROJECT || state.database !== DATABASE ||
      state.tenant !== TENANT || state.maxUpdates !== config.maxUpdates || typeof state.runId !== 'string') {
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
  if (config.project !== PROJECT || config.database !== DATABASE || config.tenant !== TENANT) {
    throw new Error('Ámbito no autorizado.');
  }
  const state = validateState(store.state, { ...config, maxUpdates: store.state.maxUpdates });
  if (!state.pending) {
    return { project: PROJECT, database: DATABASE, tenant: TENANT, mode: 'RECONCILE-ONLY',
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
  return { project: PROJECT, database: DATABASE, tenant: TENANT, mode: 'RECONCILE-ONLY',
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
  return { project: PROJECT, database: DATABASE, tenant: TENANT,
    mode: config.apply ? 'APPLY' : 'DRY-RUN', counts: clone(state.counts), errors,
    writes: COLLECTIONS.reduce((n, c) => n + state.counts[c].updated, 0),
    reserved: state.reserved, pending: Boolean(state.pending), complete, stopReason, pages, cursors: { ...state.cursors },
    partialStart: COLLECTIONS.some(c => config.after[c] !== null) };
}

async function run(config, adapter, { store = null, log = console.log, shouldStop = () => false } = {}) {
  // Defensa adicional para consumidores programáticos; validar ANTES de consultar.
  if (config.project !== PROJECT || config.database !== DATABASE || config.tenant !== TENANT) throw new Error('Ámbito no autorizado.');
  integer(config.pageSize, 'pageSize', 1, 500);
  if (config.apply) {
    integer(config.maxUpdates, 'maxUpdates');
    integer(config.conflictRetries, 'conflictRetries', 0, 5);
  }
  if (config.apply && !store) throw new Error('Apply requiere registro durable.');
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
      if (tenant !== TENANT) throw new Error('Tenant no autorizado.');
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
    console.log('Uso: node backfill.cjs --project conectarsublimados-7881e --tenant elgol [--dry-run] [--page-size 100]\nApply exige --apply --confirm-tenant elgol --max-updates N y --run-dir DIR o --resume DIR.\nReconciliar exige --reconcile-only --resume DIR. Ver README.md.');
    return 0;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador detectado: este CLI solo admite destino explícito real. Usar tests con adaptador simulado.');
  let store, app, db, stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    if (config.apply || config.reconcileOnly) store = openStore(config);
    let adapter;
    if (dependencies.adapterFactory) adapter = await dependencies.adapterFactory(config);
    else {
      const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
      const { getFirestore, FieldPath } = require('firebase-admin/firestore');
      app = { instance: initializeApp({ projectId: PROJECT, credential: applicationDefault() }), deleteApp };
      db = getFirestore(app.instance, DATABASE);
      adapter = config.reconcileOnly ? createReadAdapter(db) : createAdapter(db, FieldPath);
    }
    if (config.reconcileOnly) {
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
  createAdapter, createReadAdapter, run, printReport, main };
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(`Abortado: ${error.message}`);
  process.exitCode = 1;
});
