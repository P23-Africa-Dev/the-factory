import type { z } from 'zod';
import type {
  taskSchema,
  taskStatusSchema,
  updateTaskStatusPayloadSchema,
  taskFiltersSchema,
  createSelfTaskSchema,
} from './schema';

export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type UpdateTaskStatusPayload = z.infer<typeof updateTaskStatusPayloadSchema>;
export type TaskFilters = z.infer<typeof taskFiltersSchema> | undefined;
export type CreateSelfTaskPayload = z.infer<typeof createSelfTaskSchema>;
