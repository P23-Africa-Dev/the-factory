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
    creator: z
      .object({
        name: z.string().optional(),
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
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title must be at most 255 characters'),
  type: z.enum(['sales_visit', 'inspection', 'delivery', 'collection', 'awareness']),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000)
    .optional()
    .nullable(),
  location: z.string().min(2).max(255).optional().nullable(),
  address: z.string().min(5).max(1000).optional().nullable(),
  latitude: z.union([z.number(), z.string(), z.null()]).optional(),
  longitude: z.union([z.number(), z.string(), z.null()]).optional(),
  due_date: z.string().optional().nullable(),
  required_actions: z.array(z.string()).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().nullable(),
  minimum_photos_required: z.number().min(0).max(20).optional().nullable(),
  visit_verification_required: z.boolean().optional().nullable(),
});
