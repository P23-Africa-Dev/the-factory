export type SavedLocation = {
  id: number;
  companyId: number | null;
  name: string;
  type: string | null;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  contactNumber: string | null;
  email: string | null;
  isActive: boolean;
  crmLeadId?: number | null;
  linkedToCrm?: boolean;
  canManage?: boolean;
  createdByName: string | null;
  createdAt: string | null;
};

export type CreateSavedLocationInput = {
  name: string;
  type?: string | null;
  description?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  contactNumber?: string | null;
  email?: string | null;
  saveToCrm?: boolean;
};

export type SavedLocationFilters = {
  q?: string;
  type?: string;
};
