import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "./api";

/**
 * Network-first read cache for what a field officer needs offline: reference
 * lists (regions, zones, woredas, categories) and survey forms. A fresh answer
 * is stored on every successful fetch; when the device is offline the last
 * stored copy is returned instead of an error.
 *
 * Deliberately NOT used for participant lists or survey responses: personal
 * data is not kept on the device beyond the upload queue (Proclamation
 * 1321/2024, TOR Annex 6).
 */
const PREFIX = "meal-mis.cache.v1:";

interface Entry<T> {
  savedAt: string;
  data: T;
}

export async function readCache<T>(key: string): Promise<Entry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {
    /* storage full or unavailable: the app still works online */
  }
}

/**
 * Fetch `load()`; store the result under `key`. If the request fails because
 * the device is offline, return the stored copy (or rethrow when there is none).
 */
export async function cachedFetch<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const data = await load();
    await writeCache(key, data);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) {
      const cached = await readCache<T>(key);
      if (cached) return cached.data;
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
