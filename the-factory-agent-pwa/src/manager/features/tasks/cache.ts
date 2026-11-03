import { getDb } from '@/lib/db/client';
import type { TasksListCacheEntry, TaskDetailCacheEntry } from '@/lib/db/schema';
import type { TaskListResult } from './api';
import type { Task } from './types';
import { buildCacheId, stableFilterKey } from '@/lib/offline/cacheKeys';

function listKey(companyId: number, filters?: unknown): string {
  return buildCacheId(companyId, stableFilterKey(filters));
}

function detailKey(companyId: number, taskId: string): string {
  return buildCacheId(companyId, taskId);
}

export async function getCachedTaskList(
  companyId: number,
  filters?: unknown,
): Promise<TaskListResult | null> {
  const db = await getDb();
  const row = await db.get('tasksListCache', listKey(companyId, filters));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as TaskListResult;
}

export async function putCachedTaskList(
  companyId: number,
  filters: unknown,
  result: TaskListResult,
): Promise<void> {
  const db = await getDb();
  const filterKey = stableFilterKey(filters);
  const entry: TasksListCacheEntry = {
    id: listKey(companyId, filters),
    companyId,
    filterKey,
    payloadJson: JSON.stringify(result),
    cachedAt: new Date().toISOString(),
  };
  await db.put('tasksListCache', entry);
}

export async function getCachedTaskListByPageKey(
  companyId: number,
  pageKey: string,
): Promise<TaskListResult | null> {
  const db = await getDb();
  const row = await db.get('tasksListCache', buildCacheId(companyId, pageKey));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as TaskListResult;
}

export async function putCachedTaskListByPageKey(
  companyId: number,
  pageKey: string,
  result: TaskListResult,
): Promise<void> {
  const db = await getDb();
  const entry: TasksListCacheEntry = {
    id: buildCacheId(companyId, pageKey),
    companyId,
    filterKey: pageKey,
    payloadJson: JSON.stringify(result),
    cachedAt: new Date().toISOString(),
  };
  await db.put('tasksListCache', entry);
}

export async function getCachedTaskDetail(
  companyId: number,
  taskId: string,
): Promise<Task | null> {
  const db = await getDb();
  const row = await db.get('taskDetailCache', detailKey(companyId, taskId));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as Task;
}

export async function putCachedTaskDetail(
  companyId: number,
  task: Task,
): Promise<void> {
  const db = await getDb();
  const entry: TaskDetailCacheEntry = {
    id: detailKey(companyId, task.id),
    companyId,
    taskId: task.id,
    payloadJson: JSON.stringify(task),
    cachedAt: new Date().toISOString(),
  };
  await db.put('taskDetailCache', entry);
}
