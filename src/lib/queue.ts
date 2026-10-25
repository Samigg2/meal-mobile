import { api, ApiError, getSessionUser } from "./api";
import { db, open, seal } from "./device-store";

/**
 * Offline-first capture queue for field data collection.
 *
 * Submissions made without connectivity are stored on the device (encrypted,
 * in SQLite: device-store.ts) and replayed when the enumerator is back online,
 * by hand from the Sync screen or on their own (auto-sync.ts). Nothing leaves
 * the device until it is synced, a sent item is deleted at once, and a failed
 * item stays queued with its last error.
 */

export type QueuedKind =
  | "participant"
  | "participant_edit"
  | "survey_response"
  | "survey_edit"
  | "training_attendance"
  | "safeguarding"
  | "feedback"
  | "enterprise"
  | "enterprise_performance"
  | "loan"
  | "loan_repayment"
  | "placement"
  | "follow_up"
  | "activity_progress";

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

/**
 * A queued payload is the request body. A change to a record that already
 * exists, or a record added under another one (a visit under its enterprise),
 * also carries that record's id as `_target`. Keys starting with "_" are not
 * sent.
 */
export type Targeted<T> = T & { _target: string };

interface Route {
  method: "post" | "patch";
  path: (target: string) => string;
  /** What it is, for the Sync screen. */
  what: string;
  /** The form that opens it again to correct it (it reads `?queued=<id>`). */
  form: string;
}

const ROUTES: Record<QueuedKind, Route> = {
  participant: { method: "post", path: () => "/participants", what: "Participant registration", form: "/participants/new" },
  participant_edit: { method: "patch", path: (id) => `/participants/${id}`, what: "Participant change", form: "/participants/edit/[id]" },
  survey_response: { method: "post", path: () => "/surveys/responses", what: "Survey response", form: "/surveys/[id]" },
  survey_edit: { method: "patch", path: (id) => `/surveys/responses/${id}`, what: "Survey response change", form: "/surveys/[id]" },
  training_attendance: { method: "post", path: () => "/training/attendance", what: "Training attendance", form: "/training/[id]" },
  safeguarding: { method: "post", path: () => "/safeguarding", what: "Safeguarding concern", form: "/safeguarding/new" },
  feedback: { method: "post", path: () => "/feedback", what: "Feedback", form: "/feedback/new" },
  enterprise: { method: "post", path: () => "/enterprises", what: "New enterprise", form: "/enterprises/new" },
  enterprise_performance: {
    method: "post",
    path: (id) => `/enterprises/${id}/performance`,
    what: "Enterprise visit",
    form: "/enterprises/performance",
  },
  loan: { method: "post", path: () => "/finance/loans", what: "Loan", form: "/finance/loan" },
  loan_repayment: { method: "post", path: () => "/finance/loans/repayments", what: "Loan repayment", form: "/finance/repayment" },
  placement: { method: "post", path: () => "/employment/placements", what: "Job", form: "/employment/new" },
  follow_up: {
    method: "post",
    path: (id) => `/employment/placements/${id}/follow-ups`,
    what: "Job follow-up",
    form: "/employment/follow-up",
  },
  activity_progress: {
    method: "patch",
    path: (id) => `/monitoring/activities/${id}/progress`,
    what: "Activity progress",
    form: "/activities/[id]",
  },
};

export const kindLabel = (kind: QueuedKind) => ROUTES[kind].what;

/** The form that opens a queued item again, filled in, to correct it. */
export function formFor(item: QueuedItem): { pathname: string; params: Record<string, string> } {
  const route = ROUTES[item.kind];
  const payload = item.payload as { _target?: string; template_id?: string; training_event_id?: string };
  const id = item.kind === "survey_response" || item.kind === "survey_edit"
    ? payload.template_id
    : item.kind === "training_attendance"
      ? payload.training_event_id
      : payload._target;
  return { pathname: route.form, params: { queued: item.id, ...(id ? { id } : {}) } };
}

/** What a refused upload means, per kind (a 409 is a different thing for each). */
const CONFLICT: Partial<Record<QueuedKind, (message: string) => string>> = {
  participant: (m) => `Not uploaded: ${m}. Discard this copy if it is the same person.`,
  survey_response: (m) => `Not uploaded: ${m}. Discard this copy if this person already answered.`,
};
const conflict = (kind: QueuedKind, message: string) => CONFLICT[kind]?.(message) ?? `Not uploaded: ${message}`;

export const STILL_OFFLINE = "Still offline";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface Row {
  id: string;
  kind: QueuedKind;
  label: string;
  payload: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

/**
 * The signed-in officer's items only. Rows saved under another account (a
 * shared phone, a session that expired before sign-out) are neither shown nor
 * uploaded as this person's; rows from before owners were recorded count as
 * everyone's.
 */
const MINE = "(owner IS NULL OR owner = ?)";
const me = () => getSessionUser()?.id ?? "";

export async function readQueue(): Promise<QueuedItem[]> {
  try {
    const rows = await (await db()).getAllAsync<Row>(`SELECT * FROM queue WHERE ${MINE} ORDER BY created_at`, [me()]);
    const items: QueuedItem[] = [];
    for (const r of rows) {
      items.push({
        id: r.id,
        kind: r.kind,
        label: await open(r.label),
        payload: JSON.parse(await open(r.payload)),
        createdAt: r.created_at,
        attempts: r.attempts,
        lastError: r.last_error ?? undefined,
      });
    }
    return items;
  } catch {
    return [];
  }
}

/** How many items wait, without opening them. */
export async function queueSize(): Promise<number> {
  try {
    const row = await (await db()).getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM queue WHERE ${MINE}`, [me()]);
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function enqueue(item: { kind: QueuedKind; label: string; payload: unknown }): Promise<QueuedItem> {
  const entry: QueuedItem = {
    ...item,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await (await db()).runAsync(
    "INSERT INTO queue (id, kind, label, payload, created_at, attempts, owner) VALUES (?, ?, ?, ?, ?, 0, ?)",
    [
      entry.id,
      entry.kind,
      await seal(entry.label),
      await seal(JSON.stringify(entry.payload)),
      entry.createdAt,
      getSessionUser()?.id ?? null,
    ],
  );
  notify();
  return entry;
}

/** One waiting item, to open it again in its form. */
export async function getQueued(id: string): Promise<QueuedItem | null> {
  return (await readQueue()).find((item) => item.id === id) ?? null;
}

/** A corrected item replaces the waiting one (same id, same client_ref): it is tried afresh. */
export async function updateQueued(id: string, label: string, payload: unknown): Promise<void> {
  await (await db()).runAsync(
    "UPDATE queue SET label = ?, payload = ?, attempts = 0, last_error = NULL WHERE id = ?",
    [await seal(label), await seal(JSON.stringify(payload)), id],
  );
  notify();
}

/** Sends one queued body where its kind goes. */
export function sendQueued(kind: QueuedKind, payload: unknown): Promise<unknown> {
  const route = ROUTES[kind];
  const { _target, ...rest } = payload as { _target?: string } & Record<string, unknown>;
  // Keys starting with "_" stay on the phone (what the form needs to reopen it).
  const body = Object.fromEntries(Object.entries(rest).filter(([key]) => !key.startsWith("_")));
  const path = route.path(_target ?? "");
  return route.method === "patch" ? api.patch(path, body) : api.post(path, body);
}

export async function removeFromQueue(id: string): Promise<void> {
  await (await db()).runAsync("DELETE FROM queue WHERE id = ?", [id]);
  notify();
}

export async function clearQueue(): Promise<void> {
  await (await db()).runAsync("DELETE FROM queue");
  notify();
}

/** A lost connection is not a failed attempt: only a refusal counts. */
async function markFailed(id: string, message: string): Promise<void> {
  await (await db()).runAsync(
    "UPDATE queue SET attempts = attempts + ?, last_error = ? WHERE id = ?",
    [message === STILL_OFFLINE ? 0 : 1, message, id],
  );
  notify();
}

/** The sync in progress, so a second tap (or auto-sync) joins it instead of sending everything twice. */
let syncing: Promise<{ synced: number; failed: number }> | null = null;

export const isSyncing = () => syncing !== null;

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
      await sendQueued(item.kind, item.payload);
      await removeFromQueue(item.id);
      synced += 1;
    } catch (error) {
      // Every problem the server listed, so the field officer knows what to
      // correct; a duplicate says what it matched.
      const message =
        error instanceof ApiError
          ? error.isNetworkError
            ? STILL_OFFLINE
            : error.status === 409
              ? conflict(item.kind, error.message)
              : error.problems.join("; ")
          : "Sync failed";
      await markFailed(item.id, message);
      failed += 1;
      // No connection: the rest would fail the same way, so stop here.
      if (message === STILL_OFFLINE) break;
    }
  }
  return { synced, failed };
}

/** True when an item failed for a reason other than connectivity: it needs correcting, not retrying. */
export function needsAttention(item: QueuedItem): boolean {
  return !!item.lastError && item.lastError !== STILL_OFFLINE;
}

/** A submission that failed for connectivity reasons should be queued, not lost. */
export function shouldQueue(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}
