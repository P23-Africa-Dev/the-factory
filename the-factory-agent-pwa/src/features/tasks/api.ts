import { client } from '@/lib/api/client';
import { appStore, getActiveCompanyId, setActiveCompanyId } from '@/lib/storage/stores';
import { taskSchema, taskListSchema } from './schema';
import type { Task, TaskFilters, UpdateTaskStatusPayload } from './types';
import { env } from '@/constants/env';
import { queueOfflineAction } from '@/lib/offline/queue';

const isDev = process.env.NODE_ENV !== 'production';

// Laravel paginates as { data: [...], meta: {…} } or returns a plain array
function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const wrapped = raw as Record<string, unknown>;
  // Plain { data: [...] }
  if (Array.isArray(wrapped?.data)) return wrapped.data as unknown[];
  // Paginated { data: { items: [...], pagination: {} } }
  const nested = wrapped?.data as Record<string, unknown> | undefined;
  if (Array.isArray(nested?.items)) return nested.items as unknown[];
  return [];
}

function seedCompanyId(rawTask: unknown): void {
  if (!getActiveCompanyId()) {
    const t = rawTask as Record<string, unknown>;
    const id = t?.company_id;
    if (typeof id === 'number') setActiveCompanyId(id);
    else if (typeof id === 'string' && id) setActiveCompanyId(Number(id));
  }
}

function unwrapItem(raw: unknown): unknown {
  const wrapped = raw as Record<string, unknown>;
  if (wrapped?.data === undefined) return raw;
  const data = wrapped.data as Record<string, unknown>;
  if (data?.task && typeof data.task === 'object') return data.task;
  if (data?.item && typeof data.item === 'object') return data.item;
  return data;
}

export const taskApi = {
  list: async (filters?: TaskFilters): Promise<Task[]> => {
    const companyId = getActiveCompanyId();
    if (isDev) {
      console.log('[taskApi.list] company_id:', companyId);
    }
    const response = await client.get('/agent/tasks', {
      params: { company_id: companyId ?? undefined, ...filters },
    });
    if (isDev) {
      console.log('[taskApi.list] raw response:', JSON.stringify(response.data, null, 2));
    }
    try {
      const items = unwrapList(response.data);
      if (items.length > 0) seedCompanyId(items[0]);
      return taskListSchema.parse(items);
    } catch (parseErr) {
      if (isDev) {
        console.log('[taskApi.list] Zod parse error:', JSON.stringify(parseErr, null, 2));
      }
      throw parseErr;
    }
  },

  get: async (id: string): Promise<Task> => {
    const companyId = getActiveCompanyId();
    if (isDev) {
      console.log('[taskApi.get] id:', id, '| company_id:', companyId);
    }
    const response = await client.get(`/agent/tasks/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
    if (isDev) {
      console.log('[taskApi.get] raw response:', JSON.stringify(response.data, null, 2));
    }
    try {
      const item = unwrapItem(response.data);
      seedCompanyId(item);
      return taskSchema.parse(item);
    } catch (parseErr) {
      if (isDev) {
        console.log('[taskApi.get] Zod parse error:', JSON.stringify(parseErr, null, 2));
      }
      throw parseErr;
    }
  },

  updateStatus: async ({ id, status }: UpdateTaskStatusPayload): Promise<void> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'task.update_status',
        payload: { id, status },
      });
      return;
    }
    await client.patch(`/tasks/${id}/status`, { status });
  },

  completeTask: async (taskId: number, formData: FormData): Promise<void> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const companyIdFromForm = formData.get('company_id');
      const notesFromForm = formData.get('notes');
      await queueOfflineAction({
        actionType: 'task.complete',
        payload: {
          taskId,
          company_id:
            typeof companyIdFromForm === 'string'
              ? Number(companyIdFromForm)
              : getActiveCompanyId(),
          notes: typeof notesFromForm === 'string' ? notesFromForm : '',
        },
      });
      return;
    }

    const token = appStore.getString('auth_token');
    const res = await fetch(
      `${env.API_BASE_URL}/agent/tasks/${taskId}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: formData,
      },
    );
    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw { status: res.status, message: err.message ?? 'Completion failed' };
    }
  },
};
