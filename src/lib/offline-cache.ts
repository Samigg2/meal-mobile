import { ApiError } from "./api";
import { db, open, seal } from "./device-store";

/**
 * Network-first read cache for what a field officer needs offline: reference
 * lists (regions, zones, woredas, categories) and survey forms. A fresh answer
 * is stored on every successful fetch; when the device is offline the last
 * stored copy is returned instead of an error.
 *
 * Survey responses are not kept on the device beyond the upload queue (Proclamation
 * 1321/2024, TOR Annex 6). Kept in the SQLite cache table (device-store.ts).
 * What the work cannot do without is kept `secret` (encrypted like the queue) and
 * wiped on sign-out (clearSecretCache): a training's roster of names, a participant
 * the officer opened, and (decided 2026-10-21) a complete copy of the person's own
 * organization's participant, enterprise, job and loan lists, so the lists, search
 * and records open with no connection (lib/offline-lists.ts).
 */

/** Marks a value stored encrypted. */
const SEALED = "s1:";
interface Entry<T> {
  savedAt: string;
  data: T;
}

export async function readCache<T>(key: string): Promise<Entry<T> | null> {
  try {
    const row = await (await db()).getFirstAsync<{ value: string; saved_at: string }>(
      "SELECT value, saved_at FROM cache WHERE key = ?",
      [key],
    );
    if (!row) return null;
    const text = row.value.startsWith(SEALED) ? await open(row.value.slice(SEALED.length)) : row.value;
    return { savedAt: row.saved_at, data: JSON.parse(text) as T };
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T, secret: boolean): Promise<void> {
  try {
    const text = JSON.stringify(data);
    await (await db()).runAsync("INSERT OR REPLACE INTO cache (key, value, saved_at) VALUES (?, ?, ?)", [
      key,
      secret ? SEALED + (await seal(text)) : text,
      new Date().toISOString(),
    ]);
  } catch {
    /* storage full or unavailable: the app still works online */
  }
}

/**
 * Fetch `load()`; store the result under `key`. If the request fails because
 * the device is offline, return the stored copy (or rethrow when there is none).
 */
export async function cachedFetch<T>(key: string, load: () => Promise<T>, opts: { secret?: boolean } = {}): Promise<T> {
  return (await cachedFetchStamped(key, load, opts)).data;
}

/** Like cachedFetch, and says when the copy was saved (`savedAt`) when it answered instead of the server. */
export async function cachedFetchStamped<T>(
  key: string,
  load: () => Promise<T>,
  opts: { secret?: boolean } = {},
): Promise<{ data: T; savedAt: string | null }> {
  try {
    const data = await load();
    await writeCache(key, data, !!opts.secret);
    return { data, savedAt: null };
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) {
      const cached = await readCache<T>(key);
      if (cached) return { data: cached.data, savedAt: cached.savedAt };
      throw new ApiError(
        0,
        "You are offline and this has not been downloaded yet. Connect once and open it, or use Download for offline on the Sync screen.",
      );
    }
    throw error;
  }
}

/** When the cached copy of `key` was last refreshed, for the "offline data" status. */
export async function cachedAt(key: string): Promise<string | null> {
  return (await readCache(key))?.savedAt ?? null;
}

/** Removes the encrypted copies (rosters and the like) when someone signs out of this phone. */
export async function clearSecretCache(): Promise<void> {
  try {
    await (await db()).runAsync("DELETE FROM cache WHERE value LIKE ?", [`${SEALED}%`]);
  } catch {
    /* nothing stored */
  }
}
