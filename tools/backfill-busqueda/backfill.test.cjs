'use strict';

// Solo dobles en memoria. No importar Firebase ni resolver ADC en estas pruebas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROJECT, TENANT, FIELDS, parseArgs, classify, initialState, validateState, openStore,
  reconcileOnly, createAdapter, createReadAdapter, createInventoryAdapter, runInventory,
  printInventoryReport, validateTenantEligibility, validateApplyTenant, run, printReport, main } = require('./backfill.cjs');

const base = ['--tenant', TENANT, '--project', PROJECT];
const dry = (extra = []) => parseArgs([...base, ...extra]);
const apply = (extra = []) => parseArgs([...base, '--apply', '--confirm-tenant', TENANT,
  '--max-updates', '100', '--run-dir', 'unused-test-run', ...extra]);
const reconcile = (extra = []) => parseArgs([...base, '--reconcile-only', '--resume',
  'unused-test-run', ...extra]);
const inventory = (extra = []) => parseArgs(['--project', PROJECT, '--inventory-global', ...extra]);
const tenantBase = tenant => ['--tenant', tenant, '--project', PROJECT];
const tenantDry = (tenant, extra = []) => parseArgs([...tenantBase(tenant), ...extra]);
const tenantApply = (tenant, extra = []) => parseArgs([...tenantBase(tenant), '--apply',
  '--confirm-tenant', tenant, '--max-updates', '100', '--run-dir', `unused-${tenant}`, ...extra]);
const copy = value => JSON.parse(JSON.stringify(value));
const silent = () => {};
const sale = (source = '  Megan FOX  ', rest = {}) => ({ clienteId: TENANT, clienteNombre: source, ...rest });
const order = (source = '  Megan FOX  ', rest = {}) => ({ clienteId: TENANT, cliente: source, ...rest });

function memoryStore(config, saved) {
  return { state: saved ? copy(saved) : initialState(config), events: [],
    save(state) { this.saved = copy(state); }, event(event) { this.events.push(copy(event)); } };
}

function memoryAdapter(seed = {}) {
  let clock = 1;
  const tenantDocs = new Map(Object.entries(seed.tenants || { [TENANT]: { estado: 'activo' } })
    .map(([id, data]) => [id, { id, data: copy(data) }]));
  const docs = Object.fromEntries(Object.keys(FIELDS).map(c => [c, new Map(
    Object.entries(seed[c] || {}).map(([id, data]) => [id, { id, data: copy(data), updateTime: { seconds: clock++, nanoseconds: 0 } }]))]));
  return {
    docs, tenantDocs, pages: [], reads: [], tenantReads: [], writes: [], beforeUpdate: null,
    change(c, id, changes) {
      const snap = docs[c].get(id);
      Object.assign(snap.data, changes);
      snap.updateTime = { seconds: clock++, nanoseconds: 0 };
    },
    async page(c, tenant, cursor, size) {
      this.pages.push({ c, tenant, cursor, size });
      return [...docs[c].values()].filter(s => s.data.clienteId === tenant && (!cursor || s.id > cursor))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, size).map(copy);
    },
    async read(c, id) { this.reads.push({ c, id }); return docs[c].has(id) ? copy(docs[c].get(id)) : null; },
    async readTenant(id) {
      this.tenantReads.push(id);
      return tenantDocs.has(id) ? copy(tenantDocs.get(id)) : null;
    },
    async update(c, id, field, value, version) {
      if (this.beforeUpdate) await this.beforeUpdate(c, id, field, value);
      const snap = docs[c].get(id);
      if (!snap) throw Object.assign(new Error('deleted'), { code: 5 });
      if (JSON.stringify(snap.updateTime) !== JSON.stringify(version)) throw Object.assign(new Error('changed'), { code: 9 });
      assert.equal(field, FIELDS[c].target);
      this.writes.push({ c, id, payload: { [field]: value }, version: copy(version) });
      this.change(c, id, { [field]: value });
      return { writeTime: copy(snap.updateTime) };
    },
  };
}

function memoryInventoryAdapter(seed = {}) {
  const tenants = new Map(Object.entries(seed.tenants || {}).map(([id, data]) => [id, { id, data: copy(data) }]));
  const collections = Object.fromEntries(Object.keys(FIELDS).map(collection => [collection,
    new Map(Object.entries(seed[collection] || {}).map(([id, data]) => [id, { id, data: copy(data) }]))]));
  const calls = [];
  const page = (map, cursor, size) => [...map.values()].filter(doc => !cursor || doc.id > cursor)
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, size).map(copy);
  return {
    calls,
    async pageTenants(cursor, size) {
      calls.push({ kind: 'tenants', cursor, size });
      return page(tenants, cursor, size);
    },
    async pageCollection(collection, cursor, size) {
      calls.push({ kind: collection, cursor, size });
      return page(collections[collection], cursor, size);
    },
  };
}

test('inventory-global: argumentos aislados y no existe apply global', () => {
  const config = inventory(['--page-size', '25']);
  assert.equal(config.inventoryGlobal, true);
  assert.equal(config.apply, false);
  assert.equal(config.reconcileOnly, false);
  assert.equal(config.pageSize, 25);
  assert.equal(config.runDir, null);
  for (const args of [
    ['--project', PROJECT, '--inventory-global', '--tenant', TENANT],
    ['--project', PROJECT, '--inventory-global', '--dry-run'],
    ['--project', PROJECT, '--inventory-global', '--apply'],
    ['--project', PROJECT, '--inventory-global', '--resume', 'run'],
    ['--project', PROJECT, '--inventory-global', '--run-dir', 'run'],
    ['--project', PROJECT, '--inventory-global', '--max-pages', '1'],
  ]) assert.throws(() => parseArgs(args), /inventory-global/);
  assert.throws(() => parseArgs(['--project', PROJECT, '--apply-global']), /desconocido/);
});

test('inventory-global clasifica múltiples tenants, huérfanos y anomalías sin hardcodear elgol', async () => {
  const adapter = memoryInventoryAdapter({
    tenants: {
      elgol: { nombre: 'El Gol', estado: 'activo' },
      activo: { nombreVisible: 'Activo visible', nombre: 'Ignorado', estado: 'activo' },
      inactivo: { nombre: 'Inactivo', estado: 'inactivo' },
      sinestado: { nombreCliente: 'Sin estado' },
      cancelado: { nombre: 'Cancelado', estado: 'activo', estadoSuscripcion: 'cancelado' },
      identidad: { nombre: 'Identidad', estado: 'activo', clienteId: 'otro' },
    },
    ventas: {
      '01-elgol': { clienteId: 'elgol', clienteNombre: 'Megan', clienteNombreBusqueda: 'megan' },
      '02-activo': { clienteId: 'activo', clienteNombre: 'Ana' },
      '03-huerfano': { clienteId: 'huerfano', clienteNombre: 'Hugo' },
      '04-faltante': { clienteNombre: 'Falta ID' },
      '05-vacio': { clienteId: '  ', clienteNombre: 'Vacío' },
      '06-tipo': { clienteId: 42, clienteNombre: 'Número' },
      '07-fuente': { clienteId: 'activo', clienteNombre: '   ' },
      '08-derivado': { clienteId: 'activo', clienteNombre: 'Ana', clienteNombreBusqueda: null },
    },
    pedidos: {
      '01-elgol': { clienteId: 'elgol', cliente: 'Megan', clienteBusqueda: 'megan' },
      '02-inactivo': { clienteId: 'inactivo', cliente: 'Pedro' },
    },
  });
  const times = [new Date('2026-09-01T10:00:00.000Z'), new Date('2026-09-01T10:01:00.000Z')];
  const result = await runInventory(inventory(['--page-size', '1']), adapter,
    { log: silent, now: () => times.shift() });
  assert.equal(result.definitive, true);
  assert.deepEqual(result.complete, { clientesSaas: true, ventas: true, pedidos: true });
  assert.equal(result.startedAt, '2026-09-01T10:00:00.000Z');
  assert.equal(result.finishedAt, '2026-09-01T10:01:00.000Z');
  assert.equal(result.global.tenantsRegistrados, 6);
  assert.equal(result.global.tenantsActivos, 4);
  assert.equal(result.global.tenantsSuspendidosInactivos, 1);
  assert.equal(result.global.tenantsEstadoDesconocido, 1);
  assert.equal(result.global.tenantsElegibles, 2);
  assert.equal(result.global.tenantsConCandidatos, 2);
  assert.equal(result.global.tenantsActivosConCandidatos, 1);
  assert.equal(result.global.tenantsSuspendidosInactivosConCandidatos, 1);
  assert.equal(result.global.ventasCandidatasTenantsActivos, 1);
  assert.equal(result.global.pedidosCandidatosTenantsActivos, 0);
  assert.equal(result.global.ventasCandidatasTenantsSuspendidosInactivos, 0);
  assert.equal(result.global.pedidosCandidatosTenantsSuspendidosInactivos, 1);
  assert.equal(result.global.ventasExaminadas, 8);
  assert.equal(result.global.pedidosExaminados, 2);
  assert.equal(result.global.ventasCandidatas, 5);
  assert.equal(result.global.pedidosCandidatos, 1);
  assert.equal(result.global.documentosHuerfanos, 1);
  assert.equal(result.global.documentosClienteIdInvalido, 3);
  assert.deepEqual(result.invalidTenantIds, { missing: 1, empty: 1, unexpectedType: 1 });
  assert.equal(result.global.fuentesInvalidas, 1);
  assert.equal(result.global.derivadosTipoInesperado, 1);
  const elgol = result.tenants.find(tenant => tenant.clienteId === 'elgol');
  assert.equal(elgol.ventasCandidatas, 0);
  assert.equal(elgol.pedidosCandidatos, 0);
  const activo = result.tenants.find(tenant => tenant.clienteId === 'activo');
  assert.equal(activo.nombre, 'Activo visible');
  assert.equal(activo.ventasCandidatas, 1);
  assert.equal(activo.fuentesInvalidas, 1);
  assert.equal(activo.derivadosTipoInesperado, 1);
  assert.equal(result.tenants.find(tenant => tenant.clienteId === 'inactivo').elegibleParaApplyPosterior, false);
  assert.equal(result.tenants.find(tenant => tenant.clienteId === 'sinestado').elegibleParaApplyPosterior, false);
  assert.equal(result.tenants.find(tenant => tenant.clienteId === 'cancelado').elegibleParaApplyPosterior, false);
  const identidad = result.tenants.find(tenant => tenant.clienteId === 'identidad');
  assert.equal(identidad.anomaliaIdentidad, true);
  assert.equal(identidad.clienteIdInterno, 'otro');
  assert.equal(identidad.elegibleParaApplyPosterior, false);
  assert.equal(result.orphans[0].clienteId, 'huerfano');
  assert.equal(result.orphans[0].ventasCandidatas, 1);
  assert.deepEqual(result.activeTenantsWithCandidates.map(tenant => tenant.clienteId), ['activo']);
  assert.ok(adapter.calls.filter(call => call.kind === 'ventas').length > 1);
  assert.ok(adapter.calls.every(call => call.size === 1));
  for (const forbidden of ['reserved', 'pending', 'runDir', 'checkpoint', 'journal']) {
    assert.equal(Object.prototype.hasOwnProperty.call(result, forbidden), false);
  }
});

test('inventory-global continúa tras fallo parcial y marca totales no definitivos', async () => {
  const adapter = memoryInventoryAdapter({
    tenants: { elgol: { estado: 'activo' } },
    ventas: { a: { clienteId: 'elgol', clienteNombre: 'Ana' }, b: { clienteId: 'elgol', clienteNombre: 'Beto' } },
    pedidos: { a: { clienteId: 'elgol', cliente: 'Ana' } },
  });
  const original = adapter.pageCollection.bind(adapter);
  adapter.pageCollection = async (collection, cursor, size) => {
    if (collection === 'ventas' && cursor === 'a') throw new Error('lectura simulada fallida');
    return original(collection, cursor, size);
  };
  const result = await runInventory(inventory(['--page-size', '1']), adapter, { log: silent });
  assert.equal(result.complete.clientesSaas, true);
  assert.equal(result.complete.ventas, false);
  assert.equal(result.complete.pedidos, true);
  assert.equal(result.definitive, false);
  assert.equal(result.global.errores, 1);
  assert.equal(result.errors[0].collection, 'ventas');
  assert.equal(result.global.ventasExaminadas, 1);
  assert.equal(result.global.pedidosExaminados, 1);
});

test('inventory-global resume activos/inactivos y ordena activos elegibles por candidatos', async () => {
  const result = await runInventory(inventory(), memoryInventoryAdapter({
    tenants: {
      activoA: { nombre: 'Activo A', estado: 'activo' },
      activoB: { nombre: 'Activo B', estado: 'activo' },
      suspendido: { nombre: 'Suspendido', estado: 'suspendido' },
    },
    ventas: {
      a1: { clienteId: 'activoA', clienteNombre: 'A' },
      b1: { clienteId: 'activoB', clienteNombre: 'B' },
      b2: { clienteId: 'activoB', clienteNombre: 'B' },
      s1: { clienteId: 'suspendido', clienteNombre: 'S' },
    },
    pedidos: {
      a1: { clienteId: 'activoA', cliente: 'A' },
      a2: { clienteId: 'activoA', cliente: 'A' },
      s1: { clienteId: 'suspendido', cliente: 'S' },
    },
  }), { log: silent });
  assert.equal(result.global.tenantsActivosConCandidatos, 2);
  assert.equal(result.global.tenantsSuspendidosInactivosConCandidatos, 1);
  assert.equal(result.global.ventasCandidatasTenantsActivos, 3);
  assert.equal(result.global.pedidosCandidatosTenantsActivos, 2);
  assert.equal(result.global.ventasCandidatasTenantsSuspendidosInactivos, 1);
  assert.equal(result.global.pedidosCandidatosTenantsSuspendidosInactivos, 1);
  assert.deepEqual(result.activeTenantsWithCandidates.map(tenant => tenant.clienteId), ['activoA', 'activoB']);
});

test('adaptador inventory-global expone solo lecturas paginadas y proyecciones mínimas', async () => {
  const calls = [];
  const query = {};
  for (const method of ['orderBy', 'select', 'limit', 'startAfter']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.get = async () => ({ docs: [{ id: 'a', data: () => ({ estado: 'activo' }) }] });
  const db = { collection(name) { calls.push(['collection', name]); return query; } };
  const adapter = createInventoryAdapter(db, { documentId: () => '__name__' });
  assert.deepEqual(Object.keys(adapter), ['pageTenants', 'pageCollection']);
  for (const forbidden of ['update', 'set', 'create', 'delete', 'batch', 'transaction']) {
    assert.equal(Object.prototype.hasOwnProperty.call(adapter, forbidden), false);
  }
  await adapter.pageTenants(null, 10);
  assert.deepEqual(calls, [['collection', 'clientes-saas'], ['orderBy', '__name__'],
    ['select', 'clienteId', 'nombreVisible', 'nombre', 'nombreCliente', 'estado', 'estadoSuscripcion'], ['limit', 10]]);
  calls.length = 0;
  await adapter.pageCollection('ventas', 'cursor', 5);
  assert.deepEqual(calls, [['collection', 'ventas'], ['orderBy', '__name__'],
    ['select', 'clienteId', 'clienteNombre', 'clienteNombreBusqueda'], ['limit', 5], ['startAfter', 'cursor']]);
  await assert.rejects(adapter.pageCollection('pagos', null, 5));
});

test('inventory-global vía main no abre run-dir ni usa estado de apply', async () => {
  const adapter = memoryInventoryAdapter({ tenants: { elgol: { estado: 'activo' } } });
  const originalLog = console.log;
  const originalOpen = fs.openSync;
  const originalMkdir = fs.mkdirSync;
  const originalRename = fs.renameSync;
  console.log = silent;
  fs.openSync = () => { throw new Error('inventory-global intentó abrir checkpoint/journal/lock'); };
  fs.mkdirSync = () => { throw new Error('inventory-global intentó crear run-dir'); };
  fs.renameSync = () => { throw new Error('inventory-global intentó actualizar checkpoint'); };
  try {
    const code = await main(['--project', PROJECT, '--inventory-global', '--page-size', '2'], {
      adapterFactory(config) {
        assert.equal(config.runDir, null);
        return adapter;
      },
    });
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
    fs.openSync = originalOpen;
    fs.mkdirSync = originalMkdir;
    fs.renameSync = originalRename;
  }
});

test('reporte inventory-global explicita alcance, completitud y cero estado de escritura', async () => {
  const result = await runInventory(inventory(), memoryInventoryAdapter({
    tenants: { elgol: { nombre: 'El Gol', estado: 'activo' } },
  }), { log: silent });
  const lines = [];
  printInventoryReport(result, line => lines.push(line));
  const output = lines.join('\n');
  for (const fragment of ['Modo: INVENTORY-GLOBAL', 'Tenant: elgol',
    'Tenants registrados: 1', 'Recorrido completo de clientes-saas: sí',
    'Recorrido completo de ventas: sí', 'Recorrido completo de pedidos: sí',
    'Totales definitivos: sí', 'Escrituras en Firestore: 0',
    'Checkpoints/journals/run-dir: 0', 'Reservas/pending: 0',
    'TENANTS ACTIVOS CON CANDIDATOS',
    'clienteId | nombre | ventas candidatas | pedidos candidatos',
    'no es una snapshot transaccional global']) assert.ok(output.includes(fragment), fragment);
});

test('ventas y pedidos: elegibilidad, omisión y normalización exacta', () => {
  for (const c of Object.keys(FIELDS)) {
    const { source, target } = FIELDS[c];
    for (const destination of [{}, { [target]: '' }, { [target]: ' \t ' }]) {
      const result = classify(c, { clienteId: TENANT, [source]: '  MÉGAN FoX  ', ...destination });
      assert.equal(result.reason, 'candidate');
      assert.equal(result.value, 'mégan fox');
      assert.equal(result.field, target);
    }
    assert.equal(classify(c, { clienteId: TENANT, [source]: 'Nombre', [target]: ' Valor PREVIO ' }).reason, 'existing');
    for (const value of ['', '   ', null, 4, {}, [], false, undefined]) {
      assert.equal(classify(c, { clienteId: TENANT, [source]: value }).reason, 'invalidSource');
    }
    for (const value of [null, 4, {}, [], false, undefined]) {
      assert.equal(classify(c, { clienteId: TENANT, [source]: 'Nombre', [target]: value }).reason, 'invalidTarget');
    }
    assert.equal(classify(c, { clienteId: TENANT }).reason, 'invalidSource');
  }
});

test('argumentos: dry-run por defecto y barreras de ámbito/escritura', () => {
  assert.equal(dry().apply, false);
  assert.equal(dry().pageSize, 100);
  assert.equal(dry(['--page-size', '1']).pageSize, 1);
  assert.equal(tenantDry('otro').tenant, 'otro');
  for (const args of [[], ['--project', PROJECT], ['--tenant', 'con/barra', '--project', PROJECT],
    ['--tenant', TENANT, '--project', 'otro'], [...base, '--database', 'otra'],
    [...base, '--apply'], [...base, '--apply', '--confirm-tenant', 'otro'],
    [...base, '--apply', '--confirm-tenant', TENANT, '--run-dir', 'unused'],
    [...base, '--max-updates', '1'], [...base, '--page-size', '0'],
    [...base, '--page-size', '501'], [...base, '--collection', 'pagos'],
    [...base, '--apply', '--dry-run'], [...base, '--tenant', TENANT]]) {
    assert.throws(() => parseArgs(args));
  }
  const reconcileConfig = reconcile();
  assert.equal(reconcileConfig.reconcileOnly, true);
  assert.equal(reconcileConfig.apply, false);
  assert.equal(reconcileConfig.maxUpdates, null);
  for (const args of [[...base, '--reconcile-only'],
    [...base, '--reconcile-only', '--resume', 'run', '--apply'],
    [...base, '--reconcile-only', '--resume', 'run', '--dry-run'],
    [...base, '--reconcile-only', '--resume', 'run', '--max-updates', '5'],
    [...base, '--reconcile-only', '--resume', 'run', '--page-size', '1'],
    [...base, '--reconcile-only', '--resume', 'run', '--after-ventas', 'a'],
    [...base, '--reconcile-only', '--resume', 'run', '--run-dir', 'otro']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('tenant/proyecto inválidos abortan antes de inicializar el adaptador', async () => {
  let factories = 0;
  for (const args of [['--tenant', 'con/barra', '--project', PROJECT], ['--tenant', TENANT, '--project', 'otro']]) {
    await assert.rejects(main(args, { adapterFactory() { factories++; throw new Error('no debe entrar'); } }));
  }
  assert.equal(factories, 0);
  assert.throws(() => classify('ventas', sale('Nombre', { clienteId: 'otro' })));
  assert.throws(() => classify('pagos', sale()));
});

test('dry-run individual admite un tenant distinto de elgol y sigue aislado', async () => {
  const tenant = 'cliente-activo';
  const adapter = memoryAdapter({ ventas: {
    a: { clienteId: tenant, clienteNombre: 'Ana' },
    b: sale('Megan'),
  } });
  const result = await run(tenantDry(tenant), adapter, { log: silent });
  assert.equal(result.tenant, tenant);
  assert.equal(result.counts.ventas.examined, 1);
  assert.equal(result.counts.ventas.candidates, 1);
  assert.equal(result.writes, 0);
  assert.equal(adapter.tenantReads.length, 0);
  assert.ok(adapter.pages.every(page => page.tenant === tenant));
});

test('apply de tenant activo registrado valida identidad y procesa solo ese tenant', async () => {
  const tenant = 'cliente-activo';
  const config = tenantApply(tenant);
  const adapter = memoryAdapter({
    tenants: { [tenant]: { estado: 'activo' } },
    ventas: {
      a: { clienteId: tenant, clienteNombre: 'Ana' },
      b: sale('Megan'),
    },
  });
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(result.errors, 0);
  assert.equal(result.writes, 1);
  assert.deepEqual(adapter.tenantReads, [tenant]);
  assert.deepEqual(adapter.writes.map(write => write.id), ['a']);
  assert.equal(adapter.docs.ventas.get('a').data.clienteNombreBusqueda, 'ana');
  assert.equal(adapter.docs.ventas.get('b').data.clienteNombreBusqueda, undefined);
});

test('apply rechaza confirmación distinta antes de crear configuración ejecutable', () => {
  assert.throws(() => parseArgs([...tenantBase('cliente-activo'), '--apply',
    '--confirm-tenant', 'otro', '--max-updates', '1', '--run-dir', 'run']),
  /idéntico/);
});

test('apply rechaza tenant inexistente, suspendido, inactivo, sin estado, cancelado o con identidad anómala', async () => {
  const tenant = 'cliente-restringido';
  const cases = [
    { label: 'huérfano/inexistente', tenants: {}, pattern: /inexistente/ },
    { label: 'suspendido', tenants: { [tenant]: { estado: 'suspendido' } }, pattern: /no activo/ },
    { label: 'inactivo', tenants: { [tenant]: { estado: 'inactivo' } }, pattern: /no activo/ },
    { label: 'estado ausente', tenants: { [tenant]: {} }, pattern: /ausente/ },
    { label: 'suscripción cancelada', tenants: { [tenant]: { estado: 'activo', estadoSuscripcion: 'cancelado' } }, pattern: /cancelada/ },
    { label: 'identidad anómala', tenants: { [tenant]: { estado: 'activo', clienteId: 'otro' } }, pattern: /identidad/ },
  ];
  for (const current of cases) {
    const config = tenantApply(tenant);
    const adapter = memoryAdapter({ tenants: current.tenants,
      ventas: { a: { clienteId: tenant, clienteNombre: 'Ana' } } });
    const store = memoryStore(config);
    await assert.rejects(run(config, adapter, { store, log: silent }), current.pattern, current.label);
    assert.equal(adapter.writes.length, 0, current.label);
    assert.equal(store.state.reserved, 0, current.label);
    assert.equal(store.saved, undefined, current.label);
  }
});

test('validación apply exige document ID exacto y lectura canónica', async () => {
  const tenant = 'cliente-activo';
  const config = tenantApply(tenant);
  await assert.rejects(validateApplyTenant(config, {
    async readTenant() { return { id: 'otro', data: { estado: 'activo' } }; },
  }), /document ID/);
  await assert.rejects(validateApplyTenant(config, {}), /lectura canónica/);
  const adapter = memoryAdapter({ tenants: { [tenant]: { estado: 'activo' } } });
  const eligibility = await validateTenantEligibility(tenant, adapter);
  assert.equal(eligibility.id, tenant);
});

test('CLI aborta apply no autorizado antes de abrir el run-dir', async () => {
  const tenant = 'tenant-inexistente';
  const adapter = memoryAdapter({ tenants: {} });
  const originalOpen = fs.openSync;
  const originalMkdir = fs.mkdirSync;
  fs.openSync = () => { throw new Error('se intentó abrir un archivo local'); };
  fs.mkdirSync = () => { throw new Error('se intentó crear run-dir'); };
  try {
    await assert.rejects(main([...tenantBase(tenant), '--apply', '--confirm-tenant', tenant,
      '--max-updates', '1', '--run-dir', `unused-${tenant}`], {
      adapterFactory() { return adapter; },
    }), /inexistente/);
  } finally {
    fs.openSync = originalOpen;
    fs.mkdirSync = originalMkdir;
  }
  assert.equal(adapter.writes.length, 0);
});

test('checkpoint y run-dir quedan vinculados a un único tenant', () => {
  const first = tenantApply('tenant-uno');
  const second = tenantApply('tenant-dos');
  const state = initialState(first);
  assert.equal(state.tenant, 'tenant-uno');
  assert.throws(() => validateState(state, second), /Checkpoint incompatible/);
  assert.notEqual(first.runDir, second.runDir);
});

test('dry-run paginado no accede siquiera a métodos de escritura ni al store', async () => {
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale('Otro'), c: sale('No', { clienteId: 'otro' }) }, pedidos: { a: order() } });
  Object.defineProperty(adapter, 'update', { get() { throw new Error('dry-run intentó construir escritura'); } });
  const before = [...adapter.docs.ventas.values()].map(copy);
  const result = await run(dry(['--page-size', '1']), adapter, { log: silent,
    store: { save() { throw new Error('dry-run escribió checkpoint'); }, event() { throw new Error('dry-run escribió journal'); } } });
  assert.equal(result.writes, 0);
  assert.equal(result.errors, 0);
  assert.equal(result.complete, true);
  assert.equal(result.counts.ventas.examined, 2);
  assert.equal(result.counts.ventas.candidates, 2);
  assert.equal(result.counts.pedidos.candidates, 1);
  assert.deepEqual([...adapter.docs.ventas.values()], before);
  assert.deepEqual(adapter.pages.filter(p => p.c === 'ventas').map(p => p.cursor), [null, 'a', 'b']);
  assert.ok(adapter.pages.every(p => p.tenant === TENANT && p.size === 1));
});

test('apply solo cambia derivados, preserva otros campos y una segunda pasada es idempotente', async () => {
  const original = sale(' Ana ', { clienteId: TENANT, createdAt: 'fecha', updatedAt: 'original', pagos: [2],
    movimientos: ['m'], estado: 'activa', total: 99, pedidoRefId: 'p', produccion: { estado: 'pendiente' } });
  const adapter = memoryAdapter({ ventas: { a: original }, pedidos: { p: order(' Ana ', { ventaRefId: 'a' }) } });
  const config = apply();
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(result.writes, 2);
  assert.deepEqual(adapter.docs.ventas.get('a').data, { ...original, clienteNombreBusqueda: 'ana' });
  assert.deepEqual(adapter.docs.pedidos.get('p').data, order(' Ana ', { ventaRefId: 'a', clienteBusqueda: 'ana' }));
  assert.ok(adapter.writes.every(w => Object.keys(w.payload).length === 1));
  const second = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(second.writes, 0);
  assert.equal(second.counts.ventas.existing, 1);
  assert.equal(second.counts.pedidos.existing, 1);
});

test('max-updates limita ambas colecciones conjuntamente y marca recorrido incompleto', async () => {
  const config = { ...apply(), maxUpdates: 1 };
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale() }, pedidos: { a: order() } });
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(adapter.writes.length, 1);
  assert.equal(result.reserved, 1);
  assert.equal(result.stopReason, 'max-updates');
  assert.equal(result.complete, false);
  assert.equal(result.cursors.ventas, 'a');
});

test('conflicto: relee fuente y usa la versión actual', async () => {
  const config = apply();
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  adapter.beforeUpdate = () => { adapter.beforeUpdate = null; adapter.change('ventas', 'a', { clienteNombre: '  NUEVO  ' }); };
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(result.errors, 0);
  assert.equal(adapter.docs.ventas.get('a').data.clienteNombreBusqueda, 'nuevo');
  assert.equal(adapter.reads.length, 1);
  assert.equal(result.counts.ventas.conflicts, 1);
  assert.equal(result.reserved, 2);
});

test('conflicto: nunca pisa derivado concurrente ni escribe si la fuente se invalida', async () => {
  for (const changes of [{ clienteNombreBusqueda: 'valor de otro proceso' }, { clienteNombre: null }]) {
    const config = apply();
    const adapter = memoryAdapter({ ventas: { a: sale() } });
    adapter.beforeUpdate = () => { adapter.beforeUpdate = null; adapter.change('ventas', 'a', changes); };
    const result = await run(config, adapter, { store: memoryStore(config), log: silent });
    assert.equal(result.errors, 0);
    assert.equal(adapter.writes.length, 0);
    assert.equal(result.reserved, 1);
  }
});

test('conflicto: cambio de tenant aborta sin escribir ni avanzar cursor', async () => {
  const config = apply();
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  adapter.beforeUpdate = () => { adapter.beforeUpdate = null; adapter.change('ventas', 'a', { clienteId: 'otro' }); };
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(result.errors, 1);
  assert.equal(adapter.writes.length, 0);
  assert.equal(result.cursors.ventas, null);
});

test('documento eliminado concurrentemente no se recrea', async () => {
  const config = apply();
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  adapter.beforeUpdate = () => adapter.docs.ventas.delete('a');
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(result.errors, 0);
  assert.equal(result.counts.ventas.deleted, 1);
  assert.equal(adapter.docs.ventas.has('a'), false);
  assert.equal(adapter.writes.length, 0);
});

test('conflictos persistentes: reintentos acotados y cursor no adelantado', async () => {
  const config = { ...apply(), conflictRetries: 2 };
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  let attempts = 0;
  adapter.beforeUpdate = () => { attempts++; adapter.change('ventas', 'a', { otro: attempts }); };
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(attempts, 3);
  assert.equal(adapter.reads.length, 2);
  assert.equal(result.errors, 1);
  assert.equal(result.cursors.ventas, null);
  assert.equal(result.reserved, 3);
});

test('precondición fallida tras reintento interno del SDK no libera presupuesto', async () => {
  const config = { ...apply(), maxUpdates: 1 };
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale() } });
  const originalUpdate = adapter.update.bind(adapter);
  adapter.update = async (...args) => {
    await originalUpdate(...args); // El servidor aplicó el primer envío.
    throw Object.assign(new Error('reintento interno contra versión anterior'), { code: 9 });
  };
  const result = await run(config, adapter, { store: memoryStore(config), log: silent });
  assert.equal(result.reserved, 1);
  assert.equal(result.writes, 0); // No se atribuye un éxito no confirmado al CLI.
  assert.equal(adapter.writes.length, 1);
  assert.equal(result.counts.ventas.uncertain, 1);
  assert.equal(result.stopReason, 'max-updates');
  assert.equal(adapter.docs.ventas.get('b').data.clienteNombreBusqueda, undefined);
});

test('reanudar checkpoint entre páginas conserva totales y evita repetir escrituras', async () => {
  const config = { ...apply(), pageSize: 1, maxPages: 1 };
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale() }, pedidos: { a: order() } });
  const store = memoryStore(config);
  const first = await run(config, adapter, { store, log: silent });
  assert.equal(first.complete, false);
  assert.equal(first.cursors.ventas, 'a');
  const resumed = await run({ ...config, maxPages: null }, adapter, { store: memoryStore(config, store.saved), log: silent });
  assert.equal(resumed.complete, true);
  assert.equal(resumed.writes, 3);
  assert.equal(adapter.writes.length, 3);
});

test('reanuda un pending ya aplicado sin repetirlo y conserva max-updates acumulado', async () => {
  const config = { ...apply(), maxUpdates: 2 };
  const adapter = memoryAdapter({ ventas: {
    a: sale(' Ana ', { clienteNombreBusqueda: 'ana' }),
    b: sale(' Beto '),
    c: sale(' Carla '),
  } });
  const state = initialState(config);
  state.reserved = 1;
  state.pending = { collection: 'ventas', id: 'a', value: 'ana',
    before: { exists: false }, beforeUpdateTime: { seconds: 1, nanoseconds: 0 },
    attemptId: 'piloto-anterior' };
  const result = await run(config, adapter, { store: memoryStore(config, state), log: silent });
  assert.equal(result.pending, false);
  assert.equal(result.reserved, 2);
  assert.equal(result.counts.ventas.uncertain, 1);
  assert.equal(result.counts.ventas.existing, 1);
  assert.equal(result.writes, 1);
  assert.deepEqual(adapter.writes.map(write => write.id), ['b']);
  assert.equal(adapter.docs.ventas.get('a').data.clienteNombreBusqueda, 'ana');
  assert.equal(adapter.docs.ventas.get('c').data.clienteNombreBusqueda, undefined);
  assert.equal(result.stopReason, 'max-updates');
});

function pendingReconcileState(config) {
  const state = initialState({ ...config, maxUpdates: 5 });
  state.maxUpdates = 5;
  state.reserved = 1;
  state.cursors.ventas = 'cursor-ventas-previo';
  state.cursors.pedidos = 'cursor-pedidos-previo';
  state.pending = { collection: 'ventas', id: 'a', value: 'ana',
    before: { exists: false }, beforeUpdateTime: { seconds: 1, nanoseconds: 0 },
    attemptId: 'piloto-pending' };
  return state;
}

function strictlyReadOnly(adapter) {
  for (const method of ['page', 'update', 'set', 'create', 'delete', 'batch', 'transaction']) {
    Object.defineProperty(adapter, method, { configurable: true,
      get() { throw new Error(`reconcile-only accedió a ${method}`); } });
  }
  return adapter;
}

test('reconcile-only: valor esperado limpia pending sin reescribir ni continuar', async () => {
  const config = reconcile();
  const state = pendingReconcileState(config);
  const adapter = strictlyReadOnly(memoryAdapter({ ventas: {
    a: sale(' Ana ', { clienteNombreBusqueda: 'ana' }), b: sale('Beto'),
  } }));
  const store = memoryStore({ ...config, maxUpdates: 5 }, state);
  const result = await reconcileOnly(config, adapter, { store, log: silent });
  assert.equal(result.status, 'expected-value');
  assert.equal(result.reconciled, true);
  assert.equal(result.pending, false);
  assert.equal(result.reserved, 1);
  assert.equal(adapter.reads.length, 1);
  assert.deepEqual(adapter.reads[0], { c: 'ventas', id: 'a' });
  assert.equal(store.saved.counts.ventas.uncertain, 1);
  assert.deepEqual(store.saved.cursors, state.cursors);
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].status, 'expected-value');
});

test('reconcile-only: derivado ausente resuelve pending sin consumir reserva nueva', async () => {
  const config = reconcile();
  const state = pendingReconcileState(config);
  const adapter = strictlyReadOnly(memoryAdapter({ ventas: { a: sale(' Ana ') } }));
  const store = memoryStore({ ...config, maxUpdates: 5 }, state);
  const result = await reconcileOnly(config, adapter, { store, log: silent });
  assert.equal(result.status, 'still-absent');
  assert.equal(result.pending, false);
  assert.equal(result.reserved, 1);
  assert.equal(store.saved.reserved, 1);
  assert.deepEqual(store.saved.cursors, state.cursors);
});

test('reconcile-only: derivado diferente se registra y nunca se sobrescribe', async () => {
  const config = reconcile();
  const state = pendingReconcileState(config);
  const original = sale(' Ana ', { clienteNombreBusqueda: 'valor de otro proceso', updatedAt: 'intacto' });
  const adapter = strictlyReadOnly(memoryAdapter({ ventas: { a: original } }));
  const store = memoryStore({ ...config, maxUpdates: 5 }, state);
  const result = await reconcileOnly(config, adapter, { store, log: silent });
  assert.equal(result.status, 'different-value');
  assert.equal(result.reconciled, true);
  assert.equal(result.reserved, 1);
  assert.deepEqual(adapter.docs.ventas.get('a').data, original);
});

test('reconcile-only: documento eliminado se registra sin recrearlo', async () => {
  const config = reconcile();
  const state = pendingReconcileState(config);
  const adapter = strictlyReadOnly(memoryAdapter());
  const store = memoryStore({ ...config, maxUpdates: 5 }, state);
  const result = await reconcileOnly(config, adapter, { store, log: silent });
  assert.equal(result.status, 'deleted');
  assert.equal(result.reconciled, true);
  assert.equal(result.pending, false);
  assert.equal(result.reserved, 1);
  assert.equal(adapter.docs.ventas.size, 0);
});

test('reconcile-only: tenant inesperado es anomalía y conserva checkpoint intacto', async () => {
  const config = reconcile();
  const state = pendingReconcileState(config);
  const adapter = strictlyReadOnly(memoryAdapter({ ventas: {
    a: sale(' Ana ', { clienteId: 'otro', clienteNombreBusqueda: 'ana' }),
  } }));
  const store = memoryStore({ ...config, maxUpdates: 5 }, state);
  const result = await reconcileOnly(config, adapter, { store, log: silent });
  assert.equal(result.status, 'tenant-mismatch');
  assert.equal(result.reconciled, false);
  assert.equal(result.pending, true);
  assert.equal(result.reserved, 1);
  assert.equal(store.events.length, 0);
  assert.equal(store.saved, undefined);
  assert.deepEqual(store.state, state);
});

test('reconcile-only: fuente cambiada o inválida conserva pending como conflicto', async () => {
  for (const source of ['Beatriz', null]) {
    const config = reconcile();
    const state = pendingReconcileState(config);
    const adapter = strictlyReadOnly(memoryAdapter({ ventas: {
      a: sale(source, { clienteNombreBusqueda: 'ana' }),
    } }));
    const store = memoryStore({ ...config, maxUpdates: 5 }, state);
    const result = await reconcileOnly(config, adapter, { store, log: silent });
    assert.equal(result.status, source === null ? 'invalid-source' : 'source-changed');
    assert.equal(result.reconciled, false);
    assert.equal(result.pending, true);
    assert.equal(store.events.length, 0);
  }
});

test('reconcile-only: checkpoint sin pending termina sin leer Firestore', async () => {
  const config = reconcile();
  const state = initialState({ ...config, maxUpdates: 5 });
  state.maxUpdates = 5;
  const adapter = { get read() { throw new Error('no debe leer sin pending'); } };
  const store = memoryStore({ ...config, maxUpdates: 5 }, state);
  const result = await reconcileOnly(config, adapter, { store, log: silent });
  assert.equal(result.status, 'no-pending');
  assert.equal(result.reconciled, false);
  assert.equal(result.reserved, 0);
  assert.equal(store.saved, undefined);
  assert.equal(store.events.length, 0);
});

test('respuesta perdida: reserva durable antes de enviar y reanudación conservadora', async () => {
  const config = { ...apply(), maxUpdates: 2 };
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale() } });
  const store = memoryStore(config);
  const originalUpdate = adapter.update.bind(adapter);
  let loseResponse = true;
  adapter.update = async (...args) => {
    assert.ok(store.saved.pending);
    assert.ok(store.saved.reserved >= 1);
    const result = await originalUpdate(...args);
    if (loseResponse) { loseResponse = false; throw Object.assign(new Error('respuesta perdida'), { code: 14 }); }
    return result;
  };
  const first = await run(config, adapter, { store, log: silent });
  assert.equal(first.errors, 1);
  assert.equal(first.pending, true);
  assert.equal(first.writes, 0);
  assert.equal(store.saved.reserved, 1);
  const resumedStore = memoryStore(config, store.saved);
  const resumed = await run(config, adapter, { store: resumedStore, log: silent });
  assert.equal(adapter.writes.length, 2);
  assert.equal(resumed.reserved, 2);
  assert.equal(resumed.counts.ventas.uncertain, 1);
  assert.equal(resumed.writes, 1); // Solo éxitos confirmados; no inventar autoría de a.
  assert.equal(resumed.pending, false);
});

test('dry-run parcial ofrece cursores y no presenta la muestra como recorrido completo', async () => {
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale() } });
  const result = await run(dry(['--page-size', '1', '--max-pages', '1']), adapter, { log: silent });
  assert.equal(result.complete, false);
  assert.equal(result.cursors.ventas, 'a');
  const next = await run(dry(['--after-ventas', 'a']), adapter, { log: silent });
  assert.equal(next.partialStart, true);
  assert.equal(next.counts.ventas.examined, 1);
});

test('error de lectura e interrupción no se reportan como éxito completo', async () => {
  const adapter = memoryAdapter();
  adapter.page = async () => { throw new Error('lectura simulada fallida'); };
  const failed = await run(dry(), adapter, { log: silent });
  assert.equal(failed.errors, 1);
  assert.equal(failed.complete, false);
  const stopped = await run(dry(), adapter, { log: silent, shouldStop: () => true });
  assert.equal(stopped.errors, 0);
  assert.equal(stopped.stopReason, 'interrumpido');
});

test('fallo al guardar intención impide enviar escritura', async () => {
  const config = apply();
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  const store = memoryStore(config);
  store.save = () => { throw new Error('disco lleno simulado'); };
  const result = await run(config, adapter, { store, log: silent });
  assert.equal(result.errors, 1);
  assert.equal(adapter.writes.length, 0);
  assert.equal(result.cursors.ventas, null);
});

test('checkpoint con reservas inconsistentes aborta', () => {
  const config = apply();
  const state = initialState(config);
  state.counts.ventas.updated = 1;
  assert.throws(() => validateState(state, config), /reservas/);
});

test('resumen dry-run incluye alcance, conteos, omisiones, errores y cero escrituras', async () => {
  const adapter = memoryAdapter({ ventas: { a: sale(), b: sale('', {}), c: sale('A', { clienteNombreBusqueda: null }),
    d: sale('A', { clienteNombreBusqueda: 'a' }) }, pedidos: { a: order() } });
  const result = await run(dry(), adapter, { log: silent });
  const lines = [];
  printReport(result, line => lines.push(line));
  const output = lines.join('\n');
  for (const fragment of [PROJECT, '(default)', TENANT, 'DRY-RUN', 'Ventas examinadas: 4', 'Ventas candidatas: 1',
    'Pedidos examinados: 1', 'Pedidos candidatos: 1', 'Omitidos por derivado existente: 1',
    'Omitidos por fuente inválida: 1', 'Omitidos por tipo inesperado: 1', 'Errores: 0',
    'Escrituras realizadas: 0', 'Recorrido completo: sí']) assert.ok(output.includes(fragment), fragment);
  assert.equal(Object.keys(require.cache).some(file => /[\\/]firebase-admin[\\/]/.test(file)), false);
});

test('adaptador: consulta acotada y update con máscara de un campo + lastUpdateTime', async () => {
  const { Timestamp, WriteResult } = require('firebase-admin/firestore');
  const calls = [];
  const snapshotUpdateTime = new Timestamp(123, 456000000);
  const serverWriteTime = new Timestamp(124, 0);
  const nativeWriteResult = new WriteResult(serverWriteTime);
  assert.equal(nativeWriteResult.writeTime, serverWriteTime);
  assert.equal(nativeWriteResult.updateTime, undefined);
  const query = {};
  for (const method of ['where', 'orderBy', 'select', 'limit', 'startAfter']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.get = async () => ({ docs: [{ exists: true, id: 'doc-a', data: () => sale(),
    updateTime: snapshotUpdateTime }] });
  query.doc = id => ({
    update: async (...args) => {
      calls.push(['update', id, ...args]);
      return nativeWriteResult;
    },
    get: async () => {
      calls.push(['get', id]);
      return { exists: true, id, data: () => ({ estado: 'activo' }) };
    },
  });
  const db = { collection(c) { calls.push(['collection', c]); return query; } };
  const adapter = createAdapter(db, { documentId: () => '__name__' });
  const documents = await adapter.page('ventas', TENANT, 'cursor', 10);
  assert.deepEqual(calls, [['collection', 'ventas'], ['where', 'clienteId', '==', TENANT],
    ['orderBy', '__name__'], ['select', 'clienteId', 'clienteNombre', 'clienteNombreBusqueda'], ['limit', 10], ['startAfter', 'cursor']]);
  assert.equal(documents[0].updateTime, snapshotUpdateTime);
  const result = await adapter.update('ventas', 'a', 'clienteNombreBusqueda', 'ana', snapshotUpdateTime);
  assert.equal(result, nativeWriteResult);
  assert.deepEqual(calls.at(-1), ['update', 'a', { clienteNombreBusqueda: 'ana' },
    { lastUpdateTime: snapshotUpdateTime }]);
  const tenant = await adapter.readTenant(TENANT);
  assert.deepEqual(tenant, { id: TENANT, data: { estado: 'activo' } });
  assert.deepEqual(calls.slice(-2), [['collection', 'clientes-saas'], ['get', TENANT]]);
  await assert.rejects(adapter.update('ventas', 'a', 'updatedAt', 'x', snapshotUpdateTime));
  await assert.rejects(adapter.update('ventas', 'a', 'clienteNombreBusqueda', 'x', null));
  await assert.rejects(adapter.page('pagos', TENANT, null, 10));
  await assert.rejects(adapter.page('ventas', 'con/barra', null, 10));
});

test('adaptador reconcile-only expone exclusivamente lectura documental', async () => {
  const { Timestamp } = require('firebase-admin/firestore');
  const updateTime = new Timestamp(10, 20);
  const calls = [];
  const document = { get: async () => {
    calls.push('get');
    return { exists: true, id: 'a', data: () => sale('Ana'), updateTime };
  } };
  const db = { collection(name) { calls.push(['collection', name]); return {
    doc(id) { calls.push(['doc', id]); return document; },
  }; } };
  const adapter = createReadAdapter(db);
  assert.deepEqual(Object.keys(adapter), ['read']);
  const result = await adapter.read('ventas', 'a');
  assert.equal(result.updateTime, updateTime);
  assert.deepEqual(calls, [['collection', 'ventas'], ['doc', 'a'], 'get']);
  await assert.rejects(adapter.read('pagos', 'a'));
});

test('éxito usa WriteResult.writeTime, registra applied y limpia pending', async () => {
  const config = apply();
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  const store = memoryStore(config);
  const result = await run(config, adapter, { store, log: silent });
  assert.equal(result.errors, 0);
  assert.equal(result.writes, 1);
  assert.equal(result.pending, false);
  assert.equal(store.saved.pending, null);
  const applied = store.events.find(event => event.type === 'applied');
  assert.deepEqual(applied.afterWriteTime, { seconds: 2, nanoseconds: 0 });
  assert.equal(applied.afterUpdateTime, undefined);
});

test('snapshot sin updateTime válido falla antes de reservar o enviar escritura', async () => {
  const config = apply();
  const adapter = memoryAdapter({ ventas: { a: sale() } });
  adapter.docs.ventas.get('a').updateTime = null;
  const store = memoryStore(config);
  const result = await run(config, adapter, { store, log: silent });
  assert.equal(result.errors, 1);
  assert.equal(result.reserved, 0);
  assert.equal(result.pending, false);
  assert.equal(adapter.writes.length, 0);
  assert.match(result.stopReason, /Snapshot\.updateTime inválido/);
});

test('registro local: bloqueo, checkpoint durable y validación al reanudar', () => {
  const parent = path.join(__dirname, 'node_modules', '.cache', 'backfill-tests');
  fs.mkdirSync(parent, { recursive: true });
  const temp = fs.mkdtempSync(path.join(parent, 'run-'));
  const config = { ...apply(), runDir: path.join(temp, 'execution') };
  let store;
  try {
    store = openStore(config);
    store.state.cursors.ventas = 'a';
    store.save(store.state);
    store.event({ type: 'test-local' });
    assert.throws(() => openStore({ ...config, resume: true }), /EEXIST/);
    store.close(); store = null;
    assert.throws(() => openStore({ ...config, resume: true, maxUpdates: 999 }), /Checkpoint incompatible/);
    store = openStore({ ...config, resume: true });
    assert.equal(store.state.cursors.ventas, 'a');
    assert.equal(JSON.parse(fs.readFileSync(path.join(config.runDir, 'journal.jsonl'), 'utf8')).type, 'test-local');
  } finally {
    if (store) store.close();
    // Solo el directorio temporal generado por esta prueba, nunca datos Firestore.
    assert.equal(path.dirname(temp), parent);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
