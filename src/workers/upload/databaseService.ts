// databaseService.ts

import { UploadChunk, UploadState } from "./types";

import { broadcastLog } from "./logger";

const DB_CONFIG = {
  name: "UploadServiceWorkerDB",
  version: 1,
  stores: {
    uploads: "uploads",
    chunks: "chunks",
    metadata: "metadata",
  },
};

class DatabaseService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Opens a connection to the IndexedDB database, creating object stores if necessary.
   */
  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(DB_CONFIG.stores.uploads)) {
          db.createObjectStore(DB_CONFIG.stores.uploads, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(DB_CONFIG.stores.chunks)) {
          const chunkStore = db.createObjectStore(DB_CONFIG.stores.chunks, {
            keyPath: "id",
          });
          chunkStore.createIndex("uploadId", "uploadId", { unique: false });
        }

        if (!db.objectStoreNames.contains(DB_CONFIG.stores.metadata)) {
          db.createObjectStore(DB_CONFIG.stores.metadata, { keyPath: "id" });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Wraps an IndexedDB request in a Promise for easier async/await usage.
   */
  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Saves the upload state to the IndexedDB database.
   */
  async saveUploadState(state: UploadState): Promise<void> {
    broadcastLog(
      `Saving upload state for contentId: ${state.contentId}`,
      "info"
    );
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(
        [DB_CONFIG.stores.uploads],
        "readwrite"
      );
      const store = transaction.objectStore(DB_CONFIG.stores.uploads);
      await this.promisifyRequest(store.put(state));
      broadcastLog(
        `Successfully saved upload state for contentId: ${state.contentId}`,
        "info"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      broadcastLog(
        `Error saving upload state: ${errorMessage}`,
        "error",
        state.contentId
      );
      throw error;
    }
  }

  /**
   * Loads the upload state from the IndexedDB database.
   */
  async loadUploadState(id: string): Promise<UploadState | undefined> {
    broadcastLog(`Loading upload state for id: ${id}`, "info");
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(
        [DB_CONFIG.stores.uploads],
        "readonly"
      );
      const store = transaction.objectStore(DB_CONFIG.stores.uploads);
      const result = await this.promisifyRequest<UploadState | undefined>(
        store.get(id)
      );
      broadcastLog(`Successfully loaded upload state for id: ${id}`, "info");
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      broadcastLog(`Error loading upload state: ${errorMessage}`, "error", id);
      throw error;
    }
  }

  /**
   * Saves an upload chunk to the IndexedDB database.
   */
  async saveChunk(chunk: UploadChunk): Promise<void> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(
        [DB_CONFIG.stores.chunks],
        "readwrite"
      );
      const store = transaction.objectStore(DB_CONFIG.stores.chunks);
      await this.promisifyRequest(store.put(chunk));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Loads all chunks associated with a specific upload ID.
   */
  async loadChunks(uploadId: string): Promise<UploadChunk[]> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction([DB_CONFIG.stores.chunks], "readonly");
      const store = transaction.objectStore(DB_CONFIG.stores.chunks);
      const index = store.index("uploadId");
      const result = await this.promisifyRequest(index.getAll(uploadId));
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Deletes the upload state from the IndexedDB database.
   */
  async deleteUploadState(contentId: string): Promise<void> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(
        [DB_CONFIG.stores.uploads],
        "readwrite"
      );
      const store = transaction.objectStore(DB_CONFIG.stores.uploads);
      await this.promisifyRequest(store.delete(contentId));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Deletes all chunks associated with a specific upload ID.
   */
  async deleteChunks(uploadId: string): Promise<void> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(
        [DB_CONFIG.stores.chunks],
        "readwrite"
      );
      const store = transaction.objectStore(DB_CONFIG.stores.chunks);
      const index = store.index("uploadId");
      const cursorRequest = index.openKeyCursor(IDBKeyRange.only(uploadId));

      await new Promise<void>((resolve, reject) => {
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursor>).result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Loads all upload states from the IndexedDB database.
   */
  async loadAllUploadStates(): Promise<UploadState[]> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction(
        [DB_CONFIG.stores.uploads],
        "readonly"
      );
      const store = transaction.objectStore(DB_CONFIG.stores.uploads);
      const result = await this.promisifyRequest(store.getAll());
      return result;
    } catch (error) {
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();
