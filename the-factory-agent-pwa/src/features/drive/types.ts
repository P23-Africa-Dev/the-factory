/** Company Drive shapes — mirror the Laravel `/drive/*` responses (see web `lib/api/drive.ts`). */

export interface DriveFolder {
  id: number;
  company_id: number;
  parent_id: number | null;
  name: string;
  is_system: boolean;
  /** `ely_reports` marks the folder ELY saves weekly report PDFs into. */
  system_key: string | null;
  created_at: string | null;
}

export interface DriveFileGrant {
  grantee_type: 'user' | 'all';
  user_id: number | null;
}

export interface DriveFile {
  id: number;
  company_id: number;
  folder_id: number;
  folder: DriveFolder | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  source: string;
  ely_report_id: string | null;
  uploaded_by_user_id: number | null;
  can_manage: boolean;
  grants: DriveFileGrant[];
  created_at: string | null;
  /** When the server will auto-delete the file (ISO), or null when it is kept. */
  expires_at?: string | null;
}

export interface DriveUsage {
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  percent: number;
}

export interface DriveFilesPage {
  items: DriveFile[];
  pagination: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

export interface DriveFileFilters {
  folder_id?: number;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface DriveGrantsPayload {
  share_with_all: boolean;
  user_ids: number[];
}

/** Someone a file can be shared with. */
export interface DriveMember {
  id: number;
  name: string;
  email: string;
  role: string;
}

/**
 * Loads company members for the share picker. Passed in by the manager screen
 * so this shared feature never imports manager-only modules.
 */
export type DriveMemberLoader = () => Promise<DriveMember[]>;

export const ELY_REPORTS_SYSTEM_KEY = 'ely_reports';
