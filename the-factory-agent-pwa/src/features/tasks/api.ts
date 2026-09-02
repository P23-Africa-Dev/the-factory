import { client } from '@/lib/api/client';
import { getActiveCompanyId, setActiveCompanyId } from '@/lib/storage/stores';
import { taskSchema, taskListSchema } from './schema';
import type { Task, TaskFilters, UpdateTaskStatusPayload, UpdateTaskPayload, CreateSelfTaskPayload } from './types';
import { env } from '@/constants/env';
import { queueOfflineAction } from '@/lib/offline/queue';
import { appStore } from '@/lib/storage/stores';
import { isOffline, shouldUseCache } from '@/lib/offline/connectivity';
import { setShowingCachedData } from '@/lib/offline/cacheIndicator';
import {
  getCachedTaskDetail,
  getCachedTaskList,
  getCachedTaskListByPageKey,
  putCachedTaskDetail,
  putCachedTaskList,
  putCachedTaskListByPageKey,
} from './cache';
import { urlPageKey } from '@/lib/offline/cacheKeys';

const isDev = process.env.NODE_ENV !== 'production';

export type TaskPagination = {
  nextPageUrl: string | null;
  prevPageUrl: string | null;
  perPage: number;
};

export type TaskListResult = {
  tasks: Task[];
  pagination: TaskPagination;
};

function unwrapListPayload(raw: unknown): { items: unknown[]; pagination: TaskPagination } {
  if (Array.isArray(raw)) {
    return {
      items: raw,
      pagination: { nextPageUrl: null, prevPageUrl: null, perPage: raw.length },
    };
  }

  const wrapped = raw as Record<string, unknown>;
  const data = (wrapped?.data as Record<string, unknown> | undefined) ?? wrapped;

  let items: unknown[] = [];
  if (Array.isArray(data?.items)) {
    items = data.items as unknown[];
  } else if (Array.isArray(data)) {
    items = data as unknown[];
  } else if (Array.isArray(wrapped?.items)) {
    items = wrapped.items as unknown[];
  }

  const paginationRaw = (data?.pagination as Record<string, unknown> | undefined) ?? {};
  return {
    items,
    pagination: {
      nextPageUrl: (paginationRaw.next_page_url as string | null) ?? null,
      prevPageUrl: (paginationRaw.prev_page_url as string | null) ?? null,
      perPage: typeof paginationRaw.per_page === 'number' ? paginationRaw.per_page : items.length,
    },
  };
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

function parseTaskList(items: unknown[]): Task[] {
  if (items.length > 0) seedCompanyId(items[0]);
  return taskListSchema.parse(items);
}

export const taskApi = {
  list: async (filters?: TaskFilters): Promise<TaskListResult> => {
    const companyId = getActiveCompanyId();
    if (isDev) {
      console.log('[taskApi.list] company_id:', companyId, 'filters:', filters);
    }

    if (isOffline() && companyId) {
      const cached = await getCachedTaskList(companyId, filters);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get('/agent/tasks', {
        params: { company_id: companyId ?? undefined, ...filters },
      });
      if (isDev) {
        console.log('[taskApi.list] raw response:', JSON.stringify(response.data, null, 2));
      }
      const { items, pagination } = unwrapListPayload(response.data);
      const result = {
        tasks: parseTaskList(items),
        pagination,
      };
      const resolvedCompanyId = getActiveCompanyId();
      if (resolvedCompanyId) {
        void putCachedTaskList(resolvedCompanyId, filters, result).catch(() => {});
      }
      setShowingCachedData(false);
      return result;
    } catch (err) {
      const resolvedCompanyId = getActiveCompanyId();
      if (resolvedCompanyId && shouldUseCache(err)) {
        const cached = await getCachedTaskList(resolvedCompanyId, filters);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      if (isDev) {
        console.log('[taskApi.list] error:', err);
      }
      throw err;
    }
  },

  listByUrl: async (url: string): Promise<TaskListResult> => {
    const companyId = getActiveCompanyId();
    const pageKey = urlPageKey(url);

    if (isOffline() && companyId) {
      const cached = await getCachedTaskListByPageKey(companyId, pageKey);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get(url);
      const { items, pagination } = unwrapListPayload(response.data);
      const result = {
        tasks: parseTaskList(items),
        pagination,
      };
      const resolvedCompanyId = getActiveCompanyId();
      if (resolvedCompanyId) {
        void putCachedTaskListByPageKey(resolvedCompanyId, pageKey, result).catch(() => {});
      }
      setShowingCachedData(false);
      return result;
    } catch (err) {
      if (companyId && shouldUseCache(err)) {
        const cached = await getCachedTaskListByPageKey(companyId, pageKey);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      throw err;
    }
  },

  get: async (id: string): Promise<Task> => {
    const companyId = getActiveCompanyId();
    if (isDev) {
      console.log('[taskApi.get] id:', id, '| company_id:', companyId);
    }

    if (isOffline() && companyId) {
      const cached = await getCachedTaskDetail(companyId, id);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get(`/agent/tasks/${id}`, {
        params: { company_id: companyId ?? undefined },
      });
      if (isDev) {
        console.log('[taskApi.get] raw response:', JSON.stringify(response.data, null, 2));
      }
      const item = unwrapItem(response.data);
      seedCompanyId(item);
      const task = taskSchema.parse(item);
      const resolvedCompanyId = getActiveCompanyId();
      if (resolvedCompanyId) {
        void putCachedTaskDetail(resolvedCompanyId, task).catch(() => {});
      }
      setShowingCachedData(false);
      return task;
    } catch (parseErr) {
      const resolvedCompanyId = getActiveCompanyId();
      if (resolvedCompanyId && shouldUseCache(parseErr)) {
        const cached = await getCachedTaskDetail(resolvedCompanyId, id);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      if (isDev) {
        console.log('[taskApi.get] error:', parseErr);
      }
      throw parseErr;
    }
  },

  updateStatus: async ({ id, status }: UpdateTaskStatusPayload): Promise<void> => {
    const companyId = getActiveCompanyId();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'task.update_status',
        payload: { id, status, company_id: companyId },
      });
      return;
    }
    await client.patch(`/agent/tasks/${id}/status`, {
      status,
      company_id: companyId ?? undefined,
    });
  },

  update: async ({ id, title, description, location, address }: UpdateTaskPayload): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.patch(`/agent/tasks/${id}`, {
      company_id: companyId ?? undefined,
      title,
      description,
      location,
      address,
    });
  },

  delete: async (id: string): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.delete(`/agent/tasks/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
  },

  completeTask: async (taskId: number, formData: FormData): Promise<void> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const companyIdFromForm = formData.get('company_id');
      const notesFromForm = formData.get('notes');
      const lat = formData.get('latitude');
      const lng = formData.get('longitude');
      const accuracy = formData.get('accuracy_meters');
      const recordedAt = formData.get('recorded_at');
      await queueOfflineAction({
        actionType: 'task.complete',
        payload: {
          taskId,
          company_id:
            typeof companyIdFromForm === 'string'
              ? Number(companyIdFromForm)
              : getActiveCompanyId(),
          notes: typeof notesFromForm === 'string' ? notesFromForm : '',
          latitude: typeof lat === 'string' ? Number(lat) : 0,
          longitude: typeof lng === 'string' ? Number(lng) : 0,
          accuracy_meters: typeof accuracy === 'string' ? Number(accuracy) : null,
          recorded_at: typeof recordedAt === 'string' ? recordedAt : new Date().toISOString(),
        },
      });
      return;
    }

    const token = appStore.getString('auth_token');
    const res = await fetch(`${env.API_BASE_URL}/agent/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token ?? ''}`,
      },
      body: formData,
    });
    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw { status: res.status, message: err.message ?? 'Completion failed' };
    }
  },

  createSelf: async (payload: CreateSelfTaskPayload): Promise<Task> => {
    const companyId = getActiveCompanyId();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'task.create_self',
        payload: { ...payload, company_id: companyId },
      });
      const tempId = `temp-${Date.now()}`;
      const mockTask: Task = {
        id: tempId,
        companyId: companyId ?? null,
        title: payload.title,
        address: payload.address ?? payload.location ?? '—',
        location: payload.location ?? null,
        latitude: payload.latitude ? Number(payload.latitude) : 0,
        longitude: payload.longitude ? Number(payload.longitude) : 0,
        hasMapLocation: Boolean(payload.latitude && payload.longitude),
        proximityThreshold: 50,
        status: 'pending',
        dueDate: payload.due_date ?? null,
        assignedAt: new Date().toISOString(),
        description: payload.description ?? undefined,
        instructions: undefined,
        priority: payload.priority ?? undefined,
        assignedBy: 'You',
        assignedAgentId: null,
        requiredActions: [],
        minimumPhotosRequired: 0,
        visitVerificationRequired: false,
      };
      if (companyId) {
        await putCachedTaskDetail(companyId, mockTask);
      }
      return mockTask;
    }

    const response = await client.post('/agent/tasks/self', {
      ...payload,
      company_id: companyId ?? undefined,
    });
    const item = unwrapItem(response.data);
    seedCompanyId(item);
    const task = taskSchema.parse(item);
    const resolvedCompanyId = getActiveCompanyId();
    if (resolvedCompanyId) {
      await putCachedTaskDetail(resolvedCompanyId, task).catch(() => {});
    }
    return task;
  },
};
