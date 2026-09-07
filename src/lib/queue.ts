import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "./api";

/**
 * Offline-first capture queue for field data collection.
 *
 * Submissions made without connectivity are stored on the device and replayed
 * when the enumerator is back online. Nothing leaves the device until it is
 * synced, and a failed item stays queued with its last error.
 */
const QUEUE_KEY = "meal-mis.queue.v1";

export type QueuedKind = "participant" | "survey_response";

export interface QueuedItem {
  id: string;
  kind: QueuedKind;
  /** Human readable summary shown in the sync screen. */
  label: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const ENDPOINTS: Record<QueuedKind, string> = {
  participant: "/participants",
  survey_response: "/surveys/responses",
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function readQueue(): Promise<QueuedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notify();
}

export async function enqueue(item: { kind: QueuedKind; label: string; payload: unknown }): Promise<QueuedItem> {
  const entry: QueuedItem = {
    ...item,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await writeQueue([...(await readQueue()), entry]);
  return entry;
}

export async function removeFromQueue(id: string): Promise<void> {
  await writeQueue((await readQueue()).filter((item) => item.id !== id));
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
}

/**
 * Replays every queued item. Network failures leave the item queued; a rejection
 * from the API (validation, duplicate id, permission) is recorded against it so
 * the enumerator can see why it will not go through.
 */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  for (const item of await readQueue()) {
    try {
      await api.post(ENDPOINTS[item.kind], item.payload);
      await removeFromQueue(item.id);
      synced += 1;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.isNetworkError
            ? "Still offline"
            : error.message
          : "Sync failed";
      const items = await readQueue();
      await writeQueue(
        items.map((i) => (i.id === item.id ? { ...i, attempts: i.attempts + 1, lastError: message } : i)),
      );
      failed += 1;
    }
  }
  return { synced, failed };
}

/** A submission that failed for connectivity reasons should be queued, not lost. */
export function shouldQueue(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}
