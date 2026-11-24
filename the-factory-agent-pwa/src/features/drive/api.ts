/**
 * Company Drive API client — the same Laravel `/drive/*` endpoints the web
 * dashboard uses, through the PWA's bearer-token Axios client. Every call
 * carries the active `company_id`.
 *
 * Who can do what is decided by the server (`DriveAccessService`): everyone
 * can list, preview and download what they have access to; only owners,
 * admins and supervisors can upload, share and delete.
 */
import { client } from '@/lib/api/client';
import { flattenApiError } from '@/lib/api/errors';
import { getActiveCompanyId } from '@/lib/storage/stores';
import type {
  DriveFile,
  DriveFileFilters,
  DriveFilesPage,
  DriveFolder,
  DriveGrantsPayload,
  DriveUsage,
} from './types';

/** Files can be large; give transfers more time than the 15s default. */
const TRANSFER_TIMEOUT_MS = 120_000;

function companyParams(): { company_id?: number } {
  const id = getActiveCompanyId();
  return id != null ? { company_id: id } : {};
}

function unwrap<T>(body: unknown): T {
  const envelope = (body ?? {}) as { data?: unknown };
  return (envelope.data !== undefined ? envelope.data : body) as T;
}

export const DRIVE_ERROR_MESSAGES = {
  notFound: 'This file is no longer available.',
  unavailable: 'Drive storage is unavailable right now. Please try again later.',
  forbidden: "You don't have access to this file.",
  generic: 'Something went wrong. Please try again.',
} as const;

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const direct = (error as { status?: unknown }).status;
  if (typeof direct === 'number') return direct;
  const nested = (error as { response?: { status?: unknown } }).response?.status;
  return typeof nested === 'number' ? nested : null;
}

/** A user-facing message for a failed Drive request. */
export function driveErrorMessage(error: unknown): string {
  switch (statusOf(error)) {
    case 404:
      return DRIVE_ERROR_MESSAGES.notFound;
    case 503:
      return DRIVE_ERROR_MESSAGES.unavailable;
    case 403:
      return DRIVE_ERROR_MESSAGES.forbidden;
    default: {
      const message = flattenApiError(error);
      // flattenApiError falls back to a bare "Request failed." when the server said nothing.
      return message && message !== 'Request failed.' ? message : DRIVE_ERROR_MESSAGES.generic;
    }
  }
}

export const driveApi = {
  getUsage: async (): Promise<DriveUsage> => {
    const { data } = await client.get('/drive/usage', { params: companyParams() });
    return unwrap<DriveUsage>(data);
  },

  listFolders: async (): Promise<DriveFolder[]> => {
    const { data } = await client.get('/drive/folders', { params: companyParams() });
    const payload = unwrap<{ items?: DriveFolder[] } | DriveFolder[]>(data);
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload?.items) ? payload.items : [];
  },

  listFiles: async (filters: DriveFileFilters = {}): Promise<DriveFilesPage> => {
    const params: Record<string, unknown> = { ...companyParams() };
    Object.entries(filters).forEach(([key, value]) => {
      if (value != null && value !== '') params[key] = value;
    });
    const { data } = await client.get('/drive/files', { params });
    const payload = unwrap<Partial<DriveFilesPage>>(data);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return {
      items,
      pagination: payload?.pagination ?? {
        total: items.length,
        per_page: items.length,
        current_page: 1,
        last_page: 1,
      },
    };
  },

  getFile: async (fileId: number): Promise<DriveFile> => {
    const { data } = await client.get(`/drive/files/${fileId}`, { params: companyParams() });
    return unwrap<DriveFile>(data);
  },

  /** Fetches the file bytes with the bearer token (used for preview and download). */
  fetchBlob: async (fileId: number): Promise<Blob> => {
    const { data } = await client.get<Blob>(`/drive/files/${fileId}/download`, {
      params: companyParams(),
      responseType: 'blob',
      timeout: TRANSFER_TIMEOUT_MS,
    });
    return data;
  },

  upload: async (payload: {
    folderId: number;
    file: File;
    shareWithAll?: boolean;
    userIds?: number[];
  }): Promise<DriveFile> => {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('folder_id', String(payload.folderId));
    const companyId = getActiveCompanyId();
    if (companyId != null) form.append('company_id', String(companyId));
    if (payload.shareWithAll) form.append('share_with_all', '1');
    payload.userIds?.forEach((id) => form.append('user_ids[]', String(id)));

    const { data } = await client.post('/drive/files', form, {
      // Overrides the JSON default so axios sends FormData; the browser adds the boundary.
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TRANSFER_TIMEOUT_MS,
    });
    return unwrap<DriveFile>(data);
  },

  syncGrants: async (fileId: number, payload: DriveGrantsPayload): Promise<DriveFile> => {
    const { data } = await client.put(`/drive/files/${fileId}/grants`, {
      ...companyParams(),
      share_with_all: payload.share_with_all,
      user_ids: payload.user_ids,
    });
    return unwrap<DriveFile>(data);
  },

  remove: async (fileId: number): Promise<void> => {
    await client.delete(`/drive/files/${fileId}`, { params: companyParams() });
  },
};
