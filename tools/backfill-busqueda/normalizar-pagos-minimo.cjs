'use strict';

const PROJECT = 'conectarsublimados-7881e';
const DATABASE = '(default)';
const TENANT = 'elgol';
const SALE_ID = '39iO7tiIMJa9k2X3K8Vw';
const CONFIRMATION = 'elgol:3-pagos-anulados';
const PAYMENT_IDS = Object.freeze([
  'ICYOFj9oi7vZSPb1kwC7',
  'KW3vecpp6BMBYveP2K9Q',
  'oP0yX3PUyJVs0B2hB4SK',
]);
const EXPECTED = Object.freeze({
  clienteId: TENANT,
  ventaRefId: SALE_ID,
  monto: 100,
  fechaPago: '2026-03-26',
});
const DESIRED = Object.freeze({ ventaId: SALE_ID, estadoPagoRegistro: 'anulado' });

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function usage() {
  return [
    'Normalización mínima y cerrada de tres pagos históricos de elgol.',
    '',
    'Dry-run (predeterminado):',
    `  node normalizar-pagos-minimo.cjs --project ${PROJECT}`,
    '',
    'Apply futuro (requiere autorización separada):',
    `  node normalizar-pagos-minimo.cjs --project ${PROJECT} --apply --confirm ${CONFIRMATION}`,
    '',
    'No acepta tenant, venta, pago, campos ni valores configurables.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {};
  const flags = new Set(['--apply', '--help']);
  const values = new Set(['--project', '--confirm']);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if ((!flags.has(key) && !values.has(key)) || hasOwn(options, key)) {
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
  const apply = options['--apply'] === true;
  if (apply && options['--confirm'] !== CONFIRMATION) {
    throw new Error(`--apply exige --confirm ${CONFIRMATION}.`);
  }
  if (!apply && hasOwn(options, '--confirm')) throw new Error('--confirm solo se admite con --apply.');
  return { help: false, project: PROJECT, database: DATABASE, apply };
}

function validateSale(snapshot) {
  if (!snapshot?.exists) throw new Error(`La venta ${SALE_ID} no existe.`);
  const data = snapshot.data || {};
  if (data.clienteId !== TENANT) throw new Error('La venta padre no pertenece a elgol.');
  if (data.estadoVenta !== 'anulada') throw new Error('La venta padre ya no está anulada.');
  return { clienteId: data.clienteId, estadoVenta: data.estadoVenta };
}

function validatePayment(snapshot, paymentId) {
  if (!PAYMENT_IDS.includes(paymentId)) throw new Error(`Pago fuera del allowlist: ${paymentId}.`);
  if (!snapshot?.exists) throw new Error(`El pago ${paymentId} no existe.`);
  if (!snapshot.updateTime) throw new Error(`El pago ${paymentId} no posee updateTime utilizable.`);
  const data = snapshot.data || {};
  for (const [field, expected] of Object.entries(EXPECTED)) {
    if (data[field] !== expected) {
      throw new Error(`${paymentId}: precondición ${field} cambió.`);
    }
  }
  const changes = {};
  for (const [field, desired] of Object.entries(DESIRED)) {
    if (!hasOwn(data, field) || data[field] === '') changes[field] = desired;
    else if (data[field] !== desired) throw new Error(`${paymentId}: ${field} tiene un valor incompatible.`);
  }
  return {
    document: `ventas/${SALE_ID}/pagos/${paymentId}`,
    current: Object.fromEntries([
      ...Object.keys(EXPECTED), ...Object.keys(DESIRED),
    ].filter((field, index, fields) => fields.indexOf(field) === index)
      .map(field => [field, hasOwn(data, field) ? data[field] : '(ausente)'])),
    preconditions: { ...EXPECTED, parentEstadoVenta: 'anulada', lastUpdateTime: snapshot.updateTime },
    proposedChanges: changes,
    expectedResult: Object.keys(changes).length ? 'ACTUALIZAR' : 'YA_NORMALIZADO',
  };
}

async function runNormalization(config, adapter, log = console.log) {
  if (config.project !== PROJECT || config.database !== DATABASE) throw new Error('Ámbito inválido.');
  const sale = await adapter.readSale(SALE_ID);
  validateSale(sale);
  const inspected = [];
  for (const paymentId of PAYMENT_IDS) {
    inspected.push(validatePayment(await adapter.readPayment(SALE_ID, paymentId), paymentId));
  }

  for (const item of inspected) {
    log(`Documento: ${item.document}`);
    log(`Estado actual: ${JSON.stringify(item.current)}`);
    log(`Cambio propuesto: ${JSON.stringify(item.proposedChanges)}`);
    log(`Precondiciones: ${JSON.stringify(item.preconditions)}`);
    log(`Resultado esperado: ${item.expectedResult}`);
  }
  if (!config.apply) {
    return { mode: 'DRY_RUN', inspected, writes: 0, completed: true };
  }

  let writes = 0;
  for (const item of inspected) {
    if (item.expectedResult === 'YA_NORMALIZADO') continue;
    const result = await adapter.applyOne({
      saleId: SALE_ID,
      paymentId: item.document.split('/').at(-1),
    });
    if (!result?.committed) throw new Error(`${item.document}: commit sin confirmación.`);
    writes += 1;
    log(`Aplicado y confirmado: ${item.document}.`);
  }
  return { mode: 'APPLY', inspected, writes, completed: true };
}

function plain(snapshot) {
  return {
    exists: snapshot.exists,
    data: snapshot.exists ? snapshot.data() : null,
    updateTime: snapshot.updateTime || null,
  };
}

function createAdminAdapter(db) {
  const saleRef = db.collection('ventas').doc(SALE_ID);
  return Object.freeze({
    async readSale() {
      return plain(await saleRef.get());
    },
    async readPayment(saleId, paymentId) {
      if (saleId !== SALE_ID || !PAYMENT_IDS.includes(paymentId)) throw new Error('Path fuera del allowlist.');
      return plain(await saleRef.collection('pagos').doc(paymentId).get());
    },
    async applyOne({ saleId, paymentId }) {
      if (saleId !== SALE_ID || !PAYMENT_IDS.includes(paymentId)) throw new Error('Path fuera del allowlist.');
      const paymentRef = saleRef.collection('pagos').doc(paymentId);
      return db.runTransaction(async transaction => {
        const [saleSnapshot, paymentSnapshot] = await Promise.all([
          transaction.get(saleRef), transaction.get(paymentRef),
        ]);
        validateSale(plain(saleSnapshot));
        const current = validatePayment(plain(paymentSnapshot), paymentId);
        const expectedChanges = Object.fromEntries(Object.entries(DESIRED).filter(
          ([field]) => current.proposedChanges[field] !== undefined
        ));
        for (const [field, value] of Object.entries(EXPECTED)) {
          if (paymentSnapshot.data()[field] !== value) throw new Error(`${paymentId}: ${field} cambió.`);
        }
        if (!Object.keys(expectedChanges).length) {
          return { committed: true, alreadyNormalized: true };
        }
        transaction.update(paymentRef, expectedChanges, {
          lastUpdateTime: paymentSnapshot.updateTime,
        });
        return { committed: true, alreadyNormalized: false };
      });
    },
  });
}

async function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv);
  if (config.help) {
    console.log(usage());
    return 0;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador no permitido.');
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: config.project, credential: applicationDefault() });
  const db = getFirestore(app, config.database);
  try {
    const result = await runNormalization(config, createAdminAdapter(db));
    console.log(`Modo: ${result.mode}; escrituras confirmadas: ${result.writes}.`);
    return 0;
  } finally {
    await db.terminate();
  }
}

module.exports = {
  PROJECT, DATABASE, TENANT, SALE_ID, PAYMENT_IDS, EXPECTED, DESIRED,
  parseArgs, validateSale, validatePayment, runNormalization, createAdminAdapter,
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Abortado: ${error.message || error}`);
    process.exitCode = 1;
  });
}
