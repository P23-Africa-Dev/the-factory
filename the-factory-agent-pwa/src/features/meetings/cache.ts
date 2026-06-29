import { getDb } from '@/lib/db/client';
import type { MeetingsListCacheEntry, MeetingDetailCacheEntry } from '@/lib/db/schema';
import type { Meeting, MeetingListResponse } from './types';
import { buildCacheId, stableFilterKey, urlPageKey } from '@/lib/offline/cacheKeys';

function listKey(companyId: number, pageKey: string): string {
  return buildCacheId(companyId, pageKey);
}

function detailKey(companyId: number, meetingId: number): string {
  return buildCacheId(companyId, String(meetingId));
}

export function meetingsFilterPageKey(filters?: unknown): string {
  return `filters:${stableFilterKey(filters)}`;
}

export function meetingsUrlPageKey(url: string): string {
  return urlPageKey(url);
}

export async function getCachedMeetingList(
  companyId: number,
  pageKey: string,
): Promise<MeetingListResponse | null> {
  const db = await getDb();
  const row = await db.get('meetingsListCache', listKey(companyId, pageKey));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as MeetingListResponse;
}

export async function putCachedMeetingList(
  companyId: number,
  pageKey: string,
  result: MeetingListResponse,
): Promise<void> {
  const db = await getDb();
  const entry: MeetingsListCacheEntry = {
    id: listKey(companyId, pageKey),
    companyId,
    pageKey,
    payloadJson: JSON.stringify(result),
    cachedAt: new Date().toISOString(),
  };
  await db.put('meetingsListCache', entry);
}

export async function getCachedMeetingDetail(
  companyId: number,
  meetingId: number,
): Promise<Meeting | null> {
  const db = await getDb();
  const row = await db.get('meetingDetailCache', detailKey(companyId, meetingId));
  if (!row) return null;
  return JSON.parse(row.payloadJson) as Meeting;
}

export async function putCachedMeetingDetail(
  companyId: number,
  meeting: Meeting,
): Promise<void> {
  const db = await getDb();
  const entry: MeetingDetailCacheEntry = {
    id: detailKey(companyId, meeting.id),
    companyId,
    meetingId: meeting.id,
    payloadJson: JSON.stringify(meeting),
    cachedAt: new Date().toISOString(),
  };
  await db.put('meetingDetailCache', entry);
}
