#!/usr/bin/env node
/**
 * Download catalog avatars from the public Spaces URLs (or API), compress the
 * embedded 1024px PNGs to 192px WebP inside a tiny SVG shell, and optionally
 * re-upload with AWS_* credentials.
 *
 *   node scripts/optimize-catalog-avatars.mjs
 *   node scripts/optimize-catalog-avatars.mjs --upload
 *   node scripts/optimize-catalog-avatars.mjs --base-url https://factory23-files-....digitaloceanspaces.com
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const optimizer = path.join(__dirname, "optimize-avatar-svg.mjs");

const DEFAULT_BASE =
  "https://factory23-files-45822258.lon1.digitaloceanspaces.com";
const DEFAULT_API = "https://api.thefactory23.com/api/v1";

function parseArgs(argv) {
  const opts = {
    upload: false,
    size: 192,
    quality: 72,
    baseUrl: DEFAULT_BASE,
    api: DEFAULT_API,
    outDir: path.join(root, "tmp/avatar-opt/catalog"),
    genders: ["male", "female"],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--upload") opts.upload = true;
    else if (a === "--size") opts.size = Number(argv[++i]);
    else if (a === "--quality") opts.quality = Number(argv[++i]);
    else if (a === "--base-url") opts.baseUrl = argv[++i].replace(/\/$/, "");
    else if (a === "--api") opts.api = argv[++i].replace(/\/$/, "");
    else if (a === "--out") opts.outDir = path.resolve(argv[++i]);
  }
  return opts;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function discoverKeys(api, gender) {
  const keys = [];
  let cursor = 0;
  for (;;) {
    const url = `${api}/avatars?gender=${gender}&limit=12&cursor=${cursor}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
    const json = await res.json();
    for (const item of json.data ?? []) {
      if (item?.key) keys.push(String(item.key));
    }
    const next = json.meta?.next_cursor;
    if (next == null || next === cursor) break;
    cursor = next;
    if (keys.length > 200) break;
  }
  return keys;
}

async function probeKeys(baseUrl, gender) {
  const keys = [];
  for (let i = 1; i <= 40; i++) {
    for (const key of [`avatar_${i}`, `male_${String(i).padStart(2, "0")}`, `female_${String(i).padStart(2, "0")}`, `${gender}_${i}`]) {
      const url = `${baseUrl}/avatar/${gender}/${key}.svg`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) keys.push(key);
      } catch {
        // ignore
      }
    }
  }
  return [...new Set(keys)];
}

function optimizeFile(inputPath, outputPath, size, quality) {
  const result = spawnSync(
    process.execPath,
    [
      optimizer,
      "--file",
      inputPath,
      "--size",
      String(size),
      "--quality",
      String(quality),
    ],
    {
      cwd: root,
      encoding: "buffer",
      env: { ...process.env, AVATAR_OPT_STATS: "1" },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString("utf8") || "optimizer failed");
  }
  fs.writeFileSync(outputPath, result.stdout);
  let stats = {};
  try {
    stats = JSON.parse(result.stderr.toString("utf8").trim().split(/\r?\n/).pop());
  } catch {
    // ignore
  }
  return stats;
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url, {
    headers: { Accept: "*/*", Connection: "close" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000) throw new Error(`too small (${buf.length} bytes)`);
  fs.writeFileSync(destPath, buf);
  return buf;
}

async function maybeUpload(filePath, objectKey, env) {
  // Upload via a tiny PHP helper so we reuse the app's AWS SDK (aws-sdk-php).
  const php = `
require '${path.join(root, "backend/src/vendor/autoload.php").replace(/\\/g, "/")}';
use Aws\\S3\\S3Client;
\$client = new S3Client([
  'version' => 'latest',
  'region' => getenv('AWS_DEFAULT_REGION') ?: 'lon1',
  'endpoint' => getenv('AWS_ENDPOINT') ?: 'https://lon1.digitaloceanspaces.com',
  'credentials' => [
    'key' => getenv('AWS_ACCESS_KEY_ID'),
    'secret' => getenv('AWS_SECRET_ACCESS_KEY'),
  ],
  'use_path_style_endpoint' => getenv('AWS_USE_PATH_STYLE_ENDPOINT') === 'true',
]);
\$client->putObject([
  'Bucket' => getenv('AWS_BUCKET'),
  'Key' => getenv('AVATAR_OBJECT_KEY'),
  'SourceFile' => getenv('AVATAR_LOCAL_FILE'),
  'ContentType' => 'image/svg+xml',
  'ACL' => 'public-read',
  'CacheControl' => 'public, max-age=86400',
]);
echo "ok\\n";
`;

  if (!env.AWS_BUCKET || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("Missing AWS_* credentials for upload");
  }

  const result = spawnSync("php", ["-r", php], {
    env: {
      ...process.env,
      ...env,
      AVATAR_OBJECT_KEY: objectKey,
      AVATAR_LOCAL_FILE: filePath,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "upload failed").trim());
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const env = {
    ...loadEnvFile(path.join(root, "backend/src/.env")),
    ...process.env,
  };

  // Prefer the public files bucket when uploading optimized assets.
  // Local .env often points at factory23-storage; catalog lives on factory23-files-*.
  if (opts.baseUrl.includes("factory23-files-")) {
    env.AWS_BUCKET = "factory23-files-45822258";
  }

  fs.mkdirSync(opts.outDir, { recursive: true });

  let totalBefore = 0;
  let totalAfter = 0;
  let optimized = 0;

  for (const gender of opts.genders) {
    process.stderr.write(`Probing ${gender} avatar URLs on Spaces...\n`);
    let keys = await probeKeys(opts.baseUrl, gender);
    if (keys.length === 0) {
      try {
        process.stderr.write(`No HEAD hits; falling back to API for ${gender}...\n`);
        keys = await discoverKeys(opts.api, gender);
      } catch (err) {
        process.stderr.write(`API discover failed (${err.message})\n`);
      }
    }

    if (keys.length === 0) {
      process.stderr.write(`No keys found for ${gender}\n`);
      continue;
    }

    process.stderr.write(`Found ${keys.length} ${gender} avatars\n`);
    const genderDir = path.join(opts.outDir, gender);
    fs.mkdirSync(genderDir, { recursive: true });

    for (const key of keys) {
      const objectKey = `avatar/${gender}/${key}.svg`;
      const url = `${opts.baseUrl}/${objectKey}`;
      const rawPath = path.join(genderDir, `${key}.src.svg`);
      const outPath = path.join(genderDir, `${key}.svg`);

      // Already optimized locally — skip re-download.
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 2_000 && fs.statSync(outPath).size < 80_000) {
        const after = fs.statSync(outPath).size;
        totalAfter += after;
        optimized++;
        process.stderr.write(`  skip ${objectKey} (already ${after} bytes)\n`);
        if (opts.upload) {
          try {
            await maybeUpload(outPath, objectKey, env);
            process.stderr.write(`  uploaded ${objectKey}\n`);
          } catch (err) {
            process.stderr.write(`  upload failed ${objectKey}: ${err.message}\n`);
          }
        }
        continue;
      }

      process.stderr.write(`  fetch ${objectKey}...\n`);
      // Reuse only complete-looking downloads (~1MB catalog SVGs).
      let buf = null;
      if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 900_000) {
        buf = fs.readFileSync(rawPath);
        process.stderr.write(`  reuse ${path.basename(rawPath)} (${buf.length} bytes)\n`);
      } else {
        if (fs.existsSync(rawPath)) {
          try {
            fs.unlinkSync(rawPath);
          } catch {
            // Windows file-lock — write to a fresh temp instead.
          }
        }
        let lastErr = "download failed";
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            buf = await downloadToFile(url, rawPath);
            process.stderr.write(`  downloaded ${buf.length} bytes (attempt ${attempt})\n`);
            break;
          } catch (err) {
            lastErr = err.message || String(err);
            process.stderr.write(`  attempt ${attempt} failed: ${lastErr}\n`);
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
        if (!buf) {
          process.stderr.write(`  skip ${objectKey} (${lastErr})\n`);
          continue;
        }
      }
      totalBefore += buf.length;

      try {
        const stats = optimizeFile(rawPath, outPath, opts.size, opts.quality);
        const after = fs.statSync(outPath).size;
        totalAfter += after;
        optimized++;
        process.stderr.write(
          `  ${objectKey}: ${buf.length} → ${after} bytes` +
            (stats.after ? ` (webp ${stats.rasterBytes ?? "?"})` : "") +
            `\n`,
        );
      } catch (err) {
        process.stderr.write(`  optimize failed ${objectKey}: ${err.message}\n`);
        continue;
      }

      if (opts.upload) {
        try {
          await maybeUpload(outPath, objectKey, env);
          process.stderr.write(`  uploaded ${objectKey}\n`);
        } catch (err) {
          process.stderr.write(`  upload failed ${objectKey}: ${err.message}\n`);
        }
      }
    }
  }

  process.stderr.write(
    `\nDone. optimized=${optimized} before=${totalBefore} after=${totalAfter} saved=${Math.max(0, totalBefore - totalAfter)}\n`,
  );
  process.stderr.write(`Output: ${opts.outDir}\n`);
  if (!opts.upload) {
    process.stderr.write(
      "Re-run with --upload once AWS_* points at the live Spaces bucket.\n",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
