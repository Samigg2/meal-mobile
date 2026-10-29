import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import { secureStorage } from "./storage";

/**
 * What the app keeps on the phone, in one SQLite database (it replaced
 * AsyncStorage, which caps out around 6 MB on Android and rewrites the whole
 * value on every save). The whole file is encrypted by SQLCipher (app.json,
 * expo-sqlite `useSQLCipher`) with a key kept in the phone's secure store, so
 * search runs in SQLite itself, at native speed, on data that stays encrypted
 * at rest (Proclamation 1321/2024). Decided 2026-10-29.
 *
 *   queue          one row per form waiting to upload; its payload and label are
 *                  also sealed (AES-GCM) one by one, as before SQLCipher, and the
 *                  row is deleted as soon as it is sent.
 *   cache          reference lists, survey forms, opened records (offline-cache.ts).
 *   register_rows  one row per participant, enterprise, job or loan of the
 *                  person's own organization, for lists and search with no
 *                  connection (offline-lists.ts).
 *   meta           small markers: when each register was saved, one-time moves.
 *
 * Expo Go has no SQLCipher, so there the file is plain: registers are then kept
 * only in development builds (`keepsRegisters`). The older plain database and
 * anything left in AsyncStorage are moved in once, then removed.
 */

const DB_NAME = "meal-mis-v2.db";
/** The plain database used before SQLCipher (until 2026-10-29). */
const OLD_DB_NAME = "meal-mis.db";
const MOVED_MARK = "moved:meal-mis.db";
const KEY_NAME = "meal-mis.device-key.v1";
const OLD_QUEUE_KEY = "meal-mis.queue.v1";
const OLD_CACHE_PREFIX = "meal-mis.cache.v1:";

let ready: Promise<SQLite.SQLiteDatabase> | null = null;
let encrypted = false;

/** The database, created and filled from the old storage on first use. */
export function db(): Promise<SQLite.SQLiteDatabase> {
  if (!ready) {
    ready = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      // Must come first: SQLCipher reads nothing until it has the key. Plain SQLite ignores it.
      await database.execAsync(`PRAGMA key = "x'${bytesToHex(await deviceKey())}'";`);
      const cipher = await database.getFirstAsync<{ cipher_version?: string }>("PRAGMA cipher_version");
      encrypted = !!cipher?.cipher_version;
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
        CREATE TABLE IF NOT EXISTS register_rows (
          register  TEXT NOT NULL,
          id        TEXT NOT NULL,
          pos       INTEGER NOT NULL,
          search    TEXT NOT NULL,
          data      TEXT NOT NULL,
          gen       TEXT NOT NULL,
          PRIMARY KEY (register, id)
        );
        CREATE INDEX IF NOT EXISTS register_rows_pos ON register_rows (register, pos);
        CREATE TABLE IF NOT EXISTS meta (
          key    TEXT PRIMARY KEY NOT NULL,
          value  TEXT NOT NULL
        );
      `);
      await moveFromOldDatabase(database);
      await moveFromAsyncStorage(database);
      return database;
    })();
    ready.catch(() => {
      ready = null; // try again next time rather than failing for the whole launch
    });
  }
  return ready;
}

/**
 * Whether the registers (names, IDs, phones) may be kept on this phone: only in
 * an encrypted database, or in a development build for testing in Expo Go.
 */
export async function keepsRegisters(): Promise<boolean> {
  await db();
  return encrypted || __DEV__;
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

/* --------------------------- the one-time moves -------------------------- */

/**
 * The waiting forms and saved copies of the plain database used before SQLCipher.
 * The old whole-register copies (`list:*`) are left behind: they download again
 * row by row. The old file is removed only once everything is in.
 */
async function moveFromOldDatabase(database: SQLite.SQLiteDatabase) {
  if (await database.getFirstAsync("SELECT 1 FROM meta WHERE key = ?", [MOVED_MARK])) return;
  const old = await SQLite.openDatabaseAsync(OLD_DB_NAME);
  try {
    const tables = await old.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    const has = (t: string) => tables.some((x) => x.name === t);
    if (has("queue")) {
      for (const q of await old.getAllAsync<QueueRow>("SELECT * FROM queue")) {
        await database.runAsync(
          "INSERT OR IGNORE INTO queue (id, kind, label, payload, created_at, attempts, last_error, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [q.id, q.kind, q.label, q.payload, q.created_at, q.attempts ?? 0, q.last_error ?? null, q.owner ?? null],
        );
      }
    }
    if (has("cache")) {
      for (const c of await old.getAllAsync<{ key: string; value: string; saved_at: string }>(
        "SELECT key, value, saved_at FROM cache WHERE key NOT LIKE 'list:%'",
      )) {
        await database.runAsync("INSERT OR IGNORE INTO cache (key, value, saved_at) VALUES (?, ?, ?)", [
          c.key,
          c.value,
          c.saved_at,
        ]);
      }
    }
  } finally {
    await old.closeAsync();
  }
  await database.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [MOVED_MARK, new Date().toISOString()]);
  await SQLite.deleteDatabaseAsync(OLD_DB_NAME).catch(() => undefined);
}

interface QueueRow {
  id: string;
  kind: string;
  label: string;
  payload: string;
  created_at: string;
  /** Missing in the oldest versions of the table. */
  attempts?: number;
  last_error?: string | null;
  owner?: string | null;
}

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
