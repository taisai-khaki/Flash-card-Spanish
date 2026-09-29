/**
 * Persistence.
 *
 * Decks live in IndexedDB so that a large word bank does not blow past the
 * ~5 MB localStorage quota; if IndexedDB is unavailable (private windows,
 * older browsers) everything transparently falls back to localStorage.
 *
 * Nothing is ever sent anywhere: the CSV you import stays on your machine.
 */

import type { Deck, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const DB_NAME = 'flashcards-mx';
const DB_VERSION = 1;
const STORE_DECKS = 'decks';
const STORE_SETTINGS = 'settings';
const SETTINGS_KEY = 'app';
const LS_PREFIX = 'fc-mx:';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DECKS)) db.createObjectStore(STORE_DECKS, { keyPath: 'meta.id' });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const transaction = db.transaction(store, mode);
          const request = run(transaction.objectStore(store));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// ------------------------------------------------------------------ localStorage fallback
const ls = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
      /* quota exceeded: the app keeps working in memory */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(LS_PREFIX + key);
    } catch {
      /* ignore */
    }
  },
  keys(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(LS_PREFIX)) out.push(key.slice(LS_PREFIX.length));
      }
    } catch {
      /* ignore */
    }
    return out;
  },
};

// ------------------------------------------------------------------ public API
export async function loadDecks(): Promise<Deck[]> {
  const fromIdb = await tx<Deck[]>(STORE_DECKS, 'readonly', (store) => store.getAll());
  if (fromIdb) return fromIdb;
  return ls
    .keys()
    .filter((key) => key.startsWith('deck:'))
    .map((key) => ls.get<Deck>(key))
    .filter((deck): deck is Deck => deck !== null);
}

export async function saveDeck(deck: Deck): Promise<void> {
  const stored = await tx(STORE_DECKS, 'readwrite', (store) => store.put(deck));
  if (stored === null) ls.set(`deck:${deck.meta.id}`, deck);
}

export async function deleteDeck(id: string): Promise<void> {
  const result = await tx(STORE_DECKS, 'readwrite', (store) => store.delete(id));
  if (result === null) ls.remove(`deck:${id}`);
}

export async function loadSettings(): Promise<Settings> {
  const fromIdb = await tx<Settings>(STORE_SETTINGS, 'readonly', (store) => store.get(SETTINGS_KEY));
  if (fromIdb) return { ...DEFAULT_SETTINGS, ...fromIdb };
  const fromLs = ls.get<Settings>('settings');
  return { ...DEFAULT_SETTINGS, ...(fromLs ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const result = await tx(STORE_SETTINGS, 'readwrite', (store) => store.put(settings, SETTINGS_KEY));
  if (result === null) ls.set('settings', settings);
}

export interface BackupFile {
  app: 'flashcards-mx';
  version: 1;
  exportedAt: number;
  settings: Settings;
  decks: Deck[];
}

export function buildBackup(settings: Settings, decks: Deck[]): BackupFile {
  return {
    app: 'flashcards-mx',
    version: 1,
    exportedAt: Date.now(),
    settings,
    decks,
  };
}

export function parseBackup(text: string): BackupFile | null {
  try {
    const parsed = JSON.parse(text) as BackupFile;
    if (parsed.app !== 'flashcards-mx' || !Array.isArray(parsed.decks)) return null;
    return parsed;
  } catch {
    return null;
  }
}
