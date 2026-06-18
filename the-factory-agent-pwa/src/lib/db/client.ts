/**
 * IndexedDB client — replaces expo-sqlite + drizzle-orm.
 *
 * Uses the `idb` library for a promise-based IndexedDB wrapper.
 * Schema version is bumped when tables change (like drizzle migrations).
 */
import { openDB, type IDBPDatabase } from 'idb';
import type {
  LocationQueueEntry,
  OfflineActionQueueEntry,
  OfflineConflictEntry,
  ProofQueueEntry,
  TaskDestinationCacheEntry,
} from './schema';

const DB_NAME = 'factory-agent-pwa';
const DB_VERSION = 2;

export type FactoryDB = IDBPDatabase<{
  locationQueue: {
    key: number;
    value: LocationQueueEntry;
    indexes: {
      'by-synced': number;
      'by-taskId': number;
      'by-nextAttemptAt': string;
    };
  };
  proofQueue: {
    key: number;
    value: ProofQueueEntry;
    indexes: {
      'by-uploaded': number;
      'by-taskId': number;
      'by-nextAttemptAt': string;
    };
  };
  taskDestinationCache: {
    key: number;
    value: TaskDestinationCacheEntry;
    indexes: {
      'by-taskId': number;
    };
  };
  offlineActionQueue: {
    key: number;
    value: OfflineActionQueueEntry;
    indexes: {
      'by-status': string;
      'by-company-user-status': [number, string, string];
      'by-createdAt': string;
      'by-nextAttemptAt': string;
      'by-clientMutationId': string;
    };
  };
  offlineConflicts: {
    key: number;
    value: OfflineConflictEntry;
    indexes: {
      'by-resolution': string;
      'by-company-user-resolution': [number, string, string];
      'by-actionQueueId': number;
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
    upgrade(db, oldVersion, _newVersion, transaction) {
      // Location queue
      if (!db.objectStoreNames.contains('locationQueue')) {
        const locationStore = db.createObjectStore('locationQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        locationStore.createIndex('by-synced', 'synced');
        locationStore.createIndex('by-taskId', 'taskId');
        locationStore.createIndex('by-nextAttemptAt', 'nextAttemptAt');
      } else if (oldVersion < 2) {
        const locationStore = transaction.objectStore('locationQueue');
        if (!locationStore.indexNames.contains('by-nextAttemptAt')) {
          locationStore.createIndex('by-nextAttemptAt', 'nextAttemptAt');
        }
      }

      // Proof queue
      if (!db.objectStoreNames.contains('proofQueue')) {
        const proofStore = db.createObjectStore('proofQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        proofStore.createIndex('by-uploaded', 'uploaded');
        proofStore.createIndex('by-taskId', 'taskId');
        proofStore.createIndex('by-nextAttemptAt', 'nextAttemptAt');
      } else if (oldVersion < 2) {
        const proofStore = transaction.objectStore('proofQueue');
        if (!proofStore.indexNames.contains('by-nextAttemptAt')) {
          proofStore.createIndex('by-nextAttemptAt', 'nextAttemptAt');
        }
      }

      // Task destination cache
      if (!db.objectStoreNames.contains('taskDestinationCache')) {
        const cacheStore = db.createObjectStore('taskDestinationCache', {
          keyPath: 'id',
          autoIncrement: true,
        });
        cacheStore.createIndex('by-taskId', 'taskId');
      }

      if (!db.objectStoreNames.contains('offlineActionQueue')) {
        const actionStore = db.createObjectStore('offlineActionQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        actionStore.createIndex('by-status', 'status');
        actionStore.createIndex('by-company-user-status', ['companyId', 'userId', 'status']);
        actionStore.createIndex('by-createdAt', 'createdAt');
        actionStore.createIndex('by-nextAttemptAt', 'nextAttemptAt');
        actionStore.createIndex('by-clientMutationId', 'clientMutationId', { unique: true });
      }

      if (!db.objectStoreNames.contains('offlineConflicts')) {
        const conflictStore = db.createObjectStore('offlineConflicts', {
          keyPath: 'id',
          autoIncrement: true,
        });
        conflictStore.createIndex('by-resolution', 'resolution');
        conflictStore.createIndex('by-company-user-resolution', ['companyId', 'userId', 'resolution']);
        conflictStore.createIndex('by-actionQueueId', 'actionQueueId');
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
