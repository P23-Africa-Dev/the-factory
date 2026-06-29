import { z } from 'zod';

export const kpiStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

export const kpiPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

export const kpiCategorySchema = z.enum([
  'sales',
  'customer_visits',
  'lead_generation',
  'collection',
  'survey',
  'merchandising',
  'others',
]);

export const kpiAssigneeSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    avatar_url: z.string().nullable().optional(),
  })
  .passthrough();

export const kpiSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
    company_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
    created_by_user_id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
    assigned_to_user_id: z.union([z.string(), z.number(), z.null()]).transform((v) => (v != null ? Number(v) : null)).optional(),
    name: z.string(),
    category: kpiCategorySchema,
    objective: z.string().nullable().optional().transform((v) => v ?? ''),
    target_value: z.union([z.string(), z.number()]).transform((v) => String(v)),
    expected_outcome: z.string().nullable().optional().transform((v) => v ?? ''),
    priority: kpiPrioritySchema,
    status: kpiStatusSchema,
    start_date: z.string(),
    end_date: z.string(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    cancelled_at: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((data) => ({
    id: data.id,
    companyId: data.company_id,
    createdByUserId: data.created_by_user_id,
    assignedToUserId: data.assigned_to_user_id ?? null,
    name: data.name,
    category: data.category,
    objective: data.objective,
    targetValue: data.target_value,
    expectedOutcome: data.expected_outcome,
    priority: data.priority,
    status: data.status,
    startDate: data.start_date,
    endDate: data.end_date,
    startedAt: data.started_at ?? null,
    completedAt: data.completed_at ?? null,
    cancelledAt: data.cancelled_at ?? null,
  }));

export const kpisListSchema = z.array(kpiSchema);
