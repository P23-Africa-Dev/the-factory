import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_AVATAR_FALLBACK,
  TRANSPARENT_PIXEL,
  fallbackFor,
  recoverBrokenImage,
} from './BrokenImageGuard';

const PWA_ROOT = path.resolve(__dirname, '../../..');
const PUBLIC_DIR = path.join(PWA_ROOT, 'public');
const SOURCE_DIRS = ['app', 'src'].map((d) => path.join(PWA_ROOT, d));
const ASSET_REF = /["'`(]\/((?:assets|icons|avatars|images|screenshots)\/[^"'`)?#]+?\.(?:png|jpe?g|svg|webp|gif|ico))/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('bundled image references', () => {
  it('every /assets, /icons, /avatars … path used in code exists in public/', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of SOURCE_DIRS.flatMap(sourceFiles)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(ASSET_REF)) {
        if (match[1].includes('${')) continue; // dynamic template — not a fixed file
        checked += 1;
        if (!fs.existsSync(path.join(PUBLIC_DIR, match[1]))) {
          missing.push(`${path.relative(PWA_ROOT, file)} → /${match[1]}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  it('the local avatar fallback ships with the app', () => {
    expect(fs.existsSync(path.join(PUBLIC_DIR, LOCAL_AVATAR_FALLBACK))).toBe(true);
  });
});

describe('BrokenImageGuard recovery', () => {
  function img(attrs: Record<string, string>): HTMLImageElement {
    const el = document.createElement('img');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  it('swaps a failed avatar for the bundled ghost avatar', () => {
    const el = img({ src: 'https://cdn.example.test/avatar/9.png', alt: 'Avatar', class: 'w-11 h-11 rounded-full' });
    recoverBrokenImage(el);
    expect(el.getAttribute('src')).toBe(LOCAL_AVATAR_FALLBACK);
  });

  it('honours an explicit data-fallback', () => {
    const el = img({ src: '/missing.png', alt: 'Proof', 'data-fallback': '/assets/icon.png' });
    expect(fallbackFor(el)).toBe('/assets/icon.png');
  });

  it('turns any other failed image into an invisible placeholder', () => {
    const el = img({ src: '/assets/gone.png', alt: 'Conversion', class: 'w-7 h-7' });
    recoverBrokenImage(el);
    expect(el.getAttribute('src')).toBe(TRANSPARENT_PIXEL);
  });

  it('gives up cleanly when the fallback also fails', () => {
    const el = img({ src: 'https://cdn.example.test/avatar/9.png', alt: 'Avatar' });
    recoverBrokenImage(el); // → ghost avatar
    recoverBrokenImage(el); // ghost failed too → pixel
    expect(el.getAttribute('src')).toBe(TRANSPARENT_PIXEL);
    recoverBrokenImage(el); // no loop
    expect(el.getAttribute('src')).toBe(TRANSPARENT_PIXEL);
  });
});
