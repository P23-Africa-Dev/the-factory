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

const rawAssigneeSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    name: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    avatar_url: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
  })
  .passthrough();

const rawProofSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    file_url: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    photo_url: z.string().optional().nullable(),
    file_path: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    latitude: z.union([z.number(), z.string(), z.null()]).optional(),
    longitude: z.union([z.number(), z.string(), z.null()]).optional(),
    captured_at: z.string().optional().nullable(),
    created_at: z.string().optional().nullable(),
  })
  .passthrough();

const rawTaskSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    company_id: z.union([z.string(), z.number()]).transform((v) => Number(v)).optional(),
    project_id: z.union([z.string(), z.number(), z.null()]).optional(),
    title: z.string(),
    type: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    latitude: z.union([z.number(), z.string(), z.null()]).optional(),
    longitude: z.union([z.number(), z.string(), z.null()]).optional(),
    has_trackable_location: z.boolean().optional(),
    proximity_threshold: z.number().nullable().optional(),
    status: taskStatusSchema.catch('pending'),
    operational_status: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    assigned_at: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    instructions: z.string().nullable().optional(),
    completion_notes: z.string().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional().catch('medium'),
    assigned_by: z.string().nullable().optional(),
    assigned_agent_id: z.union([z.string(), z.number(), z.null()]).optional(),
    assigned_to: z.union([z.string(), z.number(), z.null(), rawAssigneeSchema]).optional(),
    assignee: rawAssigneeSchema.nullable().optional(),
    assignees: z.array(rawAssigneeSchema).nullable().optional(),
    proofs: z.array(rawProofSchema).nullable().optional(),
    completion_proofs: z.array(rawProofSchema).nullable().optional(),
    project: z
      .object({
        id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
        name: z.string().optional().nullable(),
      })
      .passthrough()
      .nullable()
      .optional(),
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
  .transform((data) => {
    const assigneesList = Array.isArray(data.assignees)
      ? data.assignees.map((a) => ({
          id: Number(a.id),
          name: a.name ?? 'Agent',
          email: a.email ?? '',
          avatarUrl: a.avatar_url ?? null,
        }))
      : data.assignee
        ? [
            {
              id: Number(data.assignee.id),
              name: data.assignee.name ?? 'Agent',
              email: data.assignee.email ?? '',
              avatarUrl: data.assignee.avatar_url ?? null,
            },
          ]
        : typeof data.assigned_to === 'object' && data.assigned_to !== null
          ? [
              {
                id: Number(data.assigned_to.id),
                name: data.assigned_to.name ?? 'Agent',
                email: data.assigned_to.email ?? '',
                avatarUrl: data.assigned_to.avatar_url ?? null,
              },
            ]
          : [];

    const primaryAssignee = assigneesList[0] ?? null;
    const resolvedAgentId =
      primaryAssignee?.id ??
      (data.assigned_agent_id != null && data.assigned_agent_id !== ''
        ? Number(data.assigned_agent_id)
        : typeof data.assigned_to === 'number' || typeof data.assigned_to === 'string'
          ? Number(data.assigned_to)
          : null);

    const rawProofs = data.proofs ?? data.completion_proofs ?? [];
    const proofs = Array.isArray(rawProofs)
      ? rawProofs.map((p) => ({
          id: Number(p.id),
          url: p.file_url ?? p.url ?? p.photo_url ?? p.file_path ?? '',
          notes: p.notes ?? p.note ?? null,
          latitude: p.latitude != null ? coerceCoordinate(p.latitude) : null,
          longitude: p.longitude != null ? coerceCoordinate(p.longitude) : null,
          createdAt: p.captured_at ?? p.created_at ?? null,
        }))
      : [];

    return {
      id: data.id,
      companyId: data.company_id ?? null,
      projectId: data.project_id != null ? Number(data.project_id) : data.project?.id ?? null,
      projectName: data.project?.name ?? null,
      title: data.title,
      type: data.type ?? 'sales_visit',
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
      operationalStatus: data.operational_status ?? null,
      dueDate: data.due_date ?? null,
      assignedAt: data.assigned_at ?? data.created_at ?? new Date().toISOString(),
      completedAt: data.completed_at ?? null,
      description: data.description ?? undefined,
      instructions: data.instructions ?? undefined,
      completionNotes: data.completion_notes ?? null,
      priority: data.priority ?? undefined,
      assignedBy: data.assigned_by ?? data.creator?.name ?? undefined,
      assignedAgentId: resolvedAgentId,
      assigneeName: primaryAssignee?.name ?? null,
      assigneeEmail: primaryAssignee?.email ?? null,
      assigneeAvatarUrl: primaryAssignee?.avatarUrl ?? null,
      assignees: assigneesList,
      proofs,
      requiredActions: (data.required_actions ?? []).filter(
        (a): a is string => typeof a === 'string' && a.trim().length > 0,
      ),
      minimumPhotosRequired:
        typeof data.minimum_photos_required === 'number' &&
        Number.isFinite(data.minimum_photos_required)
          ? Math.max(0, Math.floor(data.minimum_photos_required))
          : 0,
      visitVerificationRequired: Boolean(data.visit_verification_required),
    };
  });

export const taskSchema = rawTaskSchema;
export const taskListSchema = z.array(taskSchema);

export const updateTaskStatusPayloadSchema = z.object({
  id: z.string(),
  status: taskStatusSchema,
});

export const taskFiltersSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: z.string().optional(),
  assigned_to: z.union([z.number(), z.string()]).optional(),
  project_id: z.union([z.number(), z.string()]).optional(),
  search: z.string().optional(),
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
  type: z
    .enum(['sales_visit', 'inspection', 'delivery', 'collection', 'awareness'])
    .optional()
    .default('sales_visit'),
  description: z
    .string({ error: 'Task description is required.' })
    .trim()
    .min(1, 'Task description is required.')
    .max(5000),
  location: z.string().max(255).optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  latitude: z.union([z.number(), z.string(), z.null()]).optional(),
  longitude: z.union([z.number(), z.string(), z.null()]).optional(),
  due_date: z.string().optional().nullable(),
  required_actions: z.array(z.string()).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().nullable(),
  minimum_photos_required: z.number().min(0).max(20).optional().nullable(),
  visit_verification_required: z.boolean().optional().nullable(),
  assigned_to: z.union([z.number(), z.array(z.number()), z.null()]).optional(),
  assignee_ids: z.array(z.number()).optional(),
  project_id: z.number().optional().nullable(),
  kpi_id: z.number().optional().nullable(),
});
