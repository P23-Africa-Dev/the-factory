import { z } from 'zod';

export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'paused',
  'resumed',
  'completed',
  'cancelled',
]);

// Parses the raw snake_case Laravel response and transforms to camelCase for the app
const rawTaskSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(v => String(v)),
  company_id: z.union([z.string(), z.number()]).transform(v => Number(v)).optional(),
  title: z.string(),
  address: z.string(),
  latitude: z.number().optional().default(0),
  longitude: z.number().optional().default(0),
  proximity_threshold: z.number().optional().default(50),
  status: taskStatusSchema,
  due_date: z.string().nullable().optional(),
  assigned_at: z.string().optional(),
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
  assigned_by: z.string().nullable().optional(),
  assigned_agent_id: z.union([z.string(), z.number()]).transform(v => Number(v)).optional(),
});

export const taskSchema = rawTaskSchema.transform(data => ({
  id: data.id,
  companyId: data.company_id ?? null,
  title: data.title,
  address: data.address,
  latitude: data.latitude,
  longitude: data.longitude,
  proximityThreshold: data.proximity_threshold,
  status: data.status,
  dueDate: data.due_date ?? null,
  assignedAt: data.assigned_at ?? new Date().toISOString(),
  description: data.description ?? undefined,
  instructions: data.instructions ?? undefined,
  priority: data.priority ?? undefined,
  assignedBy: data.assigned_by ?? undefined,
  assignedAgentId: data.assigned_agent_id ?? null,
}));

export const taskListSchema = z.array(taskSchema);

export const updateTaskStatusPayloadSchema = z.object({
  id: z.string(),
  status: taskStatusSchema,
});

export const taskFiltersSchema = z.object({
  status: taskStatusSchema.optional(),
}).optional();

export const completionSchema = z.object({
  photos: z.array(z.string()).min(1, 'At least one photo is required'),
  notes: z.string().optional(),
});
