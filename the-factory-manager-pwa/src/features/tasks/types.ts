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
export type UpdateTaskPayload = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  address?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string | null;
  project_id?: number | null;
  assigned_to?: number | number[] | null;
};
export type TaskFilters = z.infer<typeof taskFiltersSchema> | undefined;
export type CreateSelfTaskPayload = z.infer<typeof createSelfTaskSchema>;

export type TaskAssigneeOption = {
  id: number;
  name: string;
  email: string;
  role?: string | null;
  avatar_url?: string | null;
};

export type TaskReassignmentItem = {
  id: number;
  task_id: number;
  task_title?: string;
  task?: {
    id: number;
    title: string;
    status?: string;
    priority?: string;
    address?: string | null;
  } | null;
  from_user?: { id: number; name: string; email?: string } | null;
  to_user?: { id: number; name: string; email?: string } | null;
  requester_name?: string;
  target_name?: string;
  reason?: string | null;
  response_note?: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | string;
  created_at?: string | null;
};

export type ProjectItem = {
  id: number;
  name: string;
  description?: string | null;
  status?: string;
  due_date?: string | null;
  tasks_count?: number;
  completed_tasks_count?: number;
  progress?: number;
};
