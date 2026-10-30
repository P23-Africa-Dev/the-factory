// Generates PWA PNG icons from the brand SVG into public/icons.
// Run: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));

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

/** White silhouette on transparent — required for Android status-bar notification badge. */
function buildMonochromeBadgeSvg(size = 96) {
  let raw = fs.readFileSync(logoPath, 'utf8');
  let inner = raw.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  inner = inner.replace(/fill="[^"]*"/g, 'fill="#FFFFFF"');
  inner = inner.replace(/\s+opacity="[^"]*"/g, '');

  const targetW = size * 0.85;
  const scale = targetW / LOGO_W;
  const tx = (size - LOGO_W * scale) / 2;
  const ty = (size - LOGO_H * scale) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${tx} ${ty}) scale(${scale})">${inner}</g>
</svg>`;
}

async function toWhiteSilhouetteBuffer(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const lum = Math.max(r, g, b);
    const presence = Math.round((a * lum) / 255);
    if (presence > 20) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = presence;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

function findOpaqueBounds(data, w, h, threshold = 32) {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Crop + scale hand-edited transparent logo; convert teal/white art to white-only alpha mask. */
async function optimizeNotificationBadgeFromSource(sourcePath, outPath, size = 96) {
  const input = fs.readFileSync(sourcePath);
  const silhouette = await toWhiteSilhouetteBuffer(input);
  const { data, info } = await sharp(silhouette).raw().toBuffer({ resolveWithObject: true });
  const { minX, minY, maxX, maxY } = findOpaqueBounds(data, info.width, info.height);
  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.08);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const width = Math.min(info.width - left, maxX - minX + 1 + pad * 2);
  const height = Math.min(info.height - top, maxY - minY + 1 + pad * 2);

  await sharp(silhouette)
    .extract({ left, top, width, height })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath);
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

  const badgeOut = path.join(outDir, 'notification-badge.png');
  const badgeSource = path.join(outDir, 'notification-badge.user-source.png');
  if (fs.existsSync(badgeSource)) {
    await optimizeNotificationBadgeFromSource(badgeSource, badgeOut);
    console.log('wrote icons/notification-badge.png (from notification-badge.user-source.png)');
  } else {
    const badgeSvg = Buffer.from(buildMonochromeBadgeSvg(96));
    await sharp(badgeSvg).png().toFile(badgeOut);
    console.log('wrote icons/notification-badge.png (from SVG fallback)');
  }

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
