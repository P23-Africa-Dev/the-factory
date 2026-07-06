import { getDb } from '@/lib/db/client';
import type {
  CrmMetaCacheEntry,
  LeadDetailCacheEntry,
  LeadsListCacheEntry,
} from '@/lib/db/schema';
import { appStore } from '@/lib/storage/stores';
import type { CrmLabel, CrmPipeline, Lead, LeadsResult } from './types';
import { buildCacheId, stableFilterKey } from '@/lib/offline/cacheKeys';

function listKey(companyId: number, filters?: unknown): string {
  return buildCacheId(companyId, stableFilterKey(filters));
}

function detailKey(companyId: number, leadId: number): string {
  return buildCacheId(companyId, String(leadId));
}

function metaKey(companyId: number, metaType: 'labels' | 'pipelines'): string {
  return buildCacheId(companyId, metaType);
}

function getAuthUserId(): number | null {
  try {
    const raw = appStore.getString('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: number | string };
    if (parsed.id == null) return null;
    return Number(parsed.id);
  } catch {
    return null;
  }
}

export async function getCachedLeadsList(
  companyId: number,
  filters?: unknown,
): Promise<LeadsResult | null> {
  const db = await getDb();
  const row = await db.get('leadsListCache', listKey(companyId, filters));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as LeadsResult;
}

export async function putCachedLeadsList(
  companyId: number,
  filters: unknown,
  result: LeadsResult,
): Promise<void> {
  const db = await getDb();
  const filterKey = stableFilterKey(filters);
  const entry: LeadsListCacheEntry = {
    id: listKey(companyId, filters),
    companyId,
    filterKey,
    payloadJson: JSON.stringify(result),
    cachedAt: new Date().toISOString(),
  };
  await db.put('leadsListCache', entry);
}

export async function getCachedLeadDetail(
  companyId: number,
  leadId: number,
): Promise<Lead | null> {
  const db = await getDb();
  const row = await db.get('leadDetailCache', detailKey(companyId, leadId));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as Lead;
}

export async function putCachedLeadDetail(
  companyId: number,
  lead: Lead,
  pending: 0 | 1 = 0,
): Promise<void> {
  const db = await getDb();
  const entry: LeadDetailCacheEntry = {
    id: detailKey(companyId, lead.id),
    companyId,
    leadId: lead.id,
    payloadJson: JSON.stringify(lead),
    pending,
    cachedAt: new Date().toISOString(),
  };
  await db.put('leadDetailCache', entry);
}

export async function removeCachedLeadDetail(
  companyId: number,
  leadId: number,
): Promise<void> {
  const db = await getDb();
  await db.delete('leadDetailCache', detailKey(companyId, leadId));
}

export async function nextTempLeadId(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll('leadDetailCache');
  const minId = all.reduce((min, row) => Math.min(min, row.leadId ?? 0), 0);
  return Math.min(minId, 0) - 1;
}

export async function remapLeadId(
  companyId: number,
  tempId: number,
  serverLead: Lead,
): Promise<void> {
  const db = await getDb();
  await db.delete('leadDetailCache', detailKey(companyId, tempId));
  await putCachedLeadDetail(companyId, serverLead, 0);

  const listRows = await db.getAllFromIndex('leadsListCache', 'by-company', companyId);
  for (const row of listRows) {
    const parsed = JSON.parse(row.payloadJson) as LeadsResult;
    const hasTemp = parsed.leads.some((lead) => lead.id === tempId);
    if (!hasTemp) continue;

    const leads = parsed.leads.map((lead) =>
      lead.id === tempId ? serverLead : lead,
    );
    await db.put('leadsListCache', {
      ...row,
      payloadJson: JSON.stringify({ ...parsed, leads }),
      cachedAt: new Date().toISOString(),
    });
  }
}

export async function prependLeadToListCaches(
  companyId: number,
  lead: Lead,
): Promise<void> {
  const db = await getDb();
  const listRows = await db.getAllFromIndex('leadsListCache', 'by-company', companyId);
  for (const row of listRows) {
    const parsed = JSON.parse(row.payloadJson) as LeadsResult;
    const leads = [lead, ...parsed.leads.filter((item) => item.id !== lead.id)];
    await db.put('leadsListCache', {
      ...row,
      payloadJson: JSON.stringify({ ...parsed, leads }),
      cachedAt: new Date().toISOString(),
    });
  }
}

export async function mergeLeadInCaches(
  companyId: number,
  leadId: number,
  patch: Partial<Lead>,
): Promise<void> {
  const db = await getDb();
  const detailRow = await db.get('leadDetailCache', detailKey(companyId, leadId));
  if (detailRow) {
    const existing = JSON.parse(detailRow.payloadJson) as Lead;
    await putCachedLeadDetail(
      companyId,
      { ...existing, ...patch, id: leadId },
      detailRow.pending ?? 0,
    );
  }

  const listRows = await db.getAllFromIndex('leadsListCache', 'by-company', companyId);
  for (const row of listRows) {
    const parsed = JSON.parse(row.payloadJson) as LeadsResult;
    const leads = parsed.leads.map((lead) =>
      lead.id === leadId ? { ...lead, ...patch, id: leadId } : lead,
    );
    await db.put('leadsListCache', {
      ...row,
      payloadJson: JSON.stringify({ ...parsed, leads }),
      cachedAt: new Date().toISOString(),
    });
  }
}

export async function getCachedCrmLabels(companyId: number): Promise<CrmLabel[] | null> {
  const db = await getDb();
  const row = await db.get('crmMetaCache', metaKey(companyId, 'labels'));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as CrmLabel[];
}

export async function putCachedCrmLabels(
  companyId: number,
  labels: CrmLabel[],
): Promise<void> {
  const db = await getDb();
  const entry: CrmMetaCacheEntry = {
    id: metaKey(companyId, 'labels'),
    companyId,
    metaType: 'labels',
    payloadJson: JSON.stringify(labels),
    cachedAt: new Date().toISOString(),
  };
  await db.put('crmMetaCache', entry);
}

export async function getCachedCrmPipelines(companyId: number): Promise<CrmPipeline[] | null> {
  const db = await getDb();
  const row = await db.get('crmMetaCache', metaKey(companyId, 'pipelines'));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as CrmPipeline[];
}

export async function putCachedCrmPipelines(
  companyId: number,
  pipelines: CrmPipeline[],
): Promise<void> {
  const db = await getDb();
  const entry: CrmMetaCacheEntry = {
    id: metaKey(companyId, 'pipelines'),
    companyId,
    metaType: 'pipelines',
    payloadJson: JSON.stringify(pipelines),
    cachedAt: new Date().toISOString(),
  };
  await db.put('crmMetaCache', entry);
}

export function buildOptimisticLead(params: {
  tempId: number;
  companyId: number;
  payload: {
    pipeline_id: number | string;
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    company_name?: string | null;
    website?: string | null;
    position?: string | null;
    profile_urls?: string[] | null;
    source?: string | null;
    status?: string;
    priority?: Lead['priority'];
    next_action?: string | null;
    assigned_to_user_id?: number | null;
    meta?: Record<string, unknown> | null;
  };
}): Lead {
  const userId = getAuthUserId() ?? 0;
  const now = new Date().toISOString();
  return {
    id: params.tempId,
    companyId: params.companyId,
    pipelineId: Number(params.payload.pipeline_id),
    createdByUserId: userId,
    assignedToUserId: params.payload.assigned_to_user_id ?? null,
    name: params.payload.name,
    email: params.payload.email ?? null,
    phone: params.payload.phone ?? null,
    location: params.payload.location ?? null,
    companyName: params.payload.company_name ?? null,
    website: params.payload.website ?? null,
    position: params.payload.position ?? null,
    profileUrls: params.payload.profile_urls ?? [],
    source: params.payload.source ?? null,
    status: params.payload.status ?? null,
    priority: params.payload.priority ?? null,
    budgetAmount: null,
    budgetCurrency: null,
    nextAction: params.payload.next_action ?? null,
    lastInteraction: null,
    lastInteractionAt: null,
    meta: params.payload.meta ?? null,
    convertedAt: null,
    creator: null,
    assignee: null,
    pipeline: null,
    notes: [],
    activities: [],
    createdAt: now,
    updatedAt: now,
  };
}
