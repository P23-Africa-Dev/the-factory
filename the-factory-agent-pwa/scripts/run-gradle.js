/**
 * Cross-platform Gradle runner for Capacitor Android builds.
 * Usage: node scripts/run-gradle.js assembleDebug|assembleRelease
 *
 * After a successful build, copies the APK to the marketing site download path:
 *   <repo>/public/downloads/factory23-agent.apk
 * Always overwrites that single file so Git/deploy stay on one replaceable artifact.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const task = process.argv[2] || 'assembleDebug';
const agentRoot = path.resolve(__dirname, '..');
const androidDir = path.join(agentRoot, 'android');
const repoRoot = path.resolve(agentRoot, '..');
const downloadsDir = path.join(repoRoot, 'public', 'downloads');
const PUBLISH_NAME = 'factory23-agent.apk';
const publishPath = path.join(downloadsDir, PUBLISH_NAME);

const isWin = process.platform === 'win32';
const gradlewName = isWin ? 'gradlew.bat' : './gradlew';
const gradlewPath = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

if (!fs.existsSync(gradlewPath)) {
  console.error(`Gradle wrapper not found: ${gradlewPath}`);
  process.exit(1);
}

const result = spawnSync(gradlewName, [task], {
  cwd: androidDir,
  stdio: 'inherit',
  env: process.env,
  shell: isWin,
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

const status = result.status ?? 1;
if (status !== 0) {
  process.exit(status);
}

function findBuiltApk() {
  const outputsRoot = path.join(androidDir, 'app', 'build', 'outputs', 'apk');
  const candidates =
    task === 'assembleRelease'
      ? [
          path.join(outputsRoot, 'release', 'app-release.apk'),
          path.join(outputsRoot, 'release', 'app-release-unsigned.apk'),
        ]
      : [
          path.join(outputsRoot, 'debug', 'app-debug.apk'),
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: newest .apk under outputs/apk
  if (!fs.existsSync(outputsRoot)) return null;
  /** @type {{ file: string, mtime: number }[]} */
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.apk')) {
        found.push({ file: full, mtime: fs.statSync(full).mtimeMs });
      }
    }
  };
  walk(outputsRoot);
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.file ?? null;
}

const builtApk = findBuiltApk();
if (!builtApk) {
  console.error('[apk] Build succeeded but no APK was found under android/app/build/outputs/apk');
  process.exit(1);
}

fs.mkdirSync(downloadsDir, { recursive: true });
fs.copyFileSync(builtApk, publishPath);

const sizeMb = (fs.statSync(publishPath).size / (1024 * 1024)).toFixed(2);
console.log('');
console.log(`[apk] Published (replaced): ${publishPath}`);
console.log(`[apk] Source: ${builtApk}`);
console.log(`[apk] Size: ${sizeMb} MB`);
console.log(`[apk] QR / ENV path: /downloads/${PUBLISH_NAME}`);
console.log('[apk] Commit & push this file to update the download on deploy (replaces the previous APK).');
console.log('');

process.exit(0);
