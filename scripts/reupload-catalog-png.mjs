#!/usr/bin/env node
/**
 * Convert optimized catalog SVGs (webp-in-svg or png-in-svg) into:
 *   - browser-safe PNG files (avatar_N.png)
 *   - PNG-in-SVG shells (avatar_N.svg)
 * and upload both to the live Spaces bucket.
 *
 * Credentials: AWS_* env or backend/k8s/secret.yaml active keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogRoot = path.join(root, "tmp/avatar-opt/catalog");
const bucket = "factory23-files-45822258";

function loadSecretYaml() {
  const text = fs.readFileSync(path.join(root, "backend/k8s/secret.yaml"), "utf8");
  let key = "";
  let secret = "";
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("#")) continue;
    const km = t.match(/^AWS_ACCESS_KEY_ID:\s*"([^"]+)"/);
    const sm = t.match(/^AWS_SECRET_ACCESS_KEY:\s*"([^"]+)"/);
    if (km) key = km[1];
    if (sm) secret = sm[1];
  }
  return { key, secret };
}

function extractEmbedded(svg) {
  const match = svg.match(
    /(?:xlink:href|href)="data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\r\n]+)/,
  );
  if (!match) return null;
  const b64 = match[2].replace(/[^A-Za-z0-9+/=]/g, "");
  return Buffer.from(b64, "base64");
}

function wrapPngSvg(pngBase64, size = 192) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<image width="${size}" height="${size}" href="data:image/png;base64,${pngBase64}" xlink:href="data:image/png;base64,${pngBase64}"/>`,
    `</svg>`,
    ``,
  ].join("");
}

function upload(localFile, objectKey, contentType, env) {
  const autoload = path
    .join(root, "backend/src/vendor/autoload.php")
    .replace(/\\/g, "/");
  const php = `
require '${autoload}';
use Aws\\S3\\S3Client;
$client = new S3Client([
  'version' => 'latest',
  'region' => getenv('AWS_DEFAULT_REGION') ?: 'lon1',
  'endpoint' => getenv('AWS_ENDPOINT') ?: 'https://lon1.digitaloceanspaces.com',
  'credentials' => [
    'key' => getenv('AWS_ACCESS_KEY_ID'),
    'secret' => getenv('AWS_SECRET_ACCESS_KEY'),
  ],
]);
$client->putObject([
  'Bucket' => getenv('AWS_BUCKET'),
  'Key' => getenv('AVATAR_OBJECT_KEY'),
  'SourceFile' => getenv('AVATAR_LOCAL_FILE'),
  'ContentType' => getenv('AVATAR_CONTENT_TYPE'),
  'ACL' => 'public-read',
  'CacheControl' => 'public, max-age=86400',
]);
echo "ok\\n";
`;
  const result = spawnSync("php", ["-r", php], {
    env: {
      ...process.env,
      ...env,
      AWS_BUCKET: bucket,
      AWS_DEFAULT_REGION: "lon1",
      AWS_ENDPOINT: "https://lon1.digitaloceanspaces.com",
      AVATAR_OBJECT_KEY: objectKey,
      AVATAR_LOCAL_FILE: localFile,
      AVATAR_CONTENT_TYPE: contentType,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "upload failed").trim());
  }
}

async function convertOne(svgPath) {
  const svg = fs.readFileSync(svgPath, "utf8");
  const embedded = extractEmbedded(svg);
  if (!embedded) throw new Error(`no embedded raster in ${svgPath}`);
  const png = await sharp(embedded, { failOn: "none" })
    .resize(192, 192, { fit: "cover" })
    .png({ compressionLevel: 8, quality: 72 })
    .toBuffer();
  const pngPath = svgPath.replace(/\.svg$/i, ".png");
  const newSvg = wrapPngSvg(png.toString("base64"), 192);
  fs.writeFileSync(pngPath, png);
  fs.writeFileSync(svgPath, newSvg);
  return { pngPath, pngBytes: png.length, svgBytes: Buffer.byteLength(newSvg) };
}

async function main() {
  const creds = loadSecretYaml();
  if (!creds.key || !creds.secret) {
    throw new Error("Missing AWS keys in backend/k8s/secret.yaml");
  }
  const env = {
    AWS_ACCESS_KEY_ID: creds.key,
    AWS_SECRET_ACCESS_KEY: creds.secret,
  };

  let uploaded = 0;
  for (const gender of ["male", "female"]) {
    const dir = path.join(catalogRoot, gender);
    const svgs = fs
      .readdirSync(dir)
      .filter((f) => /^avatar_\d+\.svg$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const file of svgs) {
      const svgPath = path.join(dir, file);
      const key = path.basename(file, ".svg");
      process.stderr.write(`convert ${gender}/${key}...\n`);
      const { pngPath, pngBytes, svgBytes } = await convertOne(svgPath);
      const pngKey = `avatar/${gender}/${key}.png`;
      const svgKey = `avatar/${gender}/${key}.svg`;
      upload(pngPath, pngKey, "image/png", env);
      upload(svgPath, svgKey, "image/svg+xml", env);
      uploaded += 2;
      process.stderr.write(
        `  uploaded ${pngKey} (${pngBytes}b) + ${svgKey} (${svgBytes}b)\n`,
      );
    }
  }
  process.stderr.write(`\nDone. uploaded=${uploaded} objects\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
