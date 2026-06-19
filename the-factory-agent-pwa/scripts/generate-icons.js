// Generates PWA PNG icons from the brand SVG into public/icons.
// Run: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');
const logoPath = path.join(publicDir, 'assets', 'fac-mob-logo.svg');
const outDir = path.join(publicDir, 'icons');

const BG = '#0A1D25';
const MASTER = 512;
const LOGO_W = 208;
const LOGO_H = 121;
const SIZES = [72, 96, 128, 144, 192, 384, 512];

function buildMasterSvg() {
  const raw = fs.readFileSync(logoPath, 'utf8');
  const inner = raw.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  // Logo occupies ~58% of the canvas so it stays inside the maskable safe zone.
  const targetW = MASTER * 0.58;
  const scale = targetW / LOGO_W;
  const tx = (MASTER - LOGO_W * scale) / 2;
  const ty = (MASTER - LOGO_H * scale) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}" viewBox="0 0 ${MASTER} ${MASTER}">
  <rect width="${MASTER}" height="${MASTER}" fill="${BG}"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})">${inner}</g>
</svg>`;
}

function buildScreenshotSvg(width, height) {
  const raw = fs.readFileSync(logoPath, 'utf8');
  const inner = raw.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  const logoTarget = Math.min(width, height) * 0.4;
  const scale = logoTarget / LOGO_W;
  const tx = (width - LOGO_W * scale) / 2;
  const ty = (height - LOGO_H * scale) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BG}"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})">${inner}</g>
</svg>`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const master = Buffer.from(buildMasterSvg());

  for (const size of SIZES) {
    const out = path.join(outDir, `icon-${size}x${size}.png`);
    await sharp(master).resize(size, size, { fit: 'contain' }).png().toFile(out);
    console.log('wrote', path.relative(publicDir, out));
  }

  // Apple touch icon convenience copy.
  await sharp(master).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('wrote icons/apple-touch-icon.png');

  // Screenshots for richer install UI (wide = desktop, narrow = mobile).
  const shotDir = path.join(publicDir, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  await sharp(Buffer.from(buildScreenshotSvg(1280, 720)))
    .png()
    .toFile(path.join(shotDir, 'wide.png'));
  console.log('wrote screenshots/wide.png');

  await sharp(Buffer.from(buildScreenshotSvg(720, 1280)))
    .png()
    .toFile(path.join(shotDir, 'narrow.png'));
  console.log('wrote screenshots/narrow.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
