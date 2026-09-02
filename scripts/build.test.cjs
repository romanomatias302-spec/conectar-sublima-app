'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  parseMode,
  buildMetadata,
  writeManifest,
} = require('./build.cjs');

test('required es el modo predeterminado', () => {
  assert.equal(parseMode([]), 'required');
});

test('optional exige un argumento explícito', () => {
  assert.equal(parseMode(['--mode', 'optional']), 'optional');
});

test('un modo inválido detiene el build', () => {
  assert.throws(() => parseMode(['--mode', 'otro']), /required\|optional/);
});

test('genera BUILD_ID con timestamp UTC y commit', () => {
  const metadata = buildMetadata({
    cwd: '.',
    mode: 'required',
    now: new Date('2026-09-02T12:34:56.789Z'),
    exec: () => 'abc1234\n',
  });
  assert.equal(metadata.buildId, '20260902T123456.789Z-abc1234');
  assert.equal(metadata.builtAt, '2026-09-02T12:34:56.789Z');
  assert.equal(metadata.updateMode, 'required');
});

test('usa un fallback único y explícito si Git no está disponible', () => {
  const metadata = buildMetadata({
    cwd: '.',
    mode: 'optional',
    now: new Date('2026-09-02T12:34:56.789Z'),
    exec: () => { throw new Error('sin git'); },
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
  });
  assert.equal(metadata.commit, 'nogit-123456781234');
  assert.match(metadata.buildId, /Z-nogit-123456781234$/);
});

test('genera y verifica build/version.json', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zalfro-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const buildDirectory = path.join(root, 'build');
  fs.mkdirSync(buildDirectory);
  const metadata = {
    schema: 1,
    buildId: '20260902T123456.789Z-abc1234',
    builtAt: '2026-09-02T12:34:56.789Z',
    commit: 'abc1234',
    updateMode: 'required',
  };
  const destination = writeManifest({ buildDirectory, metadata });
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), metadata);
});
