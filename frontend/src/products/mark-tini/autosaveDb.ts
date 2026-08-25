const DB_NAME = 'documark-autosave';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const RECORD_KEY = 'current';

// Superseded by IndexedDB, kept only so an in-progress autosave from an
// older build isn't silently lost on upgrade.
const LEGACY_STORAGE_KEY_CONTENT = 'documark_autosave_content';
const LEGACY_STORAGE_KEY_FILENAME = 'documark_autosave_filename';

export interface AutosaveRecord {
  content: string;
  fileName: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFromDb(): Promise<AutosaveRecord | null> {
  const db = await openDb();
  try {
    return await new Promise<AutosaveRecord | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function migrateFromLocalStorage(): AutosaveRecord | null {
  try {
    const content = localStorage.getItem(LEGACY_STORAGE_KEY_CONTENT);
    if (content === null) return null;
    const fileName = localStorage.getItem(LEGACY_STORAGE_KEY_FILENAME);
    localStorage.removeItem(LEGACY_STORAGE_KEY_CONTENT);
    localStorage.removeItem(LEGACY_STORAGE_KEY_FILENAME);
    return { content, fileName: fileName || 'Untitled Document' };
  } catch {
    return null;
  }
}

export async function loadAutosave(): Promise<AutosaveRecord | null> {
  const fromDb = await readFromDb();
  if (fromDb !== null) return fromDb;

  const migrated = migrateFromLocalStorage();
  if (migrated !== null) {
    await saveAutosave(migrated);
  }
  return migrated;
}

export async function saveAutosave(record: AutosaveRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
