import type { DriveFile, DriveFolder } from "@/lib/api/drive";

export function makeDriveFolder(overrides: Partial<DriveFolder> = {}): DriveFolder {
  return {
    id: 1,
    company_id: 10,
    parent_id: null,
    name: "General",
    is_system: false,
    system_key: null,
    created_at: null,
    ...overrides,
  };
}

export function makeDriveFile(overrides: Partial<DriveFile> = {}): DriveFile {
  return {
    id: 100,
    company_id: 10,
    folder_id: 1,
    folder: null,
    original_name: "report.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    source: "upload",
    ely_report_id: null,
    uploaded_by_user_id: 1,
    can_manage: true,
    grants: [],
    created_at: "2026-11-01T10:00:00Z",
    expires_at: null,
    ...overrides,
  };
}
