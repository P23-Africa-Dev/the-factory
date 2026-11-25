/**
 * Saving a Drive file to the device.
 *
 * In a browser an `<a download>` on the blob URL works. The Capacitor Android
 * WebView ignores blob downloads, and this app has no `@capacitor/filesystem`
 * or `@capacitor/share` plugin yet (adding them needs an APK rebuild). So on
 * native we try the Web Share API with the file, then fall back to opening
 * the blob in a new view. PDFs and images are previewed in the app instead.
 */
import { Capacitor } from '@capacitor/core';

export type DriveSaveResult = 'downloaded' | 'shared' | 'opened' | 'unsupported';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'download';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function tryWebShare(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    const file = new File([blob], filename || 'download', {
      type: blob.type || 'application/octet-stream',
    });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (error) {
    // The user closing the share sheet still counts as handled.
    return (error as { name?: string } | null)?.name === 'AbortError';
  }
}

export async function saveDriveBlob(blob: Blob, filename: string): Promise<DriveSaveResult> {
  if (!isNativeApp()) {
    anchorDownload(blob, filename);
    return 'downloaded';
  }

  if (await tryWebShare(blob, filename)) return 'shared';

  const url = URL.createObjectURL(blob);
  const opened = typeof window !== 'undefined' ? window.open(url, '_blank') : null;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return opened ? 'opened' : 'unsupported';
}
