import { ELY_REPORTS_SYSTEM_KEY, type DriveFile, type DriveFolder } from './types';

export type DrivePreviewKind = 'image' | 'pdf' | 'other';

export function formatDriveBytes(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function drivePreviewKind(file: Pick<DriveFile, 'mime_type' | 'original_name'>): DrivePreviewKind {
  const mime = (file.mime_type ?? '').toLowerCase();
  const name = (file.original_name ?? '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}

function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDriveDate(iso: string | null | undefined): string {
  return formatDay(iso) ?? '—';
}

/** "Auto-deletes on 23 Jan 2027", or null when the file is kept. */
export function driveExpiryLabel(file: Pick<DriveFile, 'expires_at'>): string | null {
  const day = formatDay(file.expires_at ?? null);
  return day ? `Auto-deletes on ${day}` : null;
}

export function isElyReportsFolder(folder: Pick<DriveFolder, 'system_key'> | null | undefined): boolean {
  return folder?.system_key === ELY_REPORTS_SYSTEM_KEY;
}

/** Reads a positive integer `?file=` value, or null. */
export function parseDriveFileParam(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) ? id : null;
}
