import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import { secureStorage } from "./storage";

/**
 * What the app keeps on the phone, in one SQLite database (it replaced
 * AsyncStorage, which caps out around 6 MB on Android and rewrites the whole
 * value on every save):
 *
 *   queue  one row per form waiting to upload. Its payload and label hold
 *          personal data (names), so both are encrypted (AES-GCM) with a key
 *          kept in the phone's secure store, and the row is deleted as soon
 *          as it is sent.
 *   cache  reference lists and survey forms for offline use; no personal
 *          data by design (offline-cache.ts), so stored as it is.
 *
 * Anything left in AsyncStorage by an older version of the app is moved in
 * once, then removed there.
 */

const DB_NAME = "meal-mis.db";
const KEY_NAME = "meal-mis.device-key.v1";
const OLD_QUEUE_KEY = "meal-mis.queue.v1";
const OLD_CACHE_PREFIX = "meal-mis.cache.v1:";

let ready: Promise<SQLite.SQLiteDatabase> | null = null;

/** The database, created and filled from the old storage on first use. */
export function db(): Promise<SQLite.SQLiteDatabase> {
  if (!ready) {
    ready = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queue (
          id          TEXT PRIMARY KEY NOT NULL,
          kind        TEXT NOT NULL,
          label       TEXT NOT NULL,
          payload     TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          attempts    INTEGER NOT NULL DEFAULT 0,
          last_error  TEXT,
          owner       TEXT
        );
        CREATE TABLE IF NOT EXISTS cache (
          key       TEXT PRIMARY KEY NOT NULL,
          value     TEXT NOT NULL,
          saved_at  TEXT NOT NULL
        );
      `);
      await moveFromAsyncStorage(database);
      return database;
    })();
    ready.catch(() => {
      ready = null; // try again next time rather than failing for the whole launch
    });
  }
  return ready;
}

/* ------------------------------ encryption ------------------------------ */

let key: Promise<Uint8Array> | null = null;

/** The phone's own 256-bit key, made once and kept in the secure store (Keychain / Keystore). */
function deviceKey(): Promise<Uint8Array> {
  if (!key) {
    key = (async () => {
      const saved = await secureStorage.get(KEY_NAME);
      if (saved) return hexToBytes(saved);
      const made = Crypto.getRandomBytes(32);
      await secureStorage.set(KEY_NAME, bytesToHex(made));
      return made;
    })();
    key.catch(() => {
      key = null;
    });
  }
  return key;
}

/** Text in, "<nonce hex>:<ciphertext hex>" out. */
export async function seal(text: string): Promise<string> {
  const nonce = Crypto.getRandomBytes(12);
  const sealed = gcm(await deviceKey(), nonce).encrypt(utf8ToBytes(text));
  return `${bytesToHex(nonce)}:${bytesToHex(sealed)}`;
}

export async function open(stored: string): Promise<string> {
  const [nonce, sealed] = stored.split(":");
  return bytesToUtf8(gcm(await deviceKey(), hexToBytes(nonce)).decrypt(hexToBytes(sealed)));
}

/* --------------------------- the one-time move --------------------------- */

async function moveFromAsyncStorage(database: SQLite.SQLiteDatabase) {
  let keys: readonly string[] = [];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return;
  }
  const oldCache = keys.filter((k) => k.startsWith(OLD_CACHE_PREFIX));
  if (!keys.includes(OLD_QUEUE_KEY) && oldCache.length === 0) return;

  const raw = await AsyncStorage.getItem(OLD_QUEUE_KEY).catch(() => null);
  const items = raw ? (JSON.parse(raw) as OldQueued[]) : [];
  for (const item of Array.isArray(items) ? items : []) {
    await database.runAsync(
      "INSERT OR IGNORE INTO queue (id, kind, label, payload, created_at, attempts, last_error) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        item.id,
        item.kind,
        await seal(item.label),
        await seal(JSON.stringify(item.payload)),
        item.createdAt,
        item.attempts ?? 0,
        item.lastError ?? null,
      ],
    );
  }
  for (const k of oldCache) {
    const entry = await AsyncStorage.getItem(k).catch(() => null);
    if (!entry) continue;
    const { savedAt, data } = JSON.parse(entry) as { savedAt: string; data: unknown };
    await database.runAsync("INSERT OR IGNORE INTO cache (key, value, saved_at) VALUES (?, ?, ?)", [
      k.slice(OLD_CACHE_PREFIX.length),
      JSON.stringify(data),
      savedAt,
    ]);
  }
  // Only once everything is in: a failure above leaves the old copy for next time.
  await AsyncStorage.multiRemove([OLD_QUEUE_KEY, ...oldCache]).catch(() => undefined);
}

interface OldQueued {
  id: string;
  kind: string;
  label: string;
  payload: unknown;
  createdAt: string;
  attempts?: number;
  lastError?: string;
}
