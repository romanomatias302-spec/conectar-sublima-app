'use strict';

// Importar este módulo no carga Firebase, no resuelve credenciales y no abre red.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  PROJECT, DATABASE, parseArgs: parseBackfillArgs, runInventory, createInventoryAdapter,
  createAdapter, validateTenantEligibility, validateApplyTenant, openStore, run,
} = require('./backfill.cjs');

const VERSION = 1;
const RUNS_ROOT = path.resolve(__dirname, 'runs');
const FINAL_STATUSES = new Set([
  'COMPLETED', 'ALREADY_COMPLETE', 'OMITTED', 'NEEDS_RECONCILIATION', 'NEEDS_REVIEW', 'FAILED',
]);
const SKIP_ON_RESUME = new Set([
  'COMPLETED', 'ALREADY_COMPLETE', 'OMITTED', 'NEEDS_RECONCILIATION', 'NEEDS_REVIEW', 'FAILED',
]);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clone = value => JSON.parse(JSON.stringify(value));

function integer(value, flag, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) ||
      Number(value) < min || Number(value) > max) throw new Error(`${flag}: entero inválido.`);
  return Number(value);
}

function resolveRunRoot(value) {
  if (typeof value !== 'string' || !value) throw new Error('Directorio de orquestación obligatorio.');
  const resolved = path.resolve(value);
  const relative = path.relative(RUNS_ROOT, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`El run-dir debe ser un subdirectorio nuevo de ${RUNS_ROOT}.`);
  }
  return resolved;
}

function parseArgs(argv) {
  const flags = new Set(['--prepare', '--execute', '--help']);
  const values = new Set(['--project', '--database', '--run-dir', '--resume', '--confirm-plan',
    '--page-size', '--max-updates-per-tenant', '--max-updates-total']);
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
  if (options['--project'] !== PROJECT) throw new Error(`Proyecto obligatorio: ${PROJECT}.`);
  if ((options['--database'] || DATABASE) !== DATABASE) throw new Error('Solo se permite la base (default).');
  const prepareMode = options['--prepare'] === true;
  const executeMode = options['--execute'] === true;
  if (prepareMode === executeMode) throw new Error('Elegir exactamente una fase: --prepare o --execute.');
  const pageSize = integer(options['--page-size'] || 100, '--page-size', 1, 500);
  if (prepareMode) {
    const forbidden = ['--resume', '--confirm-plan', '--max-updates-per-tenant', '--max-updates-total'];
    if (!options['--run-dir'] || forbidden.some(key => has(options, key))) {
      throw new Error('--prepare exige --run-dir y no admite opciones de ejecución.');
    }
    return { mode: 'PREPARE', project: PROJECT, database: DATABASE,
      root: resolveRunRoot(options['--run-dir']), pageSize };
  }
  if (options['--run-dir'] || !options['--resume'] || !options['--confirm-plan'] ||
      !options['--max-updates-per-tenant'] || !options['--max-updates-total']) {
    throw new Error('--execute exige --resume, --confirm-plan y ambos límites; no admite --run-dir.');
  }
  if (!/^[a-f0-9]{64}$/.test(options['--confirm-plan'])) throw new Error('--confirm-plan inválido.');
  return { mode: 'EXECUTE', project: PROJECT, database: DATABASE,
    root: resolveRunRoot(options['--resume']), confirmPlan: options['--confirm-plan'], pageSize,
    maxUpdatesPerTenant: integer(options['--max-updates-per-tenant'], '--max-updates-per-tenant'),
    maxUpdatesTotal: integer(options['--max-updates-total'], '--max-updates-total') };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPlan(plan) {
  const content = { ...plan };
  delete content.planHash;
  return crypto.createHash('sha256').update(stableStringify(content)).digest('hex');
}

function tenantDirectory(sequence, clienteId) {
  const digest = crypto.createHash('sha256').update(clienteId).digest('hex').slice(0, 12);
  return `${String(sequence).padStart(4, '0')}-${digest}`;
}

function durableWrite(file, content, flag) {
  const fd = fs.openSync(file, flag, 0o600);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function atomicWriteJson(file, value) {
  const temp = `${file}.tmp`;
  durableWrite(temp, `${JSON.stringify(value, null, 2)}\n`, 'w');
  fs.renameSync(temp, file);
}

function appendEvent(root, event) {
  durableWrite(path.join(root, 'orchestrator-journal.jsonl'),
    `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`, 'a');
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${label} inválido: ${error.message}`); }
}

function acquireGlobalLock(root) {
  const file = path.join(root, 'run.lock');
  durableWrite(file, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, 'wx');
  return { file, close() { fs.unlinkSync(file); } };
}

function candidateCount(result) {
  return Number(result?.counts?.ventas?.candidates || 0) + Number(result?.counts?.pedidos?.candidates || 0);
}

function confirmedWrites(result, collection) {
  return Number(result?.counts?.[collection]?.updated || 0);
}

function uncertainCount(result) {
  return Number(result?.counts?.ventas?.uncertain || 0) + Number(result?.counts?.pedidos?.uncertain || 0);
}

function validDryRun(result) {
  return result && result.errors === 0 && result.complete === true && result.partialStart !== true;
}

function initialState(plan) {
  return {
    version: VERSION, project: PROJECT, database: DATABASE, planHash: plan.planHash,
    startedAt: null, finishedAt: null, globalError: null, lastOutcome: null,
    tenants: plan.tenants.map(tenant => ({
      ...tenant, status: 'PLANNED', stage: 'PLANNED', initialCandidates: null,
      finalCandidates: null, ventasConfirmadas: 0, pedidosConfirmados: 0,
      reserved: 0, uncertain: 0, pending: false, authorizedMaxUpdates: null,
      error: null, errorClass: null,
    })),
  };
}

function validatePlan(plan) {
  if (!plan || plan.project !== PROJECT || plan.database !== DATABASE || plan.inventoryComplete !== true ||
      !Array.isArray(plan.tenants) || plan.cantidadTenants !== plan.tenants.length ||
      plan.planHash !== hashPlan(plan)) throw new Error('Plan/hash incompatible o corrupto.');
  const ids = new Set();
  for (let i = 0; i < plan.tenants.length; i++) {
    const tenant = plan.tenants[i];
    if (tenant.sequence !== i + 1 || typeof tenant.clienteId !== 'string' || !tenant.clienteId ||
        ids.has(tenant.clienteId) || tenant.ventasCandidatas + tenant.pedidosCandidatos <= 0) {
      throw new Error('Plan contiene tenants inválidos o duplicados.');
    }
    ids.add(tenant.clienteId);
  }
  return plan;
}

function validateState(state, plan) {
  if (!state || state.version !== VERSION || state.project !== PROJECT || state.database !== DATABASE ||
      state.planHash !== plan.planHash || !Array.isArray(state.tenants) ||
      state.tenants.length !== plan.tenants.length) throw new Error('Estado global incompatible o corrupto.');
  for (let i = 0; i < state.tenants.length; i++) {
    if (state.tenants[i].clienteId !== plan.tenants[i].clienteId ||
        state.tenants[i].directory !== plan.tenants[i].directory) throw new Error('Estado global mezcla tenants.');
  }
  return state;
}

function buildSummary(state) {
  const rows = state.tenants;
  const completed = rows.filter(row => row.status === 'COMPLETED');
  const already = rows.filter(row => row.status === 'ALREADY_COMPLETE');
  const omitted = rows.filter(row => row.status === 'OMITTED');
  const review = rows.filter(row => ['FAILED', 'NEEDS_REVIEW', 'NEEDS_RECONCILIATION'].includes(row.status));
  return {
    planHash: state.planHash, horaInicio: state.startedAt, horaFin: state.finishedAt,
    completados: completed.map(row => ({ tenant: row.clienteId, nombre: row.nombre,
      candidatosIniciales: row.initialCandidates, escriturasConfirmadas: row.ventasConfirmadas + row.pedidosConfirmados,
      candidatosFinales: row.finalCandidates })),
    yaCompletos: already.map(row => ({ tenant: row.clienteId, nombre: row.nombre })),
    omitidos: omitted.map(row => ({ tenant: row.clienteId, nombre: row.nombre, motivo: row.error })),
    fallidosRevision: review.map(row => ({ tenant: row.clienteId, etapa: row.stage,
      error: row.error, pending: row.pending })),
    resumen: {
      tenantsObjetivo: rows.length, completados: completed.length, yaCompletos: already.length,
      omitidos: omitted.length, fallidos: rows.filter(row => row.status === 'FAILED').length,
      needsReconciliation: rows.filter(row => row.status === 'NEEDS_RECONCILIATION').length,
      needsReview: rows.filter(row => row.status === 'NEEDS_REVIEW').length,
      ventasConfirmadas: rows.reduce((n, row) => n + row.ventasConfirmadas, 0),
      pedidosConfirmados: rows.reduce((n, row) => n + row.pedidosConfirmados, 0),
      reservasConsumidas: rows.reduce((n, row) => n + row.reserved, 0),
      resultadosInciertos: rows.reduce((n, row) => n + row.uncertain, 0),
      pendingAbiertos: rows.filter(row => row.pending).length,
    },
    globalError: state.globalError,
  };
}

function saveState(root, state) {
  atomicWriteJson(path.join(root, 'state.json'), state);
  atomicWriteJson(path.join(root, 'summary.json'), buildSummary(state));
}

function transition(root, state, tenant, status, fields = {}) {
  tenant.status = status;
  tenant.stage = status;
  Object.assign(tenant, fields);
  appendEvent(root, { type: 'tenant-status', sequence: tenant.sequence,
    clienteId: tenant.clienteId, status, ...fields });
  saveState(root, state);
}

function classifyError(error, stage) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || 'error desconocido');
  const text = `${code} ${message}`.toLowerCase();
  if (/tenant inexistente|tenant no activo|suscripci[oó]n cancelada|identidad/.test(text)) {
    return { scope: 'local', className: 'tenant-ineligible', omitted: true, message };
  }
  if (/pending/.test(text)) return { scope: 'local', className: 'pending', message };
  if (/conflicto|lastupdatetime|concurrent|documento eliminado/.test(text)) {
    return { scope: 'local', className: 'concurrency', message };
  }
  if (/checkpoint/.test(text)) return { scope: 'local', className: 'checkpoint', message };
  if (/eexist|run\.lock|lock individual/.test(text)) return { scope: 'local', className: 'tenant-lock', message };
  if (['7', '8', '13', '14', '16', 'permission-denied', 'unauthenticated', 'resource-exhausted',
    'unavailable', 'internal'].includes(code) ||
      /permission|unauthenticated|credential|índice|index required|requires an index|resource exhausted|unavailable|network|dns|socket|fsync|enospc|disco/.test(text)) {
    return { scope: 'global', className: 'infrastructure', message };
  }
  if (stage === 'SIGNAL') return { scope: 'global', className: 'operator-signal', message };
  if (/interrumpido|interrupci[oó]n solicitada/.test(text)) {
    return { scope: 'global', className: 'operator-signal', message };
  }
  return { scope: 'global', className: 'unknown', message };
}

function localFailure(root, state, tenant, status, className, message) {
  transition(root, state, tenant, status, { error: message, errorClass: className });
  const previous = state.lastOutcome;
  const consecutive = previous && previous.sequence === tenant.sequence - 1 &&
    previous.scope === 'local' && previous.className === className;
  state.lastOutcome = { sequence: tenant.sequence, scope: 'local', className };
  if (consecutive) {
    state.globalError = { stage: tenant.stage, className,
      message: `Dos errores locales consecutivos de clase ${className}.` };
    saveState(root, state);
    return true;
  }
  saveState(root, state);
  return false;
}

function globalFailure(root, state, tenant, stage, classification) {
  if (tenant && classification.className === 'operator-signal') {
    if (tenant.status === 'VALIDATING' || tenant.status === 'DRY_RUN') tenant.status = 'PLANNED';
  } else if (tenant && !FINAL_STATUSES.has(tenant.status)) {
    tenant.status = 'FAILED'; tenant.stage = stage; tenant.error = classification.message;
    tenant.errorClass = classification.className;
  }
  state.globalError = { tenant: tenant?.clienteId || null, stage,
    className: classification.className, message: classification.message };
  state.finishedAt = new Date().toISOString();
  appendEvent(root, { type: 'global-error', ...state.globalError });
  saveState(root, state);
}

function tenantLog(root, tenant, message) {
  durableWrite(path.join(root, 'tenants', tenant.directory, 'execution.log'),
    `${new Date().toISOString()} ${message}\n`, 'a');
}

async function prepare(config, { inventory, now = () => new Date() } = {}) {
  if (config.mode !== 'PREPARE' || typeof inventory !== 'function') throw new Error('PREPARE inválido.');
  fs.mkdirSync(RUNS_ROOT, { recursive: true });
  fs.mkdirSync(config.root); // Exclusivo: jamás reutiliza o sobrescribe un plan.
  fs.mkdirSync(path.join(config.root, 'tenants'));
  const result = await inventory(config.pageSize);
  if (!result || result.global?.errores !== 0 || result.definitive !== true ||
      result.complete?.clientesSaas !== true || result.complete?.ventas !== true ||
      result.complete?.pedidos !== true) throw new Error('Inventario incompleto o con errores: no se genera plan.');
  const selected = result.tenants.filter(tenant => tenant.elegibleParaApplyPosterior === true &&
    tenant.estado === 'activo' && tenant.estadoSuscripcion !== 'cancelado' && !tenant.anomaliaIdentidad &&
    tenant.ventasCandidatas + tenant.pedidosCandidatos > 0);
  selected.sort((a, b) => (b.ventasCandidatas + b.pedidosCandidatos) -
    (a.ventasCandidatas + a.pedidosCandidatos) || a.clienteId.localeCompare(b.clienteId));
  const plan = {
    version: VERSION, project: PROJECT, database: DATABASE, createdAt: now().toISOString(),
    inventoryComplete: true, cantidadTenants: selected.length,
    totalCandidatos: selected.reduce((n, tenant) => n + tenant.ventasCandidatas + tenant.pedidosCandidatos, 0),
    tenants: selected.map((tenant, index) => ({
      sequence: index + 1, clienteId: tenant.clienteId, nombre: tenant.nombre,
      ventasCandidatas: tenant.ventasCandidatas, pedidosCandidatos: tenant.pedidosCandidatos,
      directory: tenantDirectory(index + 1, tenant.clienteId),
    })),
  };
  plan.planHash = hashPlan(plan);
  for (const tenant of plan.tenants) {
    const directory = path.join(config.root, 'tenants', tenant.directory);
    fs.mkdirSync(directory);
    atomicWriteJson(path.join(directory, 'tenant.json'), tenant);
  }
  atomicWriteJson(path.join(config.root, 'plan.json'), plan);
  atomicWriteJson(path.join(config.root, 'manifest.json'), {
    version: VERSION, project: PROJECT, database: DATABASE, createdAt: plan.createdAt,
    planHash: plan.planHash, phase: 'PREPARED',
  });
  const state = initialState(plan);
  saveState(config.root, state);
  appendEvent(config.root, { type: 'prepared', planHash: plan.planHash,
    cantidadTenants: plan.cantidadTenants, totalCandidatos: plan.totalCandidatos });
  return { plan, state, summary: buildSummary(state) };
}

function inspectCheckpoint(applyDir, tenant, expectedMax) {
  const lock = path.join(applyDir, 'run.lock');
  if (fs.existsSync(lock)) throw new Error('Lock individual presente; no se elimina automáticamente.');
  const checkpoint = path.join(applyDir, 'checkpoint.json');
  if (!fs.existsSync(checkpoint)) return fs.existsSync(applyDir) ? { corrupt: true } : { exists: false };
  const state = readJson(checkpoint, 'Checkpoint individual');
  if (state.tenant !== tenant || state.maxUpdates !== expectedMax) {
    throw new Error('Checkpoint incompatible de otro tenant o límite.');
  }
  return { exists: true, pending: Boolean(state.pending), state };
}

async function execute(config, { runtime, now = () => new Date(), shouldStop = () => false,
  inspect = inspectCheckpoint } = {}) {
  if (config.mode !== 'EXECUTE' || !runtime) throw new Error('EXECUTE inválido.');
  const plan = validatePlan(readJson(path.join(config.root, 'plan.json'), 'Plan'));
  if (config.confirmPlan !== plan.planHash) throw new Error('Confirmación de plan incorrecta.');
  const state = validateState(readJson(path.join(config.root, 'state.json'), 'Estado global'), plan);
  const lock = acquireGlobalLock(config.root);
  try {
    if (!state.startedAt) state.startedAt = now().toISOString();
    state.finishedAt = null; state.globalError = null;
    for (const tenant of state.tenants) {
      if (shouldStop()) {
        globalFailure(config.root, state, tenant, 'SIGNAL',
          { className: 'operator-signal', message: 'Interrupción solicitada por el operador.' });
        break;
      }
      if (SKIP_ON_RESUME.has(tenant.status)) continue;
      if (tenant.status === 'VALIDATING' || tenant.status === 'DRY_RUN') tenant.status = 'PLANNED';
      const tenantRoot = path.join(config.root, 'tenants', tenant.directory);
      const applyDir = path.join(tenantRoot, 'apply');
      let resumeApply = false;
      if (tenant.status === 'APPLYING') {
        try {
          const checkpoint = inspect(applyDir, tenant.clienteId, tenant.authorizedMaxUpdates);
          if (checkpoint.corrupt) {
            if (localFailure(config.root, state, tenant, 'NEEDS_REVIEW', 'checkpoint',
              'Run-dir individual sin checkpoint válido.')) break;
            continue;
          }
          if (checkpoint.pending) {
            tenant.pending = true;
            if (localFailure(config.root, state, tenant, 'NEEDS_RECONCILIATION', 'pending',
              'Checkpoint individual contiene pending.')) break;
            continue;
          }
          resumeApply = checkpoint.exists;
          tenant.reserved = Number(checkpoint.state?.reserved || tenant.reserved || 0);
        } catch (error) {
          const classified = classifyError(error, 'APPLYING');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'APPLYING', classified); break; }
          if (localFailure(config.root, state, tenant, 'NEEDS_REVIEW', classified.className, classified.message)) break;
          continue;
        }
      }
      if (tenant.status === 'PLANNED') {
        transition(config.root, state, tenant, 'VALIDATING');
        try { await runtime.validateTenant(tenant.clienteId); }
        catch (error) {
          const classified = classifyError(error, 'VALIDATING');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'VALIDATING', classified); break; }
          if (classified.omitted) {
            if (localFailure(config.root, state, tenant, 'OMITTED', classified.className, classified.message)) break;
          } else if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
          continue;
        }
        transition(config.root, state, tenant, 'DRY_RUN');
        let dry;
        try { dry = await runtime.dryRun(tenant.clienteId, config.pageSize,
          message => tenantLog(config.root, tenant, message)); }
        catch (error) {
          const classified = classifyError(error, 'DRY_RUN');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'DRY_RUN', classified); break; }
          if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
          continue;
        }
        atomicWriteJson(path.join(tenantRoot, 'dry-run-inicial.json'), dry);
        if (!validDryRun(dry)) {
          const classified = classifyError(new Error(dry?.stopReason || 'Dry-run incompleto.'), 'DRY_RUN');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'DRY_RUN', classified); break; }
          if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
          continue;
        }
        tenant.initialCandidates = candidateCount(dry);
        if (tenant.initialCandidates === 0) {
          transition(config.root, state, tenant, 'ALREADY_COMPLETE', { finalCandidates: 0 });
          state.lastOutcome = { sequence: tenant.sequence, scope: 'success' }; saveState(config.root, state); continue;
        }
        if (tenant.initialCandidates > config.maxUpdatesPerTenant) {
          transition(config.root, state, tenant, 'NEEDS_REVIEW', {
            errorClass: 'per-tenant-limit',
            error: `Candidatos ${tenant.initialCandidates} exceden límite ${config.maxUpdatesPerTenant}.`,
          });
          state.lastOutcome = { sequence: tenant.sequence, scope: 'policy' }; saveState(config.root, state); continue;
        }
        const reservedOther = state.tenants.reduce((n, row) => n + (row === tenant ? 0 : row.reserved), 0);
        if (reservedOther + tenant.initialCandidates > config.maxUpdatesTotal) {
          globalFailure(config.root, state, tenant, 'LIMITS', { className: 'total-limit',
            message: `El presupuesto total no admite ${tenant.initialCandidates} reservas para este tenant.` });
          break;
        }
        tenant.authorizedMaxUpdates = tenant.initialCandidates;
        transition(config.root, state, tenant, 'APPLYING');
      }
      if (tenant.status === 'APPLYING') {
        const reservedOther = state.tenants.reduce((n, row) => n + (row === tenant ? 0 : row.reserved), 0);
        if (reservedOther + tenant.authorizedMaxUpdates > config.maxUpdatesTotal) {
          globalFailure(config.root, state, tenant, 'LIMITS', { className: 'total-limit',
            message: 'El presupuesto total no admite reanudar este tenant.' });
          break;
        }
        try {
          const result = await runtime.apply({ tenant: tenant.clienteId, pageSize: config.pageSize,
            maxUpdates: tenant.authorizedMaxUpdates, runDir: applyDir, resume: resumeApply,
            log: message => tenantLog(config.root, tenant, message) });
          tenant.ventasConfirmadas = confirmedWrites(result, 'ventas');
          tenant.pedidosConfirmados = confirmedWrites(result, 'pedidos');
          tenant.reserved = Number(result.reserved || 0);
          tenant.uncertain = uncertainCount(result);
          tenant.pending = Boolean(result.pending);
          saveState(config.root, state);
          const totalReserved = state.tenants.reduce((n, row) => n + row.reserved, 0);
          if (totalReserved > config.maxUpdatesTotal) {
            globalFailure(config.root, state, tenant, 'LIMITS', { className: 'total-limit',
              message: 'Las reservas acumuladas excedieron el límite total.' });
            break;
          }
          if (tenant.pending) {
            if (localFailure(config.root, state, tenant, 'NEEDS_RECONCILIATION', 'pending',
              'Apply terminó con pending.')) break;
            continue;
          }
          if (result.stopReason === 'interrumpido') {
            globalFailure(config.root, state, tenant, 'SIGNAL',
              { className: 'operator-signal', message: 'Apply interrumpido por el operador.' });
            break;
          }
          if (result.errors) {
            const classified = classifyError(new Error(result.stopReason || 'Apply falló.'), 'APPLYING');
            if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'APPLYING', classified); break; }
            if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
            continue;
          }
          transition(config.root, state, tenant, 'VERIFYING');
        } catch (error) {
          const classified = classifyError(error, 'APPLYING');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'APPLYING', classified); break; }
          if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
          continue;
        }
      }
      if (tenant.status === 'VERIFYING') {
        let finalDry;
        try { finalDry = await runtime.dryRun(tenant.clienteId, config.pageSize,
          message => tenantLog(config.root, tenant, message)); }
        catch (error) {
          const classified = classifyError(error, 'VERIFYING');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'VERIFYING', classified); break; }
          if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
          continue;
        }
        atomicWriteJson(path.join(tenantRoot, 'dry-run-final.json'), finalDry);
        if (!validDryRun(finalDry)) {
          const classified = classifyError(new Error(finalDry?.stopReason || 'Dry-run final incompleto.'), 'VERIFYING');
          if (classified.scope === 'global') { globalFailure(config.root, state, tenant, 'VERIFYING', classified); break; }
          if (localFailure(config.root, state, tenant, 'FAILED', classified.className, classified.message)) break;
          continue;
        }
        tenant.finalCandidates = candidateCount(finalDry);
        if (tenant.finalCandidates > 0) {
          if (localFailure(config.root, state, tenant, 'NEEDS_REVIEW', 'remaining-candidates',
            `Quedan ${tenant.finalCandidates} candidatos después del apply.`)) break;
          continue;
        }
        transition(config.root, state, tenant, 'COMPLETED', { finalCandidates: 0, error: null, errorClass: null });
        state.lastOutcome = { sequence: tenant.sequence, scope: 'success' };
        saveState(config.root, state);
      }
    }
    if (!state.globalError && state.tenants.every(tenant => FINAL_STATUSES.has(tenant.status))) {
      state.finishedAt = now().toISOString();
    }
    saveState(config.root, state);
    return { state: clone(state), summary: buildSummary(state), stoppedGlobal: Boolean(state.globalError) };
  } finally { lock.close(); }
}

async function createFirebaseRuntime({ shouldStop = () => false } = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador detectado: usar únicamente tests con dobles.');
  const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
  const { getFirestore, FieldPath } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: PROJECT, credential: applicationDefault() });
  const db = getFirestore(app, DATABASE);
  const adapter = createAdapter(db, FieldPath);
  return {
    async inventory(pageSize) {
      const config = parseBackfillArgs(['--project', PROJECT, '--inventory-global', '--page-size', String(pageSize)]);
      return runInventory(config, createInventoryAdapter(db, FieldPath));
    },
    validateTenant(tenant) { return validateTenantEligibility(tenant, adapter); },
    async dryRun(tenant, pageSize, log) {
      const config = parseBackfillArgs(['--project', PROJECT, '--tenant', tenant,
        '--dry-run', '--page-size', String(pageSize)]);
      return run(config, adapter, { log, shouldStop });
    },
    async apply({ tenant, pageSize, maxUpdates, runDir, resume, log }) {
      const args = ['--project', PROJECT, '--tenant', tenant, '--apply', '--confirm-tenant', tenant,
        '--max-updates', String(maxUpdates), '--page-size', String(pageSize),
        resume ? '--resume' : '--run-dir', runDir];
      const config = parseBackfillArgs(args);
      await validateApplyTenant(config, adapter); // Antes de abrir el run-dir.
      const store = openStore(config);
      try { return await run(config, adapter, { store, log, shouldStop }); }
      finally { store.close(); }
    },
    async close() { await db.terminate(); await deleteApp(app); },
  };
}

function printSummary(summary, log = console.log) {
  const table = (title, rows, formatter) => {
    log(title);
    if (!rows.length) log('(ninguno)');
    for (const row of rows) log(formatter(row));
  };
  table('COMPLETADOS', summary.completados, row =>
    `${row.tenant} | ${row.nombre || ''} | ${row.candidatosIniciales} | ${row.escriturasConfirmadas} | ${row.candidatosFinales}`);
  table('YA COMPLETOS', summary.yaCompletos, row => `${row.tenant} | ${row.nombre || ''}`);
  table('OMITIDOS', summary.omitidos, row => `${row.tenant} | ${row.nombre || ''} | ${row.motivo || ''}`);
  table('FALLIDOS / REQUIEREN REVISIÓN', summary.fallidosRevision, row =>
    `${row.tenant} | ${row.etapa} | ${row.error || ''} | pending=${row.pending ? 'sí' : 'no'}`);
  log(`RESUMEN\n${JSON.stringify(summary.resumen, null, 2)}\nHora inicio: ${summary.horaInicio || '-'}\nHora fin: ${summary.horaFin || '-'}\nPlan hash: ${summary.planHash}`);
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const config = parseArgs(argv);
  if (config.help) {
    console.log(`Uso:\nPREPARE: node orchestrator.cjs --project ${PROJECT} --prepare --run-dir ./runs/multi-tenant-YYYY-MM-DD-NNN [--page-size 100]\nEXECUTE: node orchestrator.cjs --project ${PROJECT} --execute --resume ./runs/multi-tenant-YYYY-MM-DD-NNN --confirm-plan HASH --max-updates-per-tenant N --max-updates-total N [--page-size 100]\nNo existe --apply-global.`);
    return 0;
  }
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  let runtime = dependencies.runtime;
  try {
    if (!runtime) runtime = await createFirebaseRuntime({ shouldStop: () => stopped });
    if (config.mode === 'PREPARE') {
      const result = await prepare(config, { inventory: pageSize => runtime.inventory(pageSize) });
      console.log(`Plan preparado.\nTenants: ${result.plan.cantidadTenants}\nCandidatos: ${result.plan.totalCandidatos}\nPlan hash: ${result.plan.planHash}`);
      return 0;
    }
    const result = await execute(config, { runtime, shouldStop: () => stopped });
    printSummary(result.summary);
    return result.stoppedGlobal ? 1 : 0;
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    if (runtime && !dependencies.runtime && typeof runtime.close === 'function') await runtime.close();
  }
}

module.exports = {
  VERSION, RUNS_ROOT, parseArgs, stableStringify, hashPlan, tenantDirectory,
  atomicWriteJson, acquireGlobalLock, classifyError, buildSummary, prepare, execute,
  inspectCheckpoint, createFirebaseRuntime, printSummary, main,
};

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(`Abortado: ${error.message}`); process.exitCode = 1;
});
