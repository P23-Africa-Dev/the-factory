/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Load NEXT_PUBLIC_* and other env vars for the Manager PWA.
 * App-level .env.local / .env files take precedence over parent workspace .env files.
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }

  return true;
}

function loadPwaEnv() {
  const appDir = __dirname;
  const workspaceDir = path.resolve(appDir, '..');
  const loaded = [];

  for (const filePath of [
    path.join(appDir, '.env.local'),
    path.join(appDir, '.env'),
    path.join(workspaceDir, '.env.local'),
    path.join(workspaceDir, '.env'),
  ]) {
    if (loadEnvFile(filePath)) {
      loaded.push(path.basename(filePath));
    }
  }

  return loaded;
}

module.exports = { loadEnvFile, loadPwaEnv };
