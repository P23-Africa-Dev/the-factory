/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * start-dev.js — Manager PWA development server bootstrap (default port 3002)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { loadPwaEnv } = require('./load-env');

// ─── 1. Load env vars ────────────────────────────────────────────────────────

const loadedEnvFiles = loadPwaEnv();
if (loadedEnvFiles.length > 0) {
  console.log(`[start-dev] Loaded env from: ${loadedEnvFiles.join(', ')}`);
} else {
  console.warn('[start-dev] Warning: no .env files found — env vars may be missing');
}

// ─── 2. Clean up stale lock file ─────────────────────────────────────────────

const lockFile = path.resolve(__dirname, '.next', 'dev', 'lock');

if (fs.existsSync(lockFile)) {
  try {
    const content = fs.readFileSync(lockFile, 'utf8').trim();
    let orphanPid = null;
    try {
      const parsed = JSON.parse(content);
      orphanPid = parsed.pid ?? parsed.PID ?? null;
    } catch {
      const num = parseInt(content, 10);
      if (!isNaN(num)) orphanPid = num;
    }

    if (orphanPid) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${orphanPid} /F`, { stdio: 'ignore' });
        } else {
          execSync(`kill -9 ${orphanPid}`, { stdio: 'ignore' });
        }
        console.log(`[start-dev] Killed orphan next dev server (PID ${orphanPid})`);
      } catch {
        // Process was already dead
      }
    }

    fs.unlinkSync(lockFile);
    console.log('[start-dev] Cleared stale dev server lock file');
  } catch {
    try { fs.unlinkSync(lockFile); } catch {}
  }
}

// ─── 3. Spawn next dev (default port 3002 unless -p / --port is passed) ──────

const rawArgs = process.argv.slice(2);
const hasPortArg = rawArgs.some((a) => a === '-p' || a === '--port' || a.startsWith('--port='));
const defaultPort = process.env.PORT || '3002';
const extraArgs = hasPortArg ? rawArgs : ['-p', defaultPort, ...rawArgs];

let nextBin;
try {
  nextBin = require.resolve('next/dist/bin/next');
} catch {
  nextBin = path.resolve(__dirname, 'node_modules', '.bin', 'next');
}

const child = spawn('node', [
  nextBin,
  'dev',
  ...extraArgs,
], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  if (process.platform === 'win32') {
    const fallback = spawn('next.cmd', ['dev', ...extraArgs], {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    fallback.on('exit', (c) => process.exit(c ?? 0));
    fallback.on('error', (e) => {
      console.error('[start-dev] Failed to start next dev:', e.message);
      process.exit(1);
    });
  } else {
    console.error('[start-dev] Failed to start next dev:', err.message);
    process.exit(1);
  }
});
