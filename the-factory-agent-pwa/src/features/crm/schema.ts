import { z } from 'zod';

export const leadActorSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => Number(v)),
  name: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable().optional(),
});

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
  source: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low', 'urgent']).nullable().optional(),
  budget_amount: z.number().nullable().optional(),
  budget_currency: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_interaction_at: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  converted_at: z.string().nullable().optional(),
  creator: leadActorSchema.nullable().optional(),
  assignee: leadActorSchema.nullable().optional(),
  pipeline: z
    .object({ id: z.number(), name: z.string(), currency_code: z.string() })
    .nullable()
    .optional(),
  notes: z.array(leadNoteSchema).optional(),
  activities: z.array(leadActivitySchema).optional(),
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
  source: data.source ?? null,
  status: data.status ?? null,
  priority: data.priority ?? null,
  budgetAmount: data.budget_amount ?? null,
  budgetCurrency: data.budget_currency ?? null,
  nextAction: data.next_action ?? null,
  lastInteraction: data.last_interaction ?? null,
  lastInteractionAt: data.last_interaction_at ?? null,
  meta: data.meta ?? null,
  convertedAt: data.converted_at ?? null,
  creator: data.creator ?? null,
  assignee: data.assignee ?? null,
  pipeline: data.pipeline ?? null,
  notes: data.notes ?? [],
  activities: data.activities ?? [],
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
  source: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low', 'urgent']).optional(),
  next_action: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_interaction_at: z.string().nullable().optional(),
  assigned_to_user_id: z.number().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateLeadPayloadSchema = z.object({
  company_id: z.union([z.number(), z.string()]).optional(),
  pipeline_id: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low', 'urgent']).optional(),
  next_action: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_interaction_at: z.string().nullable().optional(),
  assigned_to_user_id: z.number().nullable().optional(),
  converted_at: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
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
