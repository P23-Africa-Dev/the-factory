import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { queueOfflineAction } from '@/lib/offline/queue';
import { savedLocationSchema, savedLocationListSchema } from './schema';
import type { CreateSavedLocationInput, SavedLocation, SavedLocationFilters } from './types';
import {
  getCachedLocations,
  nextTempLocationId,
  putCachedLocation,
  replaceCachedLocations,
} from './cache';

const isDev = process.env.NODE_ENV !== 'production';

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const wrapped = raw as Record<string, unknown>;
  const data = (wrapped?.data as Record<string, unknown> | undefined) ?? wrapped;
  if (Array.isArray(data?.items)) return data.items as unknown[];
  if (Array.isArray(data)) return data as unknown[];
  if (Array.isArray(wrapped?.items)) return wrapped.items as unknown[];
  return [];
}

function unwrapItem(raw: unknown): unknown {
  const wrapped = raw as Record<string, unknown>;
  if (wrapped?.data === undefined) return raw;
  const data = wrapped.data as Record<string, unknown>;
  if (data?.location && typeof data.location === 'object') return data.location;
  if (data?.item && typeof data.item === 'object') return data.item;
  return data;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export const locationApi = {
  list: async (filters?: SavedLocationFilters): Promise<SavedLocation[]> => {
    const companyId = getActiveCompanyId();

    if (isOffline() && companyId) {
      return getCachedLocations(companyId);
    }

    try {
      const response = await client.get('/agent/locations', {
        params: { company_id: companyId ?? undefined, ...filters },
      });
      const items = unwrapList(response.data);
      const locations = savedLocationListSchema.parse(items);
      void replaceCachedLocations(locations).catch(() => {});
      return locations;
    } catch (err) {
      if (companyId) {
        const cached = await getCachedLocations(companyId);
        if (cached.length > 0) return cached;
      }
      if (isDev) console.log('[locationApi.list] error:', err);
      throw err;
    }
  },

  get: async (id: number): Promise<SavedLocation> => {
    const companyId = getActiveCompanyId();
    const response = await client.get(`/agent/locations/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
    return savedLocationSchema.parse(unwrapItem(response.data));
  },

  create: async (input: CreateSavedLocationInput): Promise<SavedLocation> => {
    const companyId = getActiveCompanyId();
    const payload = {
      company_id: companyId ?? undefined,
      name: input.name,
      type: input.type ?? undefined,
      description: input.description ?? undefined,
      address: input.address ?? undefined,
      latitude: input.latitude,
      longitude: input.longitude,
      contact_number: input.contactNumber ?? undefined,
      email: input.email ?? undefined,
      save_to_crm: input.saveToCrm ?? false,
    };

    if (isOffline()) {
      const tempId = companyId ? await nextTempLocationId() : -Date.now();
      const optimistic: SavedLocation = {
        id: tempId,
        companyId: companyId ?? null,
        name: input.name,
        type: input.type ?? null,
        description: input.description ?? null,
        address: input.address ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        contactNumber: input.contactNumber ?? null,
        email: input.email ?? null,
        isActive: true,
        createdByName: null,
        createdAt: new Date().toISOString(),
      };
      if (companyId) {
        await putCachedLocation(companyId, optimistic, 1);
      }
      await queueOfflineAction({
        actionType: 'location.create',
        payload,
        companyId,
      });
      return optimistic;
    }

    const response = await client.post('/agent/locations', payload);
    const location = savedLocationSchema.parse(unwrapItem(response.data));
    if (companyId) {
      void putCachedLocation(companyId, location, 0).catch(() => {});
    }
    return location;
  },
};
