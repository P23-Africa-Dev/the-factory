import type { AuthUser } from "@/store/auth";

export type ActiveCompanyContext = {
  internalId: number | null;
  publicId: string | null;
  role: string | null;
  apiCompanyId: number | string | null;
};

export function getActiveCompanyContext(
  user: AuthUser | null | undefined
): ActiveCompanyContext {
  const company = user?.active_company;
  if (!company) {
    return {
      internalId: null,
      publicId: null,
      role: null,
      apiCompanyId: null,
    };
  }

  return {
    internalId: company.id ?? null,
    publicId: company.company_id ?? null,
    role: company.role ?? null,
    // Prefer public company key where available; backend accepts both.
    apiCompanyId: company.company_id ?? company.id ?? null,
  };
}
