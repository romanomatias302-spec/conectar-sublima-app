'use strict';

// Todos los tests usan dobles locales. Este archivo no importa Firebase Admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  RUNS_ROOT, parseArgs, hashPlan, atomicWriteJson, prepare, execute,
} = require('./orchestrator.cjs');
const { PROJECT } = require('./backfill.cjs');

const silent = () => {};

function workspace() {
  fs.mkdirSync(RUNS_ROOT, { recursive: true });
  const base = fs.mkdtempSync(path.join(RUNS_ROOT, 'orchestrator-test-'));
  return { base, root: path.join(base, 'run'), cleanup() { fs.rmSync(base, { recursive: true, force: true }); } };
}

function inventoryResult(tenants) {
  return {
    definitive: true,
    complete: { clientesSaas: true, ventas: true, pedidos: true },
    global: { errores: 0 },
    tenants: tenants.map(tenant => ({
      nombre: null, estado: 'activo', estadoSuscripcion: null,
      elegibleParaApplyPosterior: true, anomaliaIdentidad: false,
      ventasCandidatas: 0, pedidosCandidatos: 0, ...tenant,
    })),
    orphans: [{ clienteId: 'huerfano', ventasCandidatas: 99, pedidosCandidatos: 0 }],
  };
}

function dry(ventas, pedidos = 0, rest = {}) {
  return {
    errors: 0, complete: true, partialStart: false, stopReason: '', pending: false, reserved: 0,
    counts: {
      ventas: { candidates: ventas, updated: 0, uncertain: 0 },
      pedidos: { candidates: pedidos, updated: 0, uncertain: 0 },
    },
    ...rest,
  };
}

function applied(ventas, pedidos = 0, rest = {}) {
  return {
    errors: 0, complete: false, stopReason: 'max-updates', pending: false,
    reserved: ventas + pedidos,
    counts: {
      ventas: { candidates: ventas, updated: ventas, uncertain: 0 },
      pedidos: { candidates: pedidos, updated: pedidos, uncertain: 0 },
    },
    ...rest,
  };
}

function fakeRuntime({ validation = {}, dries = {}, applies = {} } = {}) {
  const calls = [];
  const dryQueues = Object.fromEntries(Object.entries(dries).map(([id, values]) => [id, [...values]]));
  const applyQueues = Object.fromEntries(Object.entries(applies).map(([id, values]) => [id, [...values]]));
  let activeWrites = 0, maxActiveWrites = 0;
  const take = (queues, id, fallback) => queues[id]?.length ? queues[id].shift() : fallback;
  return {
    calls,
    get maxActiveWrites() { return maxActiveWrites; },
    async validateTenant(id) {
      calls.push({ type: 'validate', id });
      const value = validation[id];
      if (value instanceof Error) throw value;
      return value || { id, estado: 'activo', estadoSuscripcion: null };
    },
    async dryRun(id) {
      calls.push({ type: 'dry', id });
      const value = take(dryQueues, id, dry(0));
      if (value instanceof Error) throw value;
      return JSON.parse(JSON.stringify(value));
    },
    async apply({ tenant, maxUpdates, runDir, resume }) {
      activeWrites++;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      calls.push({ type: 'apply', id: tenant, maxUpdates, runDir, resume });
      try {
        const value = take(applyQueues, tenant, applied(maxUpdates));
        if (value instanceof Error) throw value;
        fs.mkdirSync(runDir, { recursive: resume });
        fs.writeFileSync(path.join(runDir, 'checkpoint.json'), JSON.stringify({
          tenant, maxUpdates, reserved: value.reserved || 0,
          pending: value.pending ? { id: 'pending' } : null,
        }));
        fs.appendFileSync(path.join(runDir, 'journal.jsonl'), '{}\n');
        return JSON.parse(JSON.stringify(value));
      } finally { activeWrites--; }
    },
  };
}

async function makePlan(space, tenants) {
  const config = parseArgs(['--project', PROJECT, '--prepare', '--run-dir', space.root]);
  return prepare(config, { inventory: async () => inventoryResult(tenants),
    now: () => new Date('2026-09-01T00:00:00.000Z') });
}

function executeConfig(root, hash, perTenant = 1000, total = 10000) {
  return parseArgs(['--project', PROJECT, '--execute', '--resume', root,
    '--confirm-plan', hash, '--max-updates-per-tenant', String(perTenant),
    '--max-updates-total', String(total)]);
}

test('PREPARE filtra tenants, congela plan estable y no ejecuta escrituras', async () => {
  const space = workspace();
  let inventoryCalls = 0, writes = 0;
  try {
    const config = parseArgs(['--project', PROJECT, '--prepare', '--run-dir', space.root, '--page-size', '25']);
    const result = await prepare(config, { inventory: async size => {
      inventoryCalls++;
      assert.equal(size, 25);
      return inventoryResult([
        { clienteId: 'activo', nombre: 'Activo', ventasCandidatas: 4 },
        { clienteId: 'suspendido', estado: 'suspendido', elegibleParaApplyPosterior: false, ventasCandidatas: 8 },
        { clienteId: 'cancelado', estadoSuscripcion: 'cancelado', elegibleParaApplyPosterior: false, ventasCandidatas: 7 },
        { clienteId: 'sin-candidatos', ventasCandidatas: 0 },
        { clienteId: 'identidad', anomaliaIdentidad: true, elegibleParaApplyPosterior: false, ventasCandidatas: 6 },
      ]);
    }, apply: () => { writes++; } });
    assert.equal(inventoryCalls, 1);
    assert.equal(writes, 0);
    assert.deepEqual(result.plan.tenants.map(tenant => tenant.clienteId), ['activo']);
    assert.equal(result.plan.cantidadTenants, 1);
    assert.equal(result.plan.totalCandidatos, 4);
    assert.equal(result.plan.inventoryComplete, true);
    assert.equal(result.plan.planHash, hashPlan(result.plan));
    const reordered = { tenants: result.plan.tenants, totalCandidatos: 4,
      project: result.plan.project, version: result.plan.version, planHash: result.plan.planHash,
      inventoryComplete: true, database: result.plan.database, createdAt: result.plan.createdAt,
      cantidadTenants: 1 };
    assert.equal(hashPlan(reordered), result.plan.planHash);
    assert.ok(fs.existsSync(path.join(space.root, 'plan.json')));
    assert.ok(fs.existsSync(path.join(space.root, 'tenants', result.plan.tenants[0].directory, 'tenant.json')));
    assert.notEqual(result.plan.tenants[0].directory, 'activo');
  } finally { space.cleanup(); }
});

test('PREPARE exige inventario completo y los run-dir están ignorados por Git', async () => {
  const space = workspace();
  try {
    const config = parseArgs(['--project', PROJECT, '--prepare', '--run-dir', space.root]);
    await assert.rejects(prepare(config, { inventory: async () => ({
      definitive: false, complete: {}, global: { errores: 0 }, tenants: [],
    }) }), /Inventario incompleto/);
    const ignore = fs.readFileSync(path.join(RUNS_ROOT, '..', '.gitignore'), 'utf8');
    assert.match(ignore, /^runs\/$/m);
  } finally { space.cleanup(); }
});

test('confirm-plan incorrecto, plan alterado y cualquier apply global son rechazados', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [{ clienteId: 'a', ventasCandidatas: 1 }]);
    assert.throws(() => parseArgs(['--project', PROJECT, '--apply-global']), /desconocido/);
    const wrong = '0'.repeat(64);
    await assert.rejects(execute(executeConfig(space.root, wrong), { runtime: fakeRuntime() }), /Confirmación/);
    const file = path.join(space.root, 'plan.json');
    const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    plan.tenants[0].nombre = 'alterado';
    fs.writeFileSync(file, JSON.stringify(plan));
    await assert.rejects(execute(executeConfig(space.root, prepared.plan.planHash),
      { runtime: fakeRuntime() }), /Plan\/hash/);
  } finally { space.cleanup(); }
});

test('procesa tenants estrictamente en secuencia con run-dir y checkpoint aislados', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [
      { clienteId: 'a', nombre: 'A', ventasCandidatas: 2 },
      { clienteId: 'b', nombre: 'B', ventasCandidatas: 1 },
    ]);
    const runtime = fakeRuntime({
      dries: { a: [dry(2), dry(0)], b: [dry(1), dry(0)] },
      applies: { a: [applied(2)], b: [applied(1)] },
    });
    const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(result.stoppedGlobal, false);
    assert.deepEqual(result.state.tenants.map(tenant => tenant.status), ['COMPLETED', 'COMPLETED']);
    assert.deepEqual(runtime.calls.map(call => `${call.type}:${call.id}`),
      ['validate:a', 'dry:a', 'apply:a', 'dry:a', 'validate:b', 'dry:b', 'apply:b', 'dry:b']);
    assert.equal(runtime.maxActiveWrites, 1);
    const applyCalls = runtime.calls.filter(call => call.type === 'apply');
    assert.notEqual(applyCalls[0].runDir, applyCalls[1].runDir);
    assert.deepEqual(applyCalls.map(call => call.maxUpdates), [2, 1]);
    const aCheckpoint = JSON.parse(fs.readFileSync(path.join(applyCalls[0].runDir, 'checkpoint.json')));
    const bCheckpoint = JSON.parse(fs.readFileSync(path.join(applyCalls[1].runDir, 'checkpoint.json')));
    assert.equal(aCheckpoint.tenant, 'a'); assert.equal(bCheckpoint.tenant, 'b');
    assert.equal(result.summary.resumen.ventasConfirmadas, 3);
    assert.equal(result.summary.resumen.reservasConsumidas, 3);
  } finally { space.cleanup(); }
});

test('tenant suspendido antes de su turno se omite y dry-run cero queda ya completo', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [
      { clienteId: 'suspendido', ventasCandidatas: 1 },
      { clienteId: 'cero', ventasCandidatas: 1 },
    ]);
    const runtime = fakeRuntime({
      validation: { suspendido: new Error('Tenant no activo: estado="suspendido".') },
      dries: { cero: [dry(0)] },
    });
    const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(result.state.tenants.find(tenant => tenant.clienteId === 'suspendido').status, 'OMITTED');
    assert.equal(result.state.tenants.find(tenant => tenant.clienteId === 'cero').status, 'ALREADY_COMPLETE');
    assert.equal(runtime.calls.some(call => call.type === 'apply'), false);
  } finally { space.cleanup(); }
});

test('apply exitoso exige dry-run final cero; candidatos restantes requieren revisión', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [
      { clienteId: 'completo', ventasCandidatas: 1 },
      { clienteId: 'restante', ventasCandidatas: 1 },
    ]);
    const runtime = fakeRuntime({
      dries: { completo: [dry(1), dry(0)], restante: [dry(1), dry(1)] },
      applies: { completo: [applied(1)], restante: [applied(1)] },
    });
    const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(result.state.tenants[0].status, 'COMPLETED');
    assert.equal(result.state.tenants[1].status, 'NEEDS_REVIEW');
    assert.equal(result.state.tenants[1].errorClass, 'remaining-candidates');
  } finally { space.cleanup(); }
});

test('pending detiene solo ese tenant y nunca se reconcilia automáticamente', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [
      { clienteId: 'pending', ventasCandidatas: 1 },
      { clienteId: 'siguiente', ventasCandidatas: 1 },
    ]);
    const runtime = fakeRuntime({
      dries: { pending: [dry(1)], siguiente: [dry(1), dry(0)] },
      applies: { pending: [applied(0, 0, { pending: true, reserved: 1,
        counts: { ventas: { candidates: 1, updated: 0, uncertain: 1 },
          pedidos: { candidates: 0, updated: 0, uncertain: 0 } } })], siguiente: [applied(1)] },
    });
    const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(result.state.tenants[0].status, 'NEEDS_RECONCILIATION');
    assert.equal(result.state.tenants[0].pending, true);
    assert.equal(result.state.tenants[1].status, 'COMPLETED');
    assert.equal(runtime.calls.filter(call => call.id === 'pending' && call.type === 'apply').length, 1);
    assert.equal(result.summary.resumen.resultadosInciertos, 1);
    assert.equal(result.summary.resumen.pendingAbiertos, 1);
    assert.equal(result.summary.resumen.reservasConsumidas, 2);
  } finally { space.cleanup(); }
});

test('error local de concurrencia continúa; dos clases locales consecutivas detienen todo', async () => {
  const firstSpace = workspace();
  try {
    const prepared = await makePlan(firstSpace, [
      { clienteId: 'conflicto', ventasCandidatas: 1 },
      { clienteId: 'ok', ventasCandidatas: 1 },
    ]);
    const conflict = applied(0, 0, { errors: 1, stopReason: 'error: Conflicto persistente lastUpdateTime', reserved: 1 });
    const runtime = fakeRuntime({ dries: { conflicto: [dry(1)], ok: [dry(1), dry(0)] },
      applies: { conflicto: [conflict], ok: [applied(1)] } });
    const result = await execute(executeConfig(firstSpace.root, prepared.plan.planHash), { runtime });
    assert.equal(result.state.tenants[0].status, 'FAILED');
    assert.equal(result.state.tenants[1].status, 'COMPLETED');
    assert.equal(result.stoppedGlobal, false);
  } finally { firstSpace.cleanup(); }

  const secondSpace = workspace();
  try {
    const prepared = await makePlan(secondSpace, [
      { clienteId: 'a', ventasCandidatas: 1 }, { clienteId: 'b', ventasCandidatas: 1 },
      { clienteId: 'c', ventasCandidatas: 1 },
    ]);
    const conflict = () => applied(0, 0, { errors: 1,
      stopReason: 'error: Conflicto persistente lastUpdateTime', reserved: 1 });
    const runtime = fakeRuntime({ dries: { a: [dry(1)], b: [dry(1)], c: [dry(1)] },
      applies: { a: [conflict()], b: [conflict()] } });
    const result = await execute(executeConfig(secondSpace.root, prepared.plan.planHash), { runtime });
    assert.equal(result.stoppedGlobal, true);
    assert.equal(result.state.tenants[2].status, 'PLANNED');
    assert.match(result.state.globalError.message, /Dos errores locales consecutivos/);
  } finally { secondSpace.cleanup(); }
});

test('error global de permisos detiene todo sin iniciar el tenant siguiente', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [
      { clienteId: 'a', ventasCandidatas: 1 }, { clienteId: 'b', ventasCandidatas: 1 },
    ]);
    const error = Object.assign(new Error('PERMISSION_DENIED'), { code: 7 });
    const runtime = fakeRuntime({ dries: { a: [error] } });
    const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(result.stoppedGlobal, true);
    assert.equal(result.state.tenants[1].status, 'PLANNED');
    assert.equal(runtime.calls.some(call => call.id === 'b'), false);
  } finally { space.cleanup(); }
});

test('límites por tenant y total bloquean antes de cualquier apply', async () => {
  const perSpace = workspace();
  try {
    const prepared = await makePlan(perSpace, [{ clienteId: 'grande', ventasCandidatas: 3 }]);
    const runtime = fakeRuntime({ dries: { grande: [dry(3)] } });
    const result = await execute(executeConfig(perSpace.root, prepared.plan.planHash, 2, 10), { runtime });
    assert.equal(result.state.tenants[0].status, 'NEEDS_REVIEW');
    assert.equal(runtime.calls.some(call => call.type === 'apply'), false);
  } finally { perSpace.cleanup(); }

  const totalSpace = workspace();
  try {
    const prepared = await makePlan(totalSpace, [{ clienteId: 'a', ventasCandidatas: 2 }]);
    const runtime = fakeRuntime({ dries: { a: [dry(2)] } });
    const result = await execute(executeConfig(totalSpace.root, prepared.plan.planHash, 10, 1), { runtime });
    assert.equal(result.stoppedGlobal, true);
    assert.equal(runtime.calls.some(call => call.type === 'apply'), false);
  } finally { totalSpace.cleanup(); }
});

test('interrupción conserva tenant reanudable y estados finales nunca se repiten', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [{ clienteId: 'a', ventasCandidatas: 1 }]);
    const firstRuntime = fakeRuntime({ dries: { a: [dry(1), dry(0)] }, applies: { a: [applied(1)] } });
    const interrupted = await execute(executeConfig(space.root, prepared.plan.planHash), {
      runtime: firstRuntime, shouldStop: () => true,
    });
    assert.equal(interrupted.stoppedGlobal, true);
    assert.equal(interrupted.state.tenants[0].status, 'PLANNED');
    const secondRuntime = fakeRuntime({ dries: { a: [dry(1), dry(0)] }, applies: { a: [applied(1)] } });
    const resumed = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime: secondRuntime });
    assert.equal(resumed.state.tenants[0].status, 'COMPLETED');
    const thirdRuntime = fakeRuntime();
    await execute(executeConfig(space.root, prepared.plan.planHash), { runtime: thirdRuntime });
    assert.equal(thirdRuntime.calls.length, 0);
  } finally { space.cleanup(); }
});

test('ALREADY_COMPLETE, NEEDS_REVIEW y NEEDS_RECONCILIATION se saltan al resume', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [
      { clienteId: 'a', ventasCandidatas: 1 }, { clienteId: 'b', ventasCandidatas: 1 },
      { clienteId: 'c', ventasCandidatas: 1 },
    ]);
    const stateFile = path.join(space.root, 'state.json');
    const state = JSON.parse(fs.readFileSync(stateFile));
    state.tenants[0].status = 'ALREADY_COMPLETE';
    state.tenants[1].status = 'NEEDS_REVIEW';
    state.tenants[2].status = 'NEEDS_RECONCILIATION'; state.tenants[2].pending = true;
    atomicWriteJson(stateFile, state);
    const runtime = fakeRuntime();
    const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(runtime.calls.length, 0);
    assert.deepEqual(result.state.tenants.map(tenant => tenant.status),
      ['ALREADY_COMPLETE', 'NEEDS_REVIEW', 'NEEDS_RECONCILIATION']);
  } finally { space.cleanup(); }
});

test('checkpoint de otro tenant y lock individual se rechazan sin borrarlos', async () => {
  for (const mode of ['checkpoint', 'lock']) {
    const space = workspace();
    try {
      const prepared = await makePlan(space, [{ clienteId: 'a', ventasCandidatas: 1 }]);
      const stateFile = path.join(space.root, 'state.json');
      const state = JSON.parse(fs.readFileSync(stateFile));
      state.tenants[0].status = 'APPLYING'; state.tenants[0].authorizedMaxUpdates = 1;
      state.tenants[0].initialCandidates = 1;
      atomicWriteJson(stateFile, state);
      const applyDir = path.join(space.root, 'tenants', state.tenants[0].directory, 'apply');
      fs.mkdirSync(applyDir);
      if (mode === 'checkpoint') {
        fs.writeFileSync(path.join(applyDir, 'checkpoint.json'), JSON.stringify({
          tenant: 'otro', maxUpdates: 1, reserved: 0, pending: null,
        }));
      } else fs.writeFileSync(path.join(applyDir, 'run.lock'), '{}');
      const result = await execute(executeConfig(space.root, prepared.plan.planHash), { runtime: fakeRuntime() });
      assert.equal(result.state.tenants[0].status, 'NEEDS_REVIEW');
      if (mode === 'lock') assert.ok(fs.existsSync(path.join(applyDir, 'run.lock')));
    } finally { space.cleanup(); }
  }
});

test('lock global impide dos EXECUTE y no se elimina automáticamente', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [{ clienteId: 'a', ventasCandidatas: 1 }]);
    const lock = path.join(space.root, 'run.lock');
    fs.writeFileSync(lock, '{}');
    await assert.rejects(execute(executeConfig(space.root, prepared.plan.planHash),
      { runtime: fakeRuntime() }), /EEXIST/);
    assert.ok(fs.existsSync(lock));
  } finally { space.cleanup(); }
});

test('state y summary se reemplazan atómicamente y no existe ruta de paralelismo', async () => {
  const space = workspace();
  try {
    const prepared = await makePlan(space, [{ clienteId: 'a', ventasCandidatas: 1 }]);
    const runtime = fakeRuntime({ dries: { a: [dry(0)] } });
    await execute(executeConfig(space.root, prepared.plan.planHash), { runtime });
    assert.equal(fs.existsSync(path.join(space.root, 'state.json.tmp')), false);
    assert.equal(fs.existsSync(path.join(space.root, 'summary.json.tmp')), false);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(space.root, 'state.json'))));
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(space.root, 'summary.json'))));
    const source = fs.readFileSync(path.join(__dirname, 'orchestrator.cjs'), 'utf8');
    assert.equal(source.includes('Promise.all'), false);
    assert.equal(source.includes('worker_threads'), false);
  } finally { space.cleanup(); }
});
