// IndexedDB cache for PromptAnalysis results. Keyed by SHA-256 of the prompt
// + model id so identical prompts hit instantly on reload. Phase 2 wires this
// into analyzePrompt(); we ship it in Phase 1 because it has no transformers
// dependency and the cache layer is useful before the model loads.

import type { PromptAnalysis } from "../types";

const DB_NAME = "prompt-x-ray";
const STORE = "analyses";
const VERSION = 1;

/** Stamped on every row at write time; rows with a different schema version
 *  are skipped on read so old shapes don't crash newer code. */
const SCHEMA_VERSION = 1;

interface CacheRow {
  key: string;
  _schemaVersion: number;
  analysis: PromptAnalysis;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function hashKey(prompt: string, model: string): Promise<string> {
  const data = new TextEncoder().encode(`${model}::${prompt}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getCached(prompt: string, model = "gpt2"): Promise<PromptAnalysis | null> {
  let key: string;
  let db: IDBDatabase;
  try {
    key = await hashKey(prompt, model);
    db = await openDb();
  } catch (err) {
    console.warn("cache open failed:", err);
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as CacheRow | undefined;
        if (!row) return resolve(null);
        if (row._schemaVersion !== SCHEMA_VERSION) {
          // Stale schema; skip rather than crash. The next put will overwrite.
          return resolve(null);
        }
        resolve(row.analysis ?? null);
      };
      req.onerror = () => {
        console.warn("cache read failed:", req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("cache read threw:", err);
      resolve(null);
    }
  });
}

function writeOnce(db: IDBDatabase, row: CacheRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putCached(prompt: string, analysis: PromptAnalysis): Promise<void> {
  const key = await hashKey(prompt, analysis.model);
  const db = await openDb();
  const row: CacheRow = {
    key,
    _schemaVersion: SCHEMA_VERSION,
    analysis,
    savedAt: Date.now(),
  };
  try {
    await writeOnce(db, row);
  } catch (err) {
    if ((err as { name?: string })?.name === "QuotaExceededError") {
      // Best-effort recovery: nuke the cache once and retry the put. If it
      // still fails the caller's catch handles it.
      try {
        await clearCache();
        await writeOnce(db, row);
        return;
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

export async function clearCache(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
