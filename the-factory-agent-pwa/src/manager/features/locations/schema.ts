import { z } from 'zod';

function coerceCoordinate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

const rawSavedLocationSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
    company_id: z.union([z.string(), z.number(), z.null()]).optional(),
    name: z.string(),
    type: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    latitude: z.union([z.number(), z.string(), z.null()]).optional(),
    longitude: z.union([z.number(), z.string(), z.null()]).optional(),
    contact_number: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    crm_lead_id: z.union([z.string(), z.number(), z.null()]).optional(),
    linked_to_crm: z.union([z.boolean(), z.number(), z.string()]).optional(),
    can_manage: z.union([z.boolean(), z.number(), z.string()]).optional(),
    is_active: z.union([z.boolean(), z.number(), z.string()]).optional(),
    created_by: z
      .object({ name: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
    created_at: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((data) => ({
    id: data.id,
    companyId:
      data.company_id != null && data.company_id !== '' ? Number(data.company_id) : null,
    name: data.name,
    type: data.type ?? null,
    description: data.description ?? null,
    address: data.address ?? null,
    latitude: coerceCoordinate(data.latitude),
    longitude: coerceCoordinate(data.longitude),
    contactNumber: data.contact_number ?? null,
    email: data.email ?? null,
    isActive:
      data.is_active === undefined
        ? true
        : data.is_active === true || data.is_active === 1 || data.is_active === '1',
    crmLeadId:
      data.crm_lead_id != null && data.crm_lead_id !== ''
        ? Number(data.crm_lead_id)
        : null,
    linkedToCrm:
      data.linked_to_crm === true ||
      data.linked_to_crm === 1 ||
      data.linked_to_crm === '1' ||
      (data.crm_lead_id != null && data.crm_lead_id !== ''),
    canManage:
      data.can_manage === true || data.can_manage === 1 || data.can_manage === '1',
    createdByName: data.created_by?.name ?? null,
    createdAt: data.created_at ?? null,
  }));

export const savedLocationSchema = rawSavedLocationSchema;
export const savedLocationListSchema = z.array(savedLocationSchema);

export const saveLocationFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  contactNumber: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
});

export type SaveLocationFormValues = z.infer<typeof saveLocationFormSchema>;
