#!/usr/bin/env node
/**
 * Shrink catalog avatar SVGs that embed huge base64 rasters.
 * Outputs a tiny SVG shell with an embedded PNG (not WebP) so <img src>
 * rendering works in all major browsers.
 *
 * Usage:
 *   node scripts/optimize-avatar-svg.mjs --file path.svg > out.svg
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

function wrapAsSvg(pngBase64, size) {
  // PNG-in-SVG is required: WebP-in-SVG is blank when used as <img src>.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<image width="${size}" height="${size}" href="data:image/png;base64,${pngBase64}" xlink:href="data:image/png;base64,${pngBase64}"/>`,
    `</svg>`,
    ``,
  ].join("");
}

async function rasterizeToPng(input, size, quality) {
  return sharp(input, { failOn: "none" })
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 8, quality })
    .toBuffer();
}

async function optimizeSvg(svg, { size, quality }) {
  const embedded = extractEmbeddedImage(svg);
  if (!embedded) {
    if (Buffer.byteLength(svg, "utf8") < 80_000) {
      return { svg, skipped: true, reason: "no-embedded-raster" };
    }
    const png = await rasterizeToPng(Buffer.from(svg, "utf8"), size, quality);
    const out = wrapAsSvg(png.toString("base64"), size);
    return {
      svg: out,
      skipped: false,
      before: Buffer.byteLength(svg, "utf8"),
      after: Buffer.byteLength(out, "utf8"),
      rasterBytes: png.length,
      png,
    };
  }

  try {
    const png = await rasterizeToPng(embedded.buffer, size, quality);
    const out = wrapAsSvg(png.toString("base64"), size);
    return {
      svg: out,
      skipped: false,
      before: Buffer.byteLength(svg, "utf8"),
      after: Buffer.byteLength(out, "utf8"),
      rasterBytes: png.length,
      png,
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
