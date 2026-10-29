import { api, ApiError, getSessionUser } from "./api";
import { db, open, seal } from "./device-store";
import { dropUnusedPhotos, uploadPhoto, type WaitingPhoto } from "./photos";

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
  | "activity_progress"
  | "enterprise_edit"
  | "placement_edit"
  | "loan_edit"
  | "training_event_edit"
  | "performance_edit"
  | "follow_up_edit"
  | "feedback_edit"
  | "safeguarding_edit"
  | "document_photo";

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
  enterprise_edit: { method: "patch", path: (id) => `/records/enterprises/${id}`, what: "Enterprise change", form: "/enterprises/new" },
  placement_edit: { method: "patch", path: (id) => `/records/employment/${id}`, what: "Job change", form: "/employment/new" },
  loan_edit: { method: "patch", path: (id) => `/finance/loans/${id}`, what: "Loan change", form: "/finance/loan" },
  training_event_edit: { method: "patch", path: (id) => `/training/events/${id}`, what: "Training event change", form: "/training/event" },
  performance_edit: { method: "patch", path: (id) => `/enterprises/performance/${id}`, what: "Enterprise visit change", form: "/enterprises/performance" },
  follow_up_edit: { method: "patch", path: (id) => `/employment/follow-ups/${id}`, what: "Job follow-up change", form: "/employment/follow-up" },
  feedback_edit: { method: "patch", path: (id) => `/records/feedback/${id}`, what: "Feedback change", form: "/feedback/new" },
  safeguarding_edit: { method: "patch", path: (id) => `/records/safeguarding/${id}`, what: "Safeguarding change", form: "/safeguarding/new" },
  // A document photo taken offline, sent by uploadPhoto (sendQueued) rather than as JSON.
  document_photo: { method: "post", path: () => "/attachments/upload", what: "Document photo", form: "/documents" },
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
  if (item.kind === "document_photo") {
    const photo = item.payload as WaitingPhoto;
    return {
      pathname: route.form,
      params: { module: photo.module, id: photo.recordId, types: photo.document_type, title: "Documents" },
    };
  }
  const payload = item.payload as { _target?: string; template_id?: string; training_event_id?: string };
  const id = item.kind === "survey_response" || item.kind === "survey_edit"
    ? payload.template_id
    : item.kind === "training_attendance"
      ? payload.training_event_id
      : payload._target;
  // A change to a record opens the add form with `edit` (the record's id), filled in.
  if (item.kind.endsWith("_edit") && item.kind !== "participant_edit" && item.kind !== "survey_edit") {
    return { pathname: route.form, params: { queued: item.id, ...(id ? { edit: id } : {}) } };
  }
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

/**
 * Sends one queued body where its kind goes. Photos taken with a form that was
 * itself waiting (`_photos`) follow it, now that the record has an id.
 */
export async function sendQueued(kind: QueuedKind, payload: unknown): Promise<unknown> {
  if (kind === "document_photo") return uploadPhoto(payload as WaitingPhoto);
  const route = ROUTES[kind];
  const { _target, _photos, ...rest } = payload as {
    _target?: string;
    _photos?: Omit<WaitingPhoto, "recordId">[];
  } & Record<string, unknown>;
  // Keys starting with "_" stay on the phone (what the form needs to reopen it).
  const body = Object.fromEntries(Object.entries(rest).filter(([key]) => !key.startsWith("_")));
  const path = route.path(_target ?? "");
  const result = await (route.method === "patch" ? api.patch(path, body) : api.post(path, body));
  const recordId = (result as { id?: string } | undefined)?.id ?? _target ?? "";
  for (const photo of _photos ?? []) {
    await sendOrQueuePhoto({ ...photo, recordId }, `${route.what} — ${photo.document_type.replace(/_/g, " ")}`, true);
  }
  return result;
}

/**
 * Uploads a document photo now, or, with no connection, keeps it (encrypted)
 * to be sent on its own. `always`: the record is already saved, so a photo the
 * server refuses waits in Sync with its reason instead of failing the record.
 */
export async function sendOrQueuePhoto(photo: WaitingPhoto, label: string, always = false): Promise<"sent" | "queued"> {
  try {
    await uploadPhoto(photo);
    return "sent";
  } catch (error) {
    if (!always && !shouldQueue(error)) throw error;
    await enqueue({ kind: "document_photo", label, payload: photo });
    return "queued";
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  await (await db()).runAsync("DELETE FROM queue WHERE id = ?", [id]);
  notify();
}

export async function clearQueue(): Promise<void> {
  await (await db()).runAsync("DELETE FROM queue");
  await dropUnusedPhotos(new Set(), true);
  notify();
}

/** The kept photos the waiting items still need: a photo's own id, or a form's `_photos`. */
function photosInUse(items: QueuedItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const p = item.payload as { photoId?: string; _photos?: { photoId?: string }[] } | null;
    if (p?.photoId) ids.add(p.photoId);
    for (const photo of p?._photos ?? []) if (photo.photoId) ids.add(photo.photoId);
  }
  return ids;
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
  // Photos left by a discarded item or a form closed without saving.
  await dropUnusedPhotos(photosInUse(await readQueue()));
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
