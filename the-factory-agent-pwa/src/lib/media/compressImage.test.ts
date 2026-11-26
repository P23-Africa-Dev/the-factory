import { describe, expect, it } from 'vitest';
import { compressImage, isCompressibleImage, targetSize } from './compressImage';

describe('compressImage', () => {
  it('scales the longest side down to 1600 px, keeping the ratio', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(1080, 2400)).toEqual({ width: 720, height: 1600 });
    expect(targetSize(1200, 900)).toEqual({ width: 1200, height: 900 }); // already small
  });

  it('only touches photos it can decode', () => {
    expect(isCompressibleImage(new Blob([], { type: 'image/jpeg' }))).toBe(true);
    expect(isCompressibleImage(new Blob([], { type: 'image/png' }))).toBe(true);
    expect(isCompressibleImage(new Blob([], { type: 'application/pdf' }))).toBe(false);
    expect(isCompressibleImage(new Blob([], { type: 'image/heic' }))).toBe(false);
  });

  it('returns documents unchanged', async () => {
    const pdf = new File(['%PDF-1.4'], 'order.pdf', { type: 'application/pdf' });
    await expect(compressImage(pdf)).resolves.toBe(pdf);
  });
});
