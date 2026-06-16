/**
 * IndexedDB client — replaces expo-sqlite + drizzle-orm.
 *
 * Uses the `idb` library for a promise-based IndexedDB wrapper.
 * Schema version is bumped when tables change (like drizzle migrations).
 */
import { openDB, type IDBPDatabase } from 'idb';
import type {
  LocationQueueEntry,
  ProofQueueEntry,
  TaskDestinationCacheEntry,
} from './schema';

const DB_NAME = 'factory-agent-pwa';
const DB_VERSION = 1;

export type FactoryDB = IDBPDatabase<{
  locationQueue: {
    key: number;
    value: LocationQueueEntry;
    indexes: {
      'by-synced': number;
      'by-taskId': number;
    };
  };
  proofQueue: {
    key: number;
    value: ProofQueueEntry;
    indexes: {
      'by-uploaded': number;
      'by-taskId': number;
    };
  };
  taskDestinationCache: {
    key: number;
    value: TaskDestinationCacheEntry;
    indexes: {
      'by-taskId': number;
    };
  };
}>;

let dbInstance: FactoryDB | null = null;

/**
 * Opens (and creates/migrates) the IndexedDB database.
 * Returns a singleton instance.
 */
export async function getDb(): Promise<FactoryDB> {
  if (dbInstance) return dbInstance;

  dbInstance = (await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Location queue
      if (!db.objectStoreNames.contains('locationQueue')) {
        const locationStore = db.createObjectStore('locationQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        locationStore.createIndex('by-synced', 'synced');
        locationStore.createIndex('by-taskId', 'taskId');
      }

      // Proof queue
      if (!db.objectStoreNames.contains('proofQueue')) {
        const proofStore = db.createObjectStore('proofQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        proofStore.createIndex('by-uploaded', 'uploaded');
        proofStore.createIndex('by-taskId', 'taskId');
      }

      // Task destination cache
      if (!db.objectStoreNames.contains('taskDestinationCache')) {
        const cacheStore = db.createObjectStore('taskDestinationCache', {
          keyPath: 'id',
          autoIncrement: true,
        });
        cacheStore.createIndex('by-taskId', 'taskId');
      }
    },
  })) as unknown as FactoryDB;

  return dbInstance;
}

/**
 * Run migrations — for IndexedDB this is handled by the upgrade callback.
 * This function exists for API parity with the mobile app's runMigrations().
 */
export async function runMigrations(): Promise<void> {
  await getDb();
}
