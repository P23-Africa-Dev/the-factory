import { getDb } from '@/lib/db/client';
import type { SavedLocationCacheEntry } from '@/lib/db/schema';
import type { SavedLocation } from './types';

function toCacheEntry(
  location: SavedLocation,
  companyId: number,
  pending: 0 | 1,
): SavedLocationCacheEntry {
  return {
    id: location.id,
    companyId,
    name: location.name,
    type: location.type,
    description: location.description,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    contactNumber: location.contactNumber,
    email: location.email,
    isActive: location.isActive,
    createdByName: location.createdByName,
    createdAt: location.createdAt,
    pending,
    cachedAt: new Date().toISOString(),
  };
}

function fromCacheEntry(entry: SavedLocationCacheEntry): SavedLocation {
  return {
    id: entry.id,
    companyId: entry.companyId,
    name: entry.name,
    type: entry.type,
    description: entry.description,
    address: entry.address,
    latitude: entry.latitude,
    longitude: entry.longitude,
    contactNumber: entry.contactNumber,
    email: entry.email,
    isActive: entry.isActive,
    createdByName: entry.createdByName,
    createdAt: entry.createdAt,
  };
}

/** Replace the server-synced subset of the cache for a company with fresh rows. */
export async function replaceCachedLocations(
  companyId: number,
  locations: SavedLocation[],
): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllFromIndex('savedLocationsCache', 'by-company', companyId);
  const tx = db.transaction('savedLocationsCache', 'readwrite');
  // Drop previously-synced rows but keep pending offline rows so they remain visible.
  for (const row of existing) {
    if (row.pending !== 1 && row.id != null) {
      await tx.store.delete(row.id);
    }
  }
  for (const location of locations) {
    await tx.store.put(toCacheEntry(location, companyId, 0));
  }
  await tx.done;
}

export async function getCachedLocations(companyId: number): Promise<SavedLocation[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('savedLocationsCache', 'by-company', companyId);
  return rows.map(fromCacheEntry);
}

export async function putCachedLocation(
  companyId: number,
  location: SavedLocation,
  pending: 0 | 1,
): Promise<void> {
  const db = await getDb();
  await db.put('savedLocationsCache', toCacheEntry(location, companyId, pending));
}

export async function removeCachedLocation(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('savedLocationsCache', id);
}

/** Allocate a negative temp id for an offline-created location. */
export async function nextTempLocationId(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll('savedLocationsCache');
  const minId = all.reduce((min, row) => Math.min(min, row.id ?? 0), 0);
  return Math.min(minId, 0) - 1;
}
