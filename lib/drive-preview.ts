import type { DriveFile } from "@/lib/api/drive";

export type DrivePreviewKind = "image" | "pdf" | "text" | "unsupported";

const IMAGE_PREFIX = "image/";
const PDF_MIME = "application/pdf";
const TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
]);

export function getDrivePreviewKind(mime: string | null): DrivePreviewKind {
  if (!mime) return "unsupported";
  if (mime.startsWith(IMAGE_PREFIX)) return "image";
  if (mime === PDF_MIME) return "pdf";
  if (TEXT_MIMES.has(mime) || mime.startsWith("text/")) return "text";
  return "unsupported";
}

export function canPreviewDriveFile(file: DriveFile): boolean {
  return getDrivePreviewKind(file.mime_type) !== "unsupported";
}

export function canThumbnailDriveFile(file: DriveFile): boolean {
  const kind = getDrivePreviewKind(file.mime_type);
  return kind === "image" || kind === "pdf";
}

export const DRIVE_PREVIEW_FALLBACK_ERROR = "Could not load preview";

export const ELY_REPORTS_RETENTION_NOTE = "ELY reports are kept for 60 days, then removed automatically.";

/**
 * Maps a failed preview/download fetch to user-facing copy.
 * `canDownload` is false when downloading would fail for the same reason.
 */
export function getDrivePreviewError(error: unknown): { message: string; canDownload: boolean } {
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : null;

  switch (status) {
    case 404:
      return { message: "This file is no longer available.", canDownload: false };
    case 503:
      return {
        message: "Drive storage is unavailable right now. Please try again later.",
        canDownload: false,
      };
    case 403:
      return { message: "You don't have access to this file.", canDownload: false };
    default:
      return { message: DRIVE_PREVIEW_FALLBACK_ERROR, canDownload: true };
  }
}

/** "Auto-deletes on Jan 5, 2027" for files with an expiry, otherwise null. */
export function formatDriveExpiryNote(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Auto-deletes on ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
