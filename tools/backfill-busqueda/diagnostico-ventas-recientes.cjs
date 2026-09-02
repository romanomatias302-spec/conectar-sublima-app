'use strict';

const PROJECT = 'conectarsublimados-7881e';
const DATABASE = '(default)';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_OUTPUT_LIMIT = 20;
const ARGENTINA_OFFSET = '-03:00';
const FIXED_AUGUST_CUTOFF = '2026-08-31';
const FIXED_SEPTEMBER_CUTOFF = '2026-09-01';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function usage() {
  return [
    'Diagnóstico de ventas candidatas recientes (Firestore: solo lectura).',
    '',
    'Uso:',
    '  node diagnostico-ventas-recientes.cjs --project conectarsublimados-7881e --page-size 100 --since 2026-08-31 [--limit-output 20]',
    '',
    'Opciones:',
    '  --project       Debe ser conectarsublimados-7881e.',
    '  --page-size     Documentos por página, entre 1 y 500.',
    '  --since         Fecha local de Argentina, formato YYYY-MM-DD.',
    '  --limit-output  Filas impresas; no limita el recorrido, entre 1 y 500.',
    '  --help          Muestra esta ayuda sin cargar Firebase Admin.',
  ].join('\n');
}

function parseInteger(value, flag, minimum, maximum) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${flag}: debe ser un entero.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag}: debe estar entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function parseDate(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(`${flag}: usar formato YYYY-MM-DD.`);
  }
  const instant = new Date(`${value}T00:00:00.000${ARGENTINA_OFFSET}`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw new Error(`${flag}: fecha inválida.`);
  }
  return instant;
}

function parseArgs(argv) {
  const valueFlags = new Set(['--project', '--page-size', '--since', '--limit-output']);
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') {
      if (argv.length !== 1) throw new Error('--help debe usarse solo.');
      return { help: true };
    }
    if (!valueFlags.has(flag) || hasOwn(options, flag)) {
      throw new Error(`Argumento desconocido o repetido: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Falta valor para ${flag}.`);
    options[flag] = value;
    index += 1;
  }

  if (options['--project'] !== PROJECT) {
    throw new Error(`Proyecto obligatorio y único autorizado: ${PROJECT}.`);
  }
  if (!options['--since']) throw new Error('--since es obligatorio.');

  return {
    help: false,
    project: PROJECT,
    database: DATABASE,
    pageSize: parseInteger(options['--page-size'] || DEFAULT_PAGE_SIZE, '--page-size', 1, 500),
    sinceText: options['--since'],
    since: parseDate(options['--since'], '--since'),
    outputLimit: parseInteger(
      options['--limit-output'] || DEFAULT_OUTPUT_LIMIT,
      '--limit-output',
      1,
      500
    ),
  };
}

function tenantName(data) {
  for (const field of ['nombreVisible', 'nombre', 'nombreCliente']) {
    if (typeof data[field] === 'string' && data[field].trim()) return data[field].trim();
  }
  return null;
}

function tenantRecord(snapshot) {
  const data = snapshot.data();
  const identityMismatch = hasOwn(data, 'clienteId') && data.clienteId !== snapshot.id;
  return {
    clienteId: snapshot.id,
    nombre: tenantName(data),
    eligible:
      data.estado === 'activo' &&
      data.estadoSuscripcion !== 'cancelado' &&
      !identityMismatch,
  };
}

function derivedState(data) {
  if (!hasOwn(data, 'clienteNombreBusqueda')) {
    return { code: 'AUSENTE', type: 'undefined', value: null };
  }
  const value = data.clienteNombreBusqueda;
  if (typeof value !== 'string') {
    return {
      code: 'TIPO_INESPERADO',
      type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
      value,
    };
  }
  if (!value.trim()) return { code: 'VACÍO', type: 'string', value };
  return { code: 'EXISTENTE', type: 'string', value };
}

function validSource(data) {
  return typeof data.clienteNombre === 'string' && Boolean(data.clienteNombre.trim());
}

function timestampToIso(value) {
  if (!value || typeof value.toDate !== 'function') return null;
  const date = value.toDate();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function reportRow(snapshot, tenant, since) {
  const data = snapshot.data();
  const createdAt = timestampToIso(data.createdAt);
  return {
    documentId: snapshot.id,
    clienteId: data.clienteId,
    tenantNombre: tenant.nombre,
    numeroVenta: data.numeroVenta ?? null,
    clienteNombre: data.clienteNombre,
    clienteNombreBusqueda: derivedState(data),
    createdAt,
    desdeFechaSolicitada: createdAt !== null && Date.parse(createdAt) >= since.getTime(),
    updateTime: timestampToIso(snapshot.updateTime),
    origenVenta: data.origenVenta ?? null,
    pedidoRefId: data.pedidoRefId || null,
    pedidoVisibleId: data.pedidoVisibleId || null,
  };
}

function timeValue(row) {
  return row.createdAt === null ? Number.NEGATIVE_INFINITY : Date.parse(row.createdAt);
}

function sortNewestFirst(rows) {
  rows.sort((left, right) => {
    const byCreation = timeValue(right) - timeValue(left);
    if (byCreation !== 0) return byCreation;
    const byWrite = String(right.updateTime || '').localeCompare(String(left.updateTime || ''));
    return byWrite || left.documentId.localeCompare(right.documentId);
  });
}

function createReadOnlyAdapter(db, FieldPath, pageSize) {
  async function page(collectionName, fields, cursor) {
    let firestoreQuery = db
      .collection(collectionName)
      .orderBy(FieldPath.documentId())
      .select(...fields)
      .limit(pageSize);
    if (cursor !== null) firestoreQuery = firestoreQuery.startAfter(cursor);
    return (await firestoreQuery.get()).docs;
  }

  return Object.freeze({
    pageTenants(cursor) {
      return page(
        'clientes-saas',
        ['clienteId', 'nombreVisible', 'nombre', 'nombreCliente', 'estado', 'estadoSuscripcion'],
        cursor
      );
    },
    pageSales(cursor) {
      return page(
        'ventas',
        [
          'clienteId',
          'numeroVenta',
          'clienteNombre',
          'clienteNombreBusqueda',
          'createdAt',
          'origenVenta',
          'pedidoRefId',
          'pedidoVisibleId',
        ],
        cursor
      );
    },
  });
}

async function collectAll(pageFunction, label, errors) {
  const documents = [];
  let cursor = null;
  let pages = 0;
  let complete = false;

  try {
    for (;;) {
      const page = await pageFunction(cursor);
      pages += 1;
      documents.push(...page);
      if (page.length === 0 || page.length < pageFunction.pageSize) {
        complete = true;
        break;
      }
      cursor = page[page.length - 1].id;
    }
  } catch (error) {
    errors.push({ collection: label, cursor, message: String(error.message || error) });
  }

  return { documents, pages, complete };
}

function bindPage(adapterFunction, pageSize) {
  const bound = cursor => adapterFunction(cursor);
  bound.pageSize = pageSize;
  return bound;
}

async function runDiagnostic(config, adapter) {
  const errors = [];
  const tenantScan = await collectAll(
    bindPage(adapter.pageTenants, config.pageSize),
    'clientes-saas',
    errors
  );
  const tenantEntries = tenantScan.documents.map(snapshot => {
    const tenant = tenantRecord(snapshot);
    return [tenant.clienteId, tenant];
  });
  const tenants = new Map(tenantEntries);

  const salesScan = await collectAll(
    bindPage(adapter.pageSales, config.pageSize),
    'ventas',
    errors
  );
  const candidates = [];
  let unexpectedDerived = 0;

  for (const snapshot of salesScan.documents) {
    const data = snapshot.data();
    const tenant = typeof data.clienteId === 'string' ? tenants.get(data.clienteId) : null;
    if (!tenant?.eligible) continue;

    const state = derivedState(data);
    if (state.code === 'TIPO_INESPERADO') {
      unexpectedDerived += 1;
      continue;
    }
    if (!validSource(data) || (state.code !== 'AUSENTE' && state.code !== 'VACÍO')) continue;
    candidates.push(reportRow(snapshot, tenant, config.since));
  }

  sortNewestFirst(candidates);
  const augustCutoff = parseDate(FIXED_AUGUST_CUTOFF, 'fecha interna');
  const septemberCutoff = parseDate(FIXED_SEPTEMBER_CUTOFF, 'fecha interna');
  const validCreation = row => row.createdAt !== null;

  return {
    project: config.project,
    database: config.database,
    since: config.sinceText,
    complete: {
      clientesSaas: tenantScan.complete,
      ventas: salesScan.complete,
    },
    pages: {
      clientesSaas: tenantScan.pages,
      ventas: salesScan.pages,
    },
    examined: {
      tenants: tenantScan.documents.length,
      sales: salesScan.documents.length,
    },
    summary: {
      activeCandidates: candidates.length,
      candidatesSinceAugust31: candidates.filter(
        row => validCreation(row) && timeValue(row) >= augustCutoff.getTime()
      ).length,
      candidatesSinceSeptember1: candidates.filter(
        row => validCreation(row) && timeValue(row) >= septemberCutoff.getTime()
      ).length,
      candidatesWithoutValidCreatedAt: candidates.filter(row => !validCreation(row)).length,
      missingDerived: candidates.filter(row => row.clienteNombreBusqueda.code === 'AUSENTE').length,
      emptyDerived: candidates.filter(row => row.clienteNombreBusqueda.code === 'VACÍO').length,
      unexpectedDerived,
      errors: errors.length,
    },
    definitive: tenantScan.complete && salesScan.complete && errors.length === 0,
    rows: candidates.slice(0, config.outputLimit),
    totalRowsAvailable: candidates.length,
    errors,
  };
}

function printReport(result, log = console.log) {
  const summary = result.summary;
  log(`Proyecto: ${result.project}`);
  log(`Base: ${result.database}`);
  log(`Fecha solicitada: ${result.since} 00:00:00 ${ARGENTINA_OFFSET}`);
  log(`Tenants examinados: ${result.examined.tenants} (${result.pages.clientesSaas} páginas)`);
  log(`Ventas examinadas: ${result.examined.sales} (${result.pages.ventas} páginas)`);
  log(`Recorrido completo clientes-saas: ${result.complete.clientesSaas ? 'sí' : 'no'}`);
  log(`Recorrido completo ventas: ${result.complete.ventas ? 'sí' : 'no'}`);
  log(`Totales definitivos: ${result.definitive ? 'sí' : 'no'}`);
  log('');
  log('RESUMEN');
  log(`Total candidatas activas observadas: ${summary.activeCandidates}`);
  log(`Candidatas creadas desde 2026-08-31: ${summary.candidatesSinceAugust31}`);
  log(`Candidatas creadas desde 2026-09-01: ${summary.candidatesSinceSeptember1}`);
  log(`Candidatas sin createdAt válido: ${summary.candidatesWithoutValidCreatedAt}`);
  log(`Candidatas con derivado ausente: ${summary.missingDerived}`);
  log(`Candidatas con derivado vacío: ${summary.emptyDerived}`);
  log(`Derivado con tipo inesperado: ${summary.unexpectedDerived}`);
  log(`Errores: ${summary.errors}`);
  log('');
  log(`CANDIDATAS MÁS RECIENTES (${result.rows.length} de ${result.totalRowsAvailable})`);

  for (const row of result.rows) {
    log(JSON.stringify(row, null, 2));
  }
  if (!result.rows.length) log('(ninguna)');

  for (const error of result.errors) {
    log(`ERROR: colección=${error.collection}; cursor=${error.cursor || '-'}; detalle=${error.message}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv);
  if (config.help) {
    console.log(usage());
    return 0;
  }

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Emulador detectado: el destino debe ser el proyecto real explícito.');
  }

  // Firebase Admin y ADC se cargan únicamente después de validar todo el CLI.
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldPath } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: config.project, credential: applicationDefault() });
  const db = getFirestore(app, config.database);

  try {
    const adapter = createReadOnlyAdapter(db, FieldPath, config.pageSize);
    const result = await runDiagnostic(config, adapter);
    printReport(result);
    return result.definitive ? 0 : 2;
  } finally {
    await db.terminate();
  }
}

module.exports = {
  parseArgs,
  derivedState,
  tenantRecord,
  runDiagnostic,
  printReport,
  createReadOnlyAdapter,
};

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`Abortado: ${error.message || error}`);
    process.exitCode = 1;
  });
}
