/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Run a Next.js CLI command with workspace + PWA env vars preloaded.
 */
const path = require('path');
const { spawn } = require('child_process');
const { loadPwaEnv } = require('./load-env');

const loaded = loadPwaEnv();
if (loaded.length > 0) {
  console.log(`[run-with-env] Loaded env from: ${loaded.join(', ')}`);
} else {
  console.warn('[run-with-env] Warning: no .env files found — env vars may be missing');
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('[run-with-env] Usage: node run-with-env.js <next-command> [...args]');
  process.exit(1);
}

const [command, ...rest] = args;

let nextBin;
try {
  nextBin = require.resolve('next/dist/bin/next');
} catch {
  nextBin = path.resolve(__dirname, 'node_modules', '.bin', 'next');
}

const child = spawn('node', [nextBin, command, ...rest], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[run-with-env] Failed to start next:', err.message);
  process.exit(1);
});
