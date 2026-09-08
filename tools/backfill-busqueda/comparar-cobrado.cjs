'use strict';

const PROJECT = 'conectarsublimados-7881e';
const DATABASE = '(default)';
const DEFAULT_PAGE_SIZE = 100;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function usage() {
  return [
    'Comparación read-only del total cobrado por un tenant y período.',
    '',
    'Uso:',
    `  node comparar-cobrado.cjs --project ${PROJECT} --tenant CLIENTE_ID --from YYYY-MM-DD --to YYYY-MM-DD --page-size 100`,
    '',
    'Compara el recorrido histórico ventas + pagos con collectionGroup("pagos").',
    'No posee modo de escritura ni genera archivos locales.',
  ].join('\n');
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function documentId(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.includes('/')) {
    throw new Error('--tenant: document ID inválido.');
  }
  return value;
}

function parsePageSize(value) {
  if (!/^\d+$/.test(String(value))) throw new Error('--page-size debe ser un entero.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error('--page-size debe estar entre 1 y 500.');
  }
  return parsed;
}

function parseArgs(argv) {
  const valued = new Set(['--project', '--tenant', '--from', '--to', '--page-size']);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help') {
      if (argv.length !== 1) throw new Error('--help debe usarse solo.');
      return { help: true };
    }
    if (!valued.has(key) || hasOwn(options, key)) {
      throw new Error(`Argumento desconocido o repetido: ${key}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Falta valor para ${key}.`);
    options[key] = value;
  }
  if (options['--project'] !== PROJECT) throw new Error(`Proyecto obligatorio: ${PROJECT}.`);
  if (!validIsoDate(options['--from']) || !validIsoDate(options['--to'])) {
    throw new Error('--from y --to deben usar fechas reales YYYY-MM-DD.');
  }
  if (options['--from'] > options['--to']) throw new Error('--from no puede ser posterior a --to.');
  return {
    help: false,
    project: PROJECT,
    database: DATABASE,
    tenant: documentId(options['--tenant']),
    from: options['--from'],
    to: options['--to'],
    endExclusive: shiftIsoDate(options['--to'], 1),
    pageSize: parsePageSize(options['--page-size'] || DEFAULT_PAGE_SIZE),
  };
}

function normalizedState(value) {
  return String(value || '').trim().toLowerCase();
}

function activePayment(payment) {
  return normalizedState(payment?.estadoPagoRegistro || 'activo') === 'activo' &&
    payment?.anulado !== true && payment?.activo !== false;
}

function dateInPeriod(value, from, to) {
  return validIsoDate(value) && value >= from && value <= to;
}

function addPayment(summary, payment, config) {
  if (!activePayment(payment) || !dateInPeriod(payment?.fechaPago, config.from, config.to)) return;
  summary.activePaymentCount += 1;
  summary.totalCollected += Number(payment?.monto) || 0;
}

async function collectOldMethod(config, adapter) {
  const summary = { activePaymentCount: 0, totalCollected: 0, salesExamined: 0, paymentsExamined: 0 };
  let saleCursor = null;
  do {
    const page = await adapter.readSalesPage({ tenant: config.tenant, pageSize: config.pageSize, after: saleCursor });
    for (const sale of page.documents) {
      summary.salesExamined += 1;
      if (sale.data.clienteId !== config.tenant) continue;
      const payments = [];
      let paymentCursor = null;
      do {
        const paymentPage = await adapter.readSalePaymentsPage({
          saleId: sale.id, pageSize: config.pageSize, after: paymentCursor,
        });
        payments.push(...paymentPage.documents);
        paymentCursor = paymentPage.nextCursor;
      } while (paymentCursor);

      if (payments.length) {
        for (const payment of payments) {
          summary.paymentsExamined += 1;
          if (payment.data.clienteId && payment.data.clienteId !== config.tenant) continue;
          addPayment(summary, payment.data, config);
        }
      } else if (Array.isArray(sale.data.pagos)) {
        for (const payment of sale.data.pagos) {
          summary.paymentsExamined += 1;
          addPayment(summary, payment, config);
        }
      }
    }
    saleCursor = page.nextCursor;
  } while (saleCursor);
  return summary;
}

async function collectNewMethod(config, adapter) {
  const summary = { activePaymentCount: 0, totalCollected: 0, paymentsExamined: 0 };
  let cursor = null;
  do {
    const page = await adapter.readActivePaymentsGroupPage({
      tenant: config.tenant,
      from: config.from,
      endExclusive: config.endExclusive,
      pageSize: config.pageSize,
      after: cursor,
    });
    for (const payment of page.documents) {
      summary.paymentsExamined += 1;
      if (payment.data.clienteId !== config.tenant) continue;
      addPayment(summary, payment.data, config);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return summary;
}

async function compareCollected(config, adapter) {
  const [oldMethod, newMethod] = await Promise.all([
    collectOldMethod(config, adapter), collectNewMethod(config, adapter),
  ]);
  return {
    oldMethod,
    newMethod,
    difference: {
      activePaymentCount: newMethod.activePaymentCount - oldMethod.activePaymentCount,
      totalCollected: newMethod.totalCollected - oldMethod.totalCollected,
    },
    equivalent: oldMethod.activePaymentCount === newMethod.activePaymentCount &&
      oldMethod.totalCollected === newMethod.totalCollected,
  };
}

function plainDocuments(snapshot) {
  return snapshot.docs.map(document => ({ id: document.id, data: document.data() }));
}

function createReadOnlyAdminAdapter(db, FieldPath) {
  return Object.freeze({
    async readSalesPage({ tenant, pageSize, after }) {
      let query = db.collection('ventas')
        .where('clienteId', '==', tenant)
        .orderBy(FieldPath.documentId())
        .limit(pageSize);
      if (after) query = query.startAfter(after);
      const snapshot = await query.get();
      return {
        documents: plainDocuments(snapshot),
        nextCursor: snapshot.size === pageSize ? snapshot.docs.at(-1) : null,
      };
    },
    async readSalePaymentsPage({ saleId, pageSize, after }) {
      let query = db.collection('ventas').doc(saleId).collection('pagos')
        .orderBy(FieldPath.documentId())
        .limit(pageSize);
      if (after) query = query.startAfter(after);
      const snapshot = await query.get();
      return {
        documents: plainDocuments(snapshot),
        nextCursor: snapshot.size === pageSize ? snapshot.docs.at(-1) : null,
      };
    },
    async readActivePaymentsGroupPage({ tenant, from, endExclusive, pageSize, after }) {
      let query = db.collectionGroup('pagos')
        .where('clienteId', '==', tenant)
        .where('estadoPagoRegistro', '==', 'activo')
        .where('fechaPago', '>=', from)
        .where('fechaPago', '<', endExclusive)
        .orderBy('fechaPago', 'asc')
        .limit(pageSize);
      if (after) query = query.startAfter(after);
      const snapshot = await query.get();
      return {
        documents: plainDocuments(snapshot),
        nextCursor: snapshot.size === pageSize ? snapshot.docs.at(-1) : null,
      };
    },
  });
}

function printResult(config, result, log = console.log) {
  log(`Tenant: ${config.tenant}`);
  log(`Período: ${config.from} a ${config.to}, inclusive`);
  log(`Método viejo — pagos activos: ${result.oldMethod.activePaymentCount}; total cobrado: ${result.oldMethod.totalCollected}`);
  log(`Método nuevo — pagos activos: ${result.newMethod.activePaymentCount}; total cobrado: ${result.newMethod.totalCollected}`);
  log(`Diferencia — pagos activos: ${result.difference.activePaymentCount}; total cobrado: ${result.difference.totalCollected}`);
  log(`Equivalencia: ${result.equivalent ? 'SÍ' : 'NO'}`);
}

async function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv);
  if (config.help) {
    console.log(usage());
    return 0;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador no permitido.');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore, FieldPath } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: config.project, credential: applicationDefault() });
  const db = getFirestore(app, config.database);
  try {
    const result = await compareCollected(config, createReadOnlyAdminAdapter(db, FieldPath));
    printResult(config, result);
    return result.equivalent ? 0 : 2;
  } finally {
    await db.terminate();
  }
}

module.exports = {
  PROJECT, DATABASE, parseArgs, validIsoDate, shiftIsoDate, activePayment,
  collectOldMethod, collectNewMethod, compareCollected, createReadOnlyAdminAdapter,
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Error: ${error.message || error}`);
    process.exitCode = 1;
  });
}
