import { z } from 'zod';

export const leadActorSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  name: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable().optional(),
});

export const leadContactSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)).optional(),
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  sort_order: z.number().nullable().optional(),
}).passthrough();

export const leadNoteSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  lead_id: z.number(),
  company_id: z.number(),
  note: z.string(),
  creator: leadActorSchema.nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const leadActivitySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  lead_id: z.number(),
  company_id: z.number(),
  type: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  happened_at: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  creator: leadActorSchema.nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const leadCustomFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const leadCustomFieldsSchema = z.record(z.string(), leadCustomFieldValueSchema);

export const leadFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multi_select',
  'checkbox',
  'url',
  'phone',
]);

export const leadFieldDefinitionSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  company_id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  type: leadFieldTypeSchema,
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional().default([]),
  is_required: z.boolean(),
  show_on_create: z.boolean(),
  show_in_list: z.boolean(),
  status: z.enum(['active', 'pending', 'declined', 'archived']),
  sort_order: z.number().optional().default(0),
});

const rawLeadSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  company_id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  pipeline_id: z.union([z.string(), z.number()]).transform(v => Number(v)).nullable().optional(),
  created_by_user_id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  assigned_to_user_id: z.union([z.string(), z.number()]).transform(v => Number(v)).nullable().optional(),
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  profile_urls: z.array(z.string()).nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low', 'urgent']).nullable().optional(),
  budget_amount: z.number().nullable().optional(),
  budget_currency: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_interaction_at: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  custom_fields: z.preprocess(
    value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
    leadCustomFieldsSchema,
  ).optional(),
  converted_at: z.string().nullable().optional(),
  creator: leadActorSchema.nullable().optional(),
  assignee: leadActorSchema.nullable().optional(),
  pipeline: z
    .object({ id: z.number(), name: z.string(), currency_code: z.string() })
    .nullable()
    .optional(),
  notes: z.array(leadNoteSchema).optional(),
  activities: z.array(leadActivitySchema).optional(),
  contacts: z.array(leadContactSchema).nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const leadSchema = rawLeadSchema.transform(data => ({
  id: data.id,
  companyId: data.company_id,
  pipelineId: data.pipeline_id ?? null,
  createdByUserId: data.created_by_user_id,
  assignedToUserId: data.assigned_to_user_id ?? null,
  name: data.name,
  email: data.email ?? null,
  phone: data.phone ?? null,
  location: data.location ?? null,
  companyName: data.company_name ?? null,
  website: data.website ?? null,
  position: data.position ?? null,
  profileUrls: data.profile_urls ?? [],
  source: data.source ?? null,
  status: data.status ?? null,
  priority: data.priority ?? null,
  budgetAmount: data.budget_amount ?? null,
  budgetCurrency: data.budget_currency ?? null,
  nextAction: data.next_action ?? null,
  lastInteraction: data.last_interaction ?? null,
  lastInteractionAt: data.last_interaction_at ?? null,
  meta: data.meta ?? null,
  customFields: data.custom_fields ?? {},
  convertedAt: data.converted_at ?? null,
  creator: data.creator ?? null,
  assignee: data.assignee ?? null,
  pipeline: data.pipeline ?? null,
  notes: data.notes ?? [],
  activities: data.activities ?? [],
  contacts: data.contacts ?? [],
  createdAt: data.created_at ?? null,
  updatedAt: data.updated_at ?? null,
}));

export const leadListSchema = z.array(leadSchema);

export const crmLabelSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  company_id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  name: z.string(),
  slug: z.string(),
  color: z.string(),
  sort_order: z.number(),
  is_default: z.boolean(),
});

export const crmPipelineSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  company_id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  name: z.string(),
  currency_code: z.string(),
  sort_order: z.number(),
  is_default: z.boolean(),
});

export const agentUploadOverviewSchema = z.object({
  total_uploaded_leads: z.number(),
  top_agent: z
    .object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      avatar_url: z.string().nullable(),
      total_uploads: z.number(),
    })
    .nullable()
    .optional(),
  recent_leads: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        status: z.string(),
        source: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        creator: leadActorSchema.nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  source_filter: z.string(),
});

export const createLeadPayloadSchema = z.object({
  company_id: z.union([z.number(), z.string()]),
  pipeline_id: z.union([z.number(), z.string()]),
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  profile_urls: z.array(z.string()).nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low', 'urgent']).optional(),
  next_action: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_interaction_at: z.string().nullable().optional(),
  assigned_to_user_id: z.number().nullable().optional(),
  contacts: z.array(leadContactSchema).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  custom_fields: leadCustomFieldsSchema.optional(),
});

export const updateLeadPayloadSchema = z.object({
  company_id: z.union([z.number(), z.string()]).optional(),
  pipeline_id: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  profile_urls: z.array(z.string()).nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low', 'urgent']).optional(),
  next_action: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_interaction_at: z.string().nullable().optional(),
  assigned_to_user_id: z.number().nullable().optional(),
  contacts: z.array(leadContactSchema).nullable().optional(),
  converted_at: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  custom_fields: leadCustomFieldsSchema.optional(),
});

export const createLeadFieldPayloadSchema = z.object({
  company_id: z.union([z.number(), z.string()]),
  label: z.string().min(1).max(80),
  description: z.string().max(255).nullable().optional(),
  type: leadFieldTypeSchema,
  options: z.array(z.string()).max(100).optional(),
  is_required: z.boolean().optional(),
  show_on_create: z.boolean().optional(),
  show_in_list: z.boolean().optional(),
});

export const leadFiltersSchema = z
  .object({
    company_id: z.union([z.number(), z.string()]).optional(),
    status: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low', 'urgent']).optional(),
    pipeline_id: z.union([z.number(), z.string()]).optional(),
    source: z.string().optional(),
    search: z.string().optional(),
    assigned_to_user_id: z.union([z.number(), z.string()]).optional(),
    per_page: z.number().optional(),
    page: z.number().optional(),
  })
  .optional();
