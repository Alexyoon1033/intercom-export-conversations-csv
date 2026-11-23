/**
 * ChatVault IndexedDB Checkpoint Engine
 * Saves export progress every 50 conversations (or on demand):
 * - starting_after cursor
 * - completedIds (array of exported conversation IDs)
 * - cumulative statistics & skipped_errors
 * - buffered chunks (for seamless resume when using fallback download or appending)
 * Includes an automatic in-memory fallback for environments where IndexedDB is unavailable (e.g. Node.js unit tests).
 */

const DB_NAME = 'ChatVaultCheckpointDB';
const DB_VERSION = 1;
const STORE_NAME = 'checkpoints';
const DEFAULT_KEY = 'active_export';

export class CheckpointDB {
  constructor(options = {}) {
    this.dbName = options.dbName || DB_NAME;
    this.storeName = options.storeName || STORE_NAME;
    this.indexedDBRef = options.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    this._memoryStore = new Map();
    this._dbPromise = null;
  }

  async _getDb() {
    if (!this.indexedDBRef) {
      return null;
    }
    if (this._dbPromise) {
      return this._dbPromise;
    }

    this._dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDBRef.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'checkpointId' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error || new Error('IndexedDB open error'));
      };
    });

    return this._dbPromise;
  }

  /**
   * Saves a checkpoint snapshot.
   * @param {Object} snapshot
   * @param {string} [checkpointId='active_export']
   */
  async saveCheckpoint(snapshot, checkpointId = DEFAULT_KEY) {
    const record = {
      checkpointId,
      platform: snapshot.platform || 'intercom',
      region: snapshot.region || 'US',
      format: snapshot.format || 'csv',
      csvMode: snapshot.csvMode || 'summary',
      startingAfter: snapshot.startingAfter || null,
      completedIds: Array.isArray(snapshot.completedIds)
        ? [...snapshot.completedIds]
        : Array.from(snapshot.completedIds || []),
      exportedCount: typeof snapshot.exportedCount === 'number'
        ? snapshot.exportedCount
        : (snapshot.completedIds ? (snapshot.completedIds.length ?? snapshot.completedIds.size ?? 0) : 0),
      totalCount: typeof snapshot.totalCount === 'number' ? snapshot.totalCount : 0,
      skippedErrors: Array.isArray(snapshot.skippedErrors) ? [...snapshot.skippedErrors] : [],
      runSettings: snapshot.runSettings || null,
      readyToResume: Boolean(snapshot.readyToResume),
      updatedAt: new Date().toISOString()
    };

    const db = await this._getDb();
    if (!db) {
      this._memoryStore.set(checkpointId, structuredClone ? structuredClone(record) : JSON.parse(JSON.stringify(record)));
      return record;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(record);

      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error || new Error('Failed to save checkpoint'));
    });
  }

  /**
   * Loads an existing checkpoint snapshot, or returns null if none exists.
   * @param {string} [checkpointId='active_export']
   */
  async loadCheckpoint(checkpointId = DEFAULT_KEY) {
    const db = await this._getDb();
    if (!db) {
      const rec = this._memoryStore.get(checkpointId);
      return rec ? (structuredClone ? structuredClone(rec) : JSON.parse(JSON.stringify(rec))) : null;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(checkpointId);

      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error || new Error('Failed to load checkpoint'));
    });
  }

  /**
   * Clears a checkpoint snapshot upon completion or manual reset.
   * @param {string} [checkpointId='active_export']
   */
  async clearCheckpoint(checkpointId = DEFAULT_KEY) {
    const db = await this._getDb();
    if (!db) {
      this._memoryStore.delete(checkpointId);
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.delete(checkpointId);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error || new Error('Failed to clear checkpoint'));
    });
  }
}
