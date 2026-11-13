import { z } from 'zod';

import { taskHasMapLocation } from './location';

export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'paused',
  'resumed',
  'completed',
  'cancelled',
]);

function coerceCoordinate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

const rawTaskSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    company_id: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
    title: z.string(),
    address: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    latitude: z.union([z.number(), z.string(), z.null()]).optional(),
    longitude: z.union([z.number(), z.string(), z.null()]).optional(),
    has_trackable_location: z.boolean().optional(),
    proximity_threshold: z.number().nullable().optional(),
    status: taskStatusSchema,
    due_date: z.string().nullable().optional(),
    assigned_at: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    instructions: z.string().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
    assigned_by: z.string().nullable().optional(),
    assigned_agent_id: z.union([z.string(), z.number(), z.null()]).optional(),
    required_actions: z.array(z.string()).optional().nullable(),
    minimum_photos_required: z.number().optional().nullable(),
    visit_verification_required: z.boolean().optional().nullable(),
    created_by_user_id: z.union([z.string(), z.number()]).nullish(),
    comments_count: z.number().nullish(),
    subtasks: z
      .array(
        z
          .object({
            id: z.union([z.string(), z.number()]),
            title: z.string(),
            due_at: z.string().nullable().optional(),
            is_completed: z.boolean().optional(),
            assignee: z
              .object({
                id: z.union([z.string(), z.number()]),
                name: z.string().optional(),
              })
              .passthrough()
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .optional()
      .nullable(),
    creator: z
      .object({
        name: z.string().optional(),
        id: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()
  .transform((data) => ({
    id: data.id,
    companyId: data.company_id ?? null,
    title: data.title,
    address: (data.address ?? data.location ?? '').trim() || '—',
    location: data.location ?? data.address ?? null,
    latitude: coerceCoordinate(data.latitude),
    longitude: coerceCoordinate(data.longitude),
    hasMapLocation:
      data.has_trackable_location ??
      taskHasMapLocation({
        latitude: coerceCoordinate(data.latitude),
        longitude: coerceCoordinate(data.longitude),
      }),
    proximityThreshold: data.proximity_threshold ?? 50,
    status: data.status,
    dueDate: data.due_date ?? null,
    assignedAt: data.assigned_at ?? data.created_at ?? new Date().toISOString(),
    description: data.description ?? undefined,
    instructions: data.instructions ?? undefined,
    priority: data.priority ?? undefined,
    ...((data.created_by_user_id ?? data.creator?.id) != null && { creatorId: String(data.created_by_user_id ?? data.creator?.id) }),
    ...(data.comments_count != null && { commentCount: data.comments_count }),
    assignedBy: data.assigned_by ?? data.creator?.name ?? undefined,
    assignedAgentId:
      data.assigned_agent_id != null && data.assigned_agent_id !== ''
        ? Number(data.assigned_agent_id)
        : null,
    requiredActions: (data.required_actions ?? []).filter(
      (a): a is string => typeof a === 'string' && a.trim().length > 0,
    ),
    minimumPhotosRequired:
      typeof data.minimum_photos_required === 'number' && Number.isFinite(data.minimum_photos_required)
        ? Math.max(0, Math.floor(data.minimum_photos_required))
        : 0,
    visitVerificationRequired: Boolean(data.visit_verification_required),
    checklistSteps: (data.subtasks ?? []).map((item) => ({
      id: String(item.id),
      title: item.title,
      assigneeId: item.assignee ? String(item.assignee.id) : '',
      assigneeName: item.assignee?.name ?? 'Unassigned',
      dueAt: item.due_at ?? null,
      done: Boolean(item.is_completed),
    })),
  }));

export const taskSchema = rawTaskSchema;

export const taskListSchema = z.array(taskSchema);

export const updateTaskStatusPayloadSchema = z.object({
  id: z.string(),
  status: taskStatusSchema,
});

export const taskFiltersSchema = z.object({
  status: taskStatusSchema.optional(),
  page: z.number().optional(),
});

export const completionSchema = z.object({
  photos: z.array(z.string()).min(1, 'At least one photo is required'),
  notes: z.string().optional(),
});

export const createSelfTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Task title is required')
    .max(255, 'Title must be at most 255 characters'),
  type: z.enum(['sales_visit', 'inspection', 'delivery', 'collection', 'awareness']).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  latitude: z.union([z.number(), z.string(), z.null()]).optional(),
  longitude: z.union([z.number(), z.string(), z.null()]).optional(),
  due_date: z.string().optional().nullable(),
  required_actions: z.array(z.string()).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().nullable(),
  minimum_photos_required: z.number().min(0).max(20).optional().nullable(),
  visit_verification_required: z.boolean().optional().nullable(),
  subtasks: z
    .array(
      z.object({
        title: z.string().min(1).max(255),
        assigned_user_id: z.union([z.number(), z.string()]).optional(),
        due_at: z.string().nullable().optional(),
      }),
    )
    .max(50)
    .optional(),
});
