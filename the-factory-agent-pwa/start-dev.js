/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * start-dev.js — PWA development server bootstrap
 *
 * Responsibilities:
 *  1. Pre-seed env vars from .env.local into process.env BEFORE next starts,
 *     so Turbopack inlines NEXT_PUBLIC_* vars correctly into client chunks.
 *     (turbopack.root points to the parent workspace dir for module resolution,
 *     which causes Turbopack to read env files from the parent's .env.local —
 *     pre-seeding here guarantees the correct values are available.)
 *
 *  2. Clean up stale .next/dev/lock files.
 *     Next.js 16 writes this file when a dev server starts. Killing the Node
 *     process (Ctrl+C or taskkill) leaves the file behind, causing the next
 *     `npm run dev` to refuse to start with "Another next dev server is
 *     already running". This script detects the stale lock, kills the orphan
 *     PID if it is still running, removes the file, and starts cleanly.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ─── 1. Load env vars ────────────────────────────────────────────────────────

const envFile = path.resolve(__dirname, '.env.local');

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    // Only set if not already defined — lets CI/CD override via shell env
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
  console.log('[start-dev] Loaded env from .env.local');
} else {
  console.warn('[start-dev] Warning: .env.local not found — env vars may be missing');
}

// ─── 2. Clean up stale lock file ─────────────────────────────────────────────

const lockFile = path.resolve(__dirname, '.next', 'dev', 'lock');

if (fs.existsSync(lockFile)) {
  try {
    const content = fs.readFileSync(lockFile, 'utf8').trim();

    // The lock file contains JSON like { "pid": 1234, ... } or just a PID number.
    let orphanPid = null;
    try {
      const parsed = JSON.parse(content);
      orphanPid = parsed.pid ?? parsed.PID ?? null;
    } catch {
      // Fallback: maybe it's a plain number
      const num = parseInt(content, 10);
      if (!isNaN(num)) orphanPid = num;
    }

    if (orphanPid) {
      try {
        // Check if the process is still running and kill it
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${orphanPid} /F`, { stdio: 'ignore' });
        } else {
          execSync(`kill -9 ${orphanPid}`, { stdio: 'ignore' });
        }
        console.log(`[start-dev] Killed orphan next dev server (PID ${orphanPid})`);
      } catch {
        // Process was already dead — that's fine
      }
    }

    fs.unlinkSync(lockFile);
    console.log('[start-dev] Cleared stale dev server lock file');
  } catch (err) {
    // Couldn't parse or delete — try to delete anyway
    try { fs.unlinkSync(lockFile); } catch {}
  }
}

// ─── 3. Spawn next dev ───────────────────────────────────────────────────────

const extraArgs = process.argv.slice(2);

let nextBin;
try {
  nextBin = require.resolve('next/dist/bin/next');
} catch (err) {
  // Fallback to hardcoded local path if resolution fails
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
  // Fallback: try next.cmd on Windows if node invocation fails
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
