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

/**
 * Runs queue changes one after another. Each is a read then a write with an
 * await between, so two at once (a form saved offline while a sync marks an
 * item) would let the later write erase what the earlier one added.
 */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(change: () => Promise<T>): Promise<T> {
  const run = chain.then(change, change);
  chain = run.catch(() => undefined);
  return run;
}

export async function enqueue(item: { kind: QueuedKind; label: string; payload: unknown }): Promise<QueuedItem> {
  const entry: QueuedItem = {
    ...item,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await locked(async () => writeQueue([...(await readQueue()), entry]));
  return entry;
}

export function removeFromQueue(id: string): Promise<void> {
  return locked(async () => writeQueue((await readQueue()).filter((item) => item.id !== id)));
}

export function clearQueue(): Promise<void> {
  return locked(() => writeQueue([]));
}

function markFailed(id: string, message: string): Promise<void> {
  return locked(async () =>
    writeQueue(
      (await readQueue()).map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1, lastError: message } : i)),
    ),
  );
}

/** The sync in progress, so a second tap (or a second screen) joins it instead of sending everything twice. */
let syncing: Promise<{ synced: number; failed: number }> | null = null;

/**
 * Replays every queued item. Network failures leave the item queued; a rejection
 * from the API (validation, duplicate id, permission) is recorded against it so
 * the enumerator can see why it will not go through.
 */
export function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (!syncing) {
    syncing = replay().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

async function replay(): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  for (const item of await readQueue()) {
    try {
      await api.post(ENDPOINTS[item.kind], item.payload);
      await removeFromQueue(item.id);
      synced += 1;
    } catch (error) {
      // Every problem the server listed, so the field officer knows what to
      // correct; a duplicate names the record it matched.
      const message =
        error instanceof ApiError
          ? error.isNetworkError
            ? "Still offline"
            : error.status === 409
              ? `Not uploaded: ${error.message}. Discard this copy if it is the same person.`
              : error.problems.join("; ")
          : "Sync failed";
      await markFailed(item.id, message);
      failed += 1;
    }
  }
  return { synced, failed };
}

/** True when an item failed for a reason other than connectivity: it needs correcting, not retrying. */
export function needsAttention(item: QueuedItem): boolean {
  return !!item.lastError && item.lastError !== "Still offline";
}

/** A submission that failed for connectivity reasons should be queued, not lost. */
export function shouldQueue(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}
