#!/usr/bin/env node
/**
 * Shrink catalog avatar SVGs that embed huge base64 PNGs.
 * Reads SVG from stdin (or --file), writes optimized SVG to stdout.
 *
 * Usage:
 *   node scripts/optimize-avatar-svg.mjs --file path.svg > out.svg
 *   cat path.svg | node scripts/optimize-avatar-svg.mjs > out.svg
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = { size: 192, quality: 72, file: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") opts.file = argv[++i];
    else if (a === "--size") opts.size = Number(argv[++i]);
    else if (a === "--quality") opts.quality = Number(argv[++i]);
  }
  return opts;
}

function extractEmbeddedImage(svg) {
  // Allow truncated downloads where the closing quote never arrived.
  const match = svg.match(
    /(?:xlink:href|href)="data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\r\n]+)/,
  );
  if (!match) return null;
  const b64 = match[2].replace(/[^A-Za-z0-9+/=]/g, "");
  if (b64.length < 100) return null;
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(b64, "base64"),
  };
}

function wrapAsSvg(webpBase64, size) {
  // Tiny SVG shell; browsers and <img src> render this fine.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<image width="${size}" height="${size}" href="data:image/webp;base64,${webpBase64}" xlink:href="data:image/webp;base64,${webpBase64}"/>`,
    `</svg>`,
    ``,
  ].join("");
}

async function optimizeSvg(svg, { size, quality }) {
  const embedded = extractEmbeddedImage(svg);
  if (!embedded) {
    // Already a real vector SVG (or unknown) — leave unchanged if small enough.
    if (Buffer.byteLength(svg, "utf8") < 80_000) {
      return { svg, skipped: true, reason: "no-embedded-raster" };
    }
    // Rasterize oversized SVG as a last resort.
    const webp = await sharp(Buffer.from(svg, "utf8"))
      .resize(size, size, { fit: "cover" })
      .webp({ quality })
      .toBuffer();
    return {
      svg: wrapAsSvg(webp.toString("base64"), size),
      skipped: false,
      before: Buffer.byteLength(svg, "utf8"),
      after: null,
      rasterBytes: webp.length,
    };
  }

  try {
    const webp = await sharp(embedded.buffer, { failOn: "none" })
      .resize(size, size, { fit: "cover" })
      .webp({ quality })
      .toBuffer();

    const out = wrapAsSvg(webp.toString("base64"), size);
    return {
      svg: out,
      skipped: false,
      before: Buffer.byteLength(svg, "utf8"),
      after: Buffer.byteLength(out, "utf8"),
      rasterBytes: webp.length,
    };
  } catch (err) {
    return {
      svg,
      skipped: true,
      reason: `corrupt-embedded-raster:${err.message}`,
    };
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  let input;
  if (opts.file) {
    const filePath = path.isAbsolute(opts.file)
      ? opts.file
      : path.join(root, opts.file);
    input = fs.readFileSync(filePath, "utf8");
  } else {
    input = fs.readFileSync(0, "utf8");
  }

  const result = await optimizeSvg(input, opts);
  if (process.env.AVATAR_OPT_STATS === "1") {
    process.stderr.write(
      JSON.stringify({
        skipped: result.skipped,
        reason: result.reason ?? null,
        before: result.before ?? Buffer.byteLength(input, "utf8"),
        after: result.after ?? Buffer.byteLength(result.svg, "utf8"),
        rasterBytes: result.rasterBytes ?? null,
      }) + "\n",
    );
  }
  process.stdout.write(result.svg);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
