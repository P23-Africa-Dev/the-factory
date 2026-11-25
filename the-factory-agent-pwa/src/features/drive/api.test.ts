import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  client: { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.delete },
}));

vi.mock('@/lib/storage/stores', () => ({
  getActiveCompanyId: () => 12,
}));

import { DRIVE_ERROR_MESSAGES, driveApi, driveErrorMessage } from './api';
import { driveExpiryLabel, drivePreviewKind, isElyReportsFolder, parseDriveFileParam } from './utils';

describe('driveErrorMessage', () => {
  it('maps the Drive status codes to clear messages', () => {
    expect(driveErrorMessage({ status: 404, message: 'No query results' })).toBe(
      'This file is no longer available.',
    );
    expect(driveErrorMessage({ status: 503, message: 'Service Unavailable' })).toBe(
      'Drive storage is unavailable right now. Please try again later.',
    );
    expect(driveErrorMessage({ status: 403, message: 'Forbidden' })).toBe("You don't have access to this file.");
  });

  it('reads the status from a raw axios error too', () => {
    expect(driveErrorMessage({ response: { status: 404 } })).toBe(DRIVE_ERROR_MESSAGES.notFound);
  });

  it('uses the server message for other errors', () => {
    expect(
      driveErrorMessage({
        status: 422,
        message: 'The given data was invalid.',
        errors: { authorization: ['Only owners, admins, and supervisors can manage company drive.'] },
      }),
    ).toBe('Only owners, admins, and supervisors can manage company drive.');
    expect(driveErrorMessage({ status: 0, message: '' })).toBe(DRIVE_ERROR_MESSAGES.generic);
  });
});

describe('driveApi', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.delete.mockReset();
  });

  it('lists files with the company and only the filters that are set', async () => {
    mocks.get.mockResolvedValue({
      data: { success: true, data: { items: [{ id: 1 }], pagination: { total: 1, per_page: 30, current_page: 1, last_page: 1 } } },
    });
    const page = await driveApi.listFiles({ folder_id: 4, search: '', page: 1 });
    expect(mocks.get).toHaveBeenCalledWith('/drive/files', { params: { company_id: 12, folder_id: 4, page: 1 } });
    expect(page.items).toEqual([{ id: 1 }]);
  });

  it('unwraps folder items', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: { items: [{ id: 2, name: 'ELY Reports' }] } } });
    await expect(driveApi.listFolders()).resolves.toEqual([{ id: 2, name: 'ELY Reports' }]);
  });

  it('downloads the file as a blob with the company', async () => {
    const blob = new Blob(['pdf']);
    mocks.get.mockResolvedValue({ data: blob });
    await expect(driveApi.fetchBlob(7)).resolves.toBe(blob);
    expect(mocks.get).toHaveBeenCalledWith(
      '/drive/files/7/download',
      expect.objectContaining({ params: { company_id: 12 }, responseType: 'blob' }),
    );
  });

  it('sends share and delete requests for the company', async () => {
    mocks.put.mockResolvedValue({ data: { data: { id: 7 } } });
    mocks.delete.mockResolvedValue({ data: { success: true } });
    await driveApi.syncGrants(7, { share_with_all: false, user_ids: [3, 5] });
    await driveApi.remove(7);
    expect(mocks.put).toHaveBeenCalledWith('/drive/files/7/grants', {
      company_id: 12,
      share_with_all: false,
      user_ids: [3, 5],
    });
    expect(mocks.delete).toHaveBeenCalledWith('/drive/files/7', { params: { company_id: 12 } });
  });
});

describe('drive utils', () => {
  it('picks the preview kind from mime type or name', () => {
    expect(drivePreviewKind({ mime_type: 'application/pdf', original_name: 'report' })).toBe('pdf');
    expect(drivePreviewKind({ mime_type: null, original_name: 'photo.JPG' })).toBe('image');
    expect(drivePreviewKind({ mime_type: 'text/csv', original_name: 'leads.csv' })).toBe('other');
  });

  it('labels files that will be auto-deleted', () => {
    expect(driveExpiryLabel({ expires_at: '2027-01-23T10:00:00Z' })).toBe('Auto-deletes on 23 Jan 2027');
    expect(driveExpiryLabel({ expires_at: null })).toBeNull();
    expect(driveExpiryLabel({})).toBeNull();
  });

  it('spots the ELY Reports folder', () => {
    expect(isElyReportsFolder({ system_key: 'ely_reports' })).toBe(true);
    expect(isElyReportsFolder({ system_key: null })).toBe(false);
    expect(isElyReportsFolder(null)).toBe(false);
  });

  it('accepts only positive integer ?file= values', () => {
    expect(parseDriveFileParam('42')).toBe(42);
    expect(parseDriveFileParam('0')).toBeNull();
    expect(parseDriveFileParam('4x')).toBeNull();
    expect(parseDriveFileParam(null)).toBeNull();
  });
});
