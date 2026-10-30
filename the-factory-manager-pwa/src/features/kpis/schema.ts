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
    id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    name: z.string(),
    email: z.string().optional().default(''),
    avatar_url: z.string().nullable().optional(),
  })
  .passthrough();

export const kpiSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => Number(v)),
    company_id: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional().default(0),
    created_by_user_id: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional().default(0),
    assigned_to_user_id: z
      .union([z.string(), z.number(), z.null()])
      .transform((v) => (v != null && v !== '' ? Number(v) : null))
      .optional(),
    assignee: kpiAssigneeSchema.nullable().optional(),
    assigned_to: kpiAssigneeSchema.nullable().optional(),
    name: z.string(),
    category: kpiCategorySchema.catch('others'),
    objective: z.string().nullable().optional().transform((v) => v ?? ''),
    target_value: z.union([z.string(), z.number(), z.null()]).transform((v) => String(v ?? '')),
    expected_outcome: z.string().nullable().optional().transform((v) => v ?? ''),
    priority: kpiPrioritySchema.catch('medium'),
    status: kpiStatusSchema.catch('pending'),
    start_date: z.string().nullable().optional().transform((v) => v ?? ''),
    end_date: z.string().nullable().optional().transform((v) => v ?? ''),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    cancelled_at: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((data) => {
    const assigneeObj = data.assignee ?? data.assigned_to ?? null;
    return {
      id: data.id,
      companyId: data.company_id,
      createdByUserId: data.created_by_user_id,
      assignedToUserId: data.assigned_to_user_id ?? assigneeObj?.id ?? null,
      assigneeName: assigneeObj?.name ?? null,
      assigneeEmail: assigneeObj?.email ?? null,
      assigneeAvatarUrl: assigneeObj?.avatar_url ?? null,
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
    };
  });

export const kpisListSchema = z.array(kpiSchema);
