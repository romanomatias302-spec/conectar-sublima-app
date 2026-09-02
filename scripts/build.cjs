'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const MODES = new Set(['required', 'optional']);

function parseMode(argv) {
  if (argv.length === 0) return 'required';
  if (argv.length !== 2 || argv[0] !== '--mode' || !MODES.has(argv[1])) {
    throw new Error('Uso: npm run build -- [--mode required|optional]');
  }
  return argv[1];
}

function compactTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Fecha de build inválida.');
  }
  return date.toISOString().replace(/[-:]/g, '');
}

function resolveCommit({ cwd, exec = execFileSync, randomUUID = crypto.randomUUID }) {
  try {
    const commit = exec('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[0-9a-f]{4,40}$/i.test(commit)) return commit;
  } catch {
    // El build sigue siendo único aunque Git no esté disponible.
  }
  return `nogit-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function buildMetadata({ cwd, mode, now = new Date(), exec, randomUUID } = {}) {
  const commit = resolveCommit({ cwd, exec, randomUUID });
  const builtAt = now.toISOString();
  return {
    schema: 1,
    buildId: `${compactTimestamp(now)}-${commit}`,
    builtAt,
    commit,
    updateMode: mode,
  };
}

function writeManifest({ buildDirectory, metadata }) {
  if (!fs.existsSync(buildDirectory) || !fs.statSync(buildDirectory).isDirectory()) {
    throw new Error(`No existe el directorio del build: ${buildDirectory}`);
  }
  const destination = path.join(buildDirectory, 'version.json');
  fs.writeFileSync(destination, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  const written = JSON.parse(fs.readFileSync(destination, 'utf8'));
  if (written.buildId !== metadata.buildId || written.updateMode !== metadata.updateMode) {
    throw new Error('No se pudo verificar build/version.json.');
  }
  return destination;
}

function runBuild({
  argv = process.argv.slice(2),
  cwd = path.resolve(__dirname, '..'),
  now = new Date(),
  spawn = spawnSync,
  exec,
  randomUUID,
} = {}) {
  const mode = parseMode(argv);
  const metadata = buildMetadata({ cwd, mode, now, exec, randomUUID });
  const reactBuildScript = require.resolve('react-scripts/scripts/build', { paths: [cwd] });
  const result = spawn(process.execPath, [reactBuildScript], {
    cwd,
    env: {
      ...process.env,
      REACT_APP_ZALFRO_BUILD_ID: metadata.buildId,
    },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`react-scripts build finalizó con código ${result.status ?? 'desconocido'}.`);
  }

  const manifestPath = writeManifest({
    buildDirectory: path.join(cwd, 'build'),
    metadata,
  });
  console.log(`BUILD_ID: ${metadata.buildId}`);
  console.log(`Modo de actualización: ${metadata.updateMode}`);
  console.log(`Manifiesto: ${manifestPath}`);
  return metadata;
}

module.exports = {
  parseMode,
  compactTimestamp,
  resolveCommit,
  buildMetadata,
  writeManifest,
  runBuild,
};

if (require.main === module) {
  try {
    runBuild();
  } catch (error) {
    console.error(`Build abortado: ${error.message || error}`);
    process.exitCode = 1;
  }
}
