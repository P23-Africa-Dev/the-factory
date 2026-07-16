/**
 * Cross-platform Gradle runner for Capacitor Android builds.
 * Usage: node scripts/run-gradle.js assembleDebug
 *
 * Runs gradlew from inside android/ so Windows paths with spaces
 * (e.g. "The Factory") never appear on the command line.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const task = process.argv[2] || 'assembleDebug';
const androidDir = path.resolve(__dirname, '..', 'android');
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

process.exit(result.status ?? 1);
