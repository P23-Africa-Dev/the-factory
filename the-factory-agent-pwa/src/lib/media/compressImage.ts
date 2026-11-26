/**
 * Shrink a photo before upload: longest side 1600 px, JPEG quality 0.8.
 * A 4 MB phone photo usually becomes ~300 KB, which matters on mobile data.
 * Anything that isn't a decodable image (PDF, Word, HEIC the WebView can't
 * read…) is returned unchanged.
 */
export const MAX_SIDE_PX = 1600;
export const JPEG_QUALITY = 0.8;

export function targetSize(width: number, height: number, maxSide = MAX_SIDE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest <= 0) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function isCompressibleImage(file: Blob & { name?: string }): boolean {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(file.type);
}

export async function compressImage(file: File): Promise<File> {
  if (!isCompressibleImage(file) || typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    // Keep the original when compression would not help (already small).
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
