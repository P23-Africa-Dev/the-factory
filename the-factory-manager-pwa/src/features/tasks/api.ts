/**
 * Manager Tasks & Projects API (`/admin/tasks/*`, `/admin/projects/*`)
 */
import { client } from '@/lib/api/client';
import { getActiveCompanyId, setActiveCompanyId } from '@/lib/storage/stores';
import { taskSchema, taskListSchema } from './schema';
import type {
  Task,
  TaskFilters,
  UpdateTaskStatusPayload,
  UpdateTaskPayload,
  CreateSelfTaskPayload,
  TaskAssigneeOption,
  TaskReassignmentItem,
  ProjectItem,
} from './types';
import { queueOfflineAction } from '@/lib/offline/queue';
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

export type TaskListPagination = TaskPagination;

export type TaskListResult = {
  tasks: Task[];
  pagination: TaskPagination;
};

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

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
  } else if (Array.isArray(data?.tasks)) {
    items = data.tasks as unknown[];
  } else if (Array.isArray(data?.data)) {
    items = data.data as unknown[];
  } else if (Array.isArray(data)) {
    items = data as unknown[];
  } else if (Array.isArray(wrapped?.items)) {
    items = wrapped.items as unknown[];
  }

  const paginationRaw =
    (data?.pagination as Record<string, unknown> | undefined) ??
    (wrapped?.meta as Record<string, unknown> | undefined) ??
    data ??
    {};
  const currentPage = Number(paginationRaw.current_page ?? 1);
  const lastPage = Number(paginationRaw.last_page ?? 1);

  return {
    items,
    pagination: {
      nextPageUrl:
        (paginationRaw.next_page_url as string | null) ??
        (currentPage < lastPage ? String(currentPage + 1) : null),
      prevPageUrl: (paginationRaw.prev_page_url as string | null) ?? null,
      perPage:
        typeof paginationRaw.per_page === 'number' ? paginationRaw.per_page : items.length,
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

    if (isOffline() && companyId) {
      const cached = await getCachedTaskList(companyId, filters);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get('/admin/tasks', {
        params: { company_id: companyId ?? undefined, ...filters },
      });
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
      const response = url.startsWith('http')
        ? await client.get(url)
        : await client.get('/admin/tasks', {
            params: {
              page: Number(url) || 2,
              company_id: companyId ?? undefined,
            },
          });
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

    if (isOffline() && companyId) {
      const cached = await getCachedTaskDetail(companyId, id);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get(`/admin/tasks/${id}`, {
        params: { company_id: companyId ?? undefined },
      });
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
      throw parseErr;
    }
  },

  updateStatus: async ({ id, status }: UpdateTaskStatusPayload): Promise<void> => {
    const companyId = getActiveCompanyId();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'task.update_status',
        payload: { id, status, company_id: companyId },
        companyId,
      });
      return;
    }
    await client.patch(`/admin/tasks/${id}/status`, {
      status,
      company_id: companyId ?? undefined,
    });
  },

  assignTask: async (payload: {
    id: string | number;
    assigned_to?: number | null;
    assignee_ids?: number[];
  }): Promise<Task> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.patch(`/admin/tasks/${payload.id}/assign`, {
      assigned_to: payload.assigned_to ?? payload.assignee_ids?.[0] ?? null,
      assignee_ids: payload.assignee_ids,
      company_id: companyId ?? undefined,
    });
    const item = unwrapItem(data);
    return taskSchema.parse(item);
  },

  getAssignees: async (): Promise<TaskAssigneeOption[]> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.get('/admin/tasks/assignees', {
      params: { company_id: companyId ?? undefined },
    });
    const raw = unwrap<unknown>(data);
    if (Array.isArray(raw)) return raw as TaskAssigneeOption[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.assignees ?? obj.users ?? obj.agents ?? obj.data ?? []) as TaskAssigneeOption[];
    return Array.isArray(list) ? list : [];
  },

  getReassignmentsInbox: async (params?: {
    status?: string;
  }): Promise<TaskReassignmentItem[]> => {
    const { data } = await client.get('/admin/tasks/reassignments/inbox', { params });
    const raw = unwrap<unknown>(data);
    if (Array.isArray(raw)) return raw as TaskReassignmentItem[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.reassignments ?? obj.items ?? obj.data ?? []) as TaskReassignmentItem[];
    return Array.isArray(list) ? list : [];
  },

  respondReassignment: async (payload: {
    reassignmentId: number | string;
    action: 'accept' | 'reject';
    response_note?: string;
  }): Promise<unknown> => {
    const { data } = await client.post(
      `/admin/tasks/reassignments/${payload.reassignmentId}/${payload.action}`,
      {
        response_note: payload.response_note,
      },
    );
    return unwrap(data);
  },

  getTaskRoute: async (taskId: string | number): Promise<Record<string, unknown>> => {
    const { data } = await client.get(`/admin/tasks/${taskId}/route`);
    return unwrap<Record<string, unknown>>(data);
  },

  listProjects: async (): Promise<ProjectItem[]> => {
    const { data } = await client.get('/admin/projects');
    const raw = unwrap<unknown>(data);
    if (Array.isArray(raw)) return raw as ProjectItem[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.projects ?? obj.items ?? obj.data ?? []) as ProjectItem[];
    return Array.isArray(list) ? list : [];
  },

  createProject: async (payload: {
    name: string;
    description?: string;
    due_date?: string | null;
  }): Promise<ProjectItem> => {
    const { data } = await client.post('/admin/projects', payload);
    const raw = unwrap<Record<string, unknown>>(data);
    return ((raw && 'project' in raw ? raw.project : raw) ?? data) as ProjectItem;
  },

  update: async (payload: UpdateTaskPayload): Promise<void> => {
    const { id, ...fields } = payload;
    const companyId = getActiveCompanyId();
    await client.patch(`/admin/tasks/${id}`, {
      company_id: companyId ?? undefined,
      ...fields,
    });
  },

  delete: async (id: string): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.delete(`/admin/tasks/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
  },

  completeTask: async (taskId: number, _formData: FormData): Promise<void> => {
    await taskApi.updateStatus({ id: String(taskId), status: 'completed' });
  },

  createSelf: async (payload: CreateSelfTaskPayload): Promise<Task> => {
    const companyId = getActiveCompanyId();
    const requestPayload = {
      ...payload,
      company_id: companyId ?? undefined,
      assigned_to:
        typeof payload.assigned_to === 'number'
          ? payload.assigned_to
          : Array.isArray(payload.assignee_ids) && payload.assignee_ids.length > 0
            ? payload.assignee_ids[0]
            : undefined,
      assignee_ids: payload.assignee_ids,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'task.create_self',
        payload: requestPayload,
        companyId,
      });
      const tempId = `temp-${Date.now()}`;
      const mockTask = taskSchema.parse({
        id: tempId,
        company_id: companyId ?? undefined,
        title: payload.title,
        address: payload.address ?? payload.location ?? '—',
        location: payload.location ?? null,
        latitude: payload.latitude ? Number(payload.latitude) : 0,
        longitude: payload.longitude ? Number(payload.longitude) : 0,
        status: 'pending',
        due_date: payload.due_date ?? null,
        description: payload.description ?? undefined,
        priority: payload.priority ?? 'medium',
      });
      if (companyId) {
        await putCachedTaskDetail(companyId, mockTask);
      }
      return mockTask;
    }

    const response = await client.post('/admin/tasks', requestPayload);
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
