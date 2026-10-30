/**
 * Generate Android launcher icons from the Factory 23 mark (same as PWA),
 * with a subtle teal corner accent so APK ≠ PWA on the home screen.
 *
 * Usage: node scripts/generate-android-icons.js
 */
const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));

const ROOT = path.resolve(__dirname, '..');
const LOGO_SVG = path.join(ROOT, 'public/assets/fac-mob-logo.svg');
const PWA_ICON = path.join(ROOT, 'public/icons/icon-512x512.png');
const RES = path.join(ROOT, 'android/app/src/main/res');
const BG = '#0A1D25';
const ACCENT = '#75ADAF';

const LEGACY = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FOREGROUND = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

function cornerAccentSvg(size, inset = 0) {
  const wedge = Math.round(size * 0.26);
  const x0 = size - inset - wedge;
  const y0 = size - inset - wedge;
  const x1 = size - inset;
  const y1 = size - inset;
  const cx = size - inset - Math.round(wedge * 0.34);
  const cy = size - inset - Math.round(wedge * 0.34);
  const r = Math.max(2, Math.round(size * 0.032));
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <path d="M${x0} ${y1} L${x1} ${y1} L${x1} ${y0} Z" fill="${ACCENT}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#F0EFF0"/>
</svg>`);
}

async function renderLogo(size) {
  // Prefer SVG mark; fall back to PWA raster if SVG missing.
  if (fs.existsSync(LOGO_SVG)) {
    return sharp(LOGO_SVG)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }
  return sharp(PWA_ICON)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function composeFullIcon(size) {
  const logoSize = Math.round(size * 0.68);
  const logo = await renderLogo(logoSize);
  const left = Math.round((size - logoSize) / 2);
  const top = Math.round((size - logoSize) / 2);
  const accent = await sharp(cornerAccentSvg(size)).png().toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([
      { input: logo, left, top },
      { input: accent, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function composeForeground(size) {
  const logoSize = Math.round(size * 0.58);
  const logo = await renderLogo(logoSize);
  const left = Math.round((size - logoSize) / 2);
  const top = Math.round((size - logoSize) / 2);
  const inset = Math.round(size * 0.14);
  const accent = await sharp(cornerAccentSvg(size, inset)).png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: logo, left, top },
      { input: accent, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function writePng(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  console.log('wrote', path.relative(ROOT, filePath));
}

async function main() {
  for (const [dir, size] of Object.entries(LEGACY)) {
    const full = await composeFullIcon(size);
    await writePng(path.join(RES, dir, 'ic_launcher.png'), full);
    await writePng(path.join(RES, dir, 'ic_launcher_round.png'), full);
  }

  for (const [dir, size] of Object.entries(FOREGROUND)) {
    const fg = await composeForeground(size);
    await writePng(path.join(RES, dir, 'ic_launcher_foreground.png'), fg);
  }

  await fs.promises.writeFile(
    path.join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0A1D25</color>
</resources>
`,
  );
  console.log('updated values/ic_launcher_background.xml → #0A1D25');

  // Replace default Cap vector background with solid brand color.
  await fs.promises.writeFile(
    path.join(RES, 'drawable/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/ic_launcher_background" />
</shape>
`,
  );
  console.log('updated drawable/ic_launcher_background.xml');

  // High-res preview (not used by Android runtime; kept for docs / Play listing).
  const previewDir = path.join(ROOT, 'android/branding');
  fs.mkdirSync(previewDir, { recursive: true });
  await writePng(path.join(previewDir, 'launcher-icon-512.png'), await composeFullIcon(512));

  console.log('Done. Rebuild APK (npm run apk:debug) and reinstall to refresh the home-screen icon.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
