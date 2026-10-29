import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { db, keepsRegisters } from "./device-store";

/*
 * The registers a field officer must be able to open with no connection
 * (participants, enterprises, jobs, loans): a complete copy of what the person's
 * own organization holds, wiped on sign-out (offline-cache.ts, clearSecretCache).
 * The server already limits every list to the person's organization, so the copy
 * never holds another organization's rows.
 *
 * Since 2026-10-29 each record is its own row in `register_rows` (device-store.ts,
 * a SQLCipher-encrypted database), so a search or a page reads only what it shows
 * instead of the whole register: with 100,000 people a search is one SQLite query.
 *
 * A copy keeps only the fields the list screens show; the full record loads when
 * it is opened. Once there is a copy, a refresh asks only for what changed
 * (2026-10-29): rows whose updated_at is at or after the newest one kept
 * (`updated_since`), and the ids deleted since (`/…/deleted`, from the audit
 * trail), so a phone holding 100,000 people downloads a few rows, not all of
 * them. Once a day (FULL_HOURS) it downloads everything again, which also drops
 * rows that left the person's organization and refreshes joined names (a
 * borrower renamed on their participant record). It runs whenever the phone is
 * online and the copy is older than REFRESH_MINUTES, and by "Download for offline".
 */

const PAGE = 500;
/** Offline counts stop here ("1,000+"): counting every match of 100,000 rows is the slow part. */
const TOTAL_CAP = 1000;
const REFRESH_MINUTES = 30;
const FULL_HOURS = 24;

/**
 * A filter on the saved rows, the offline twin of a chip's server query:
 * a string must equal the field, true wants it set (true, non-empty), false wants it unset.
 * `false` as a whole means the filter cannot be answered offline (no rows).
 */
export type Where = Record<string, string | boolean>;

export interface LocalQuery {
  term?: string;
  where?: Where | false;
  limit: number;
  offset?: number;
  withTotal?: boolean;
}

export interface LocalPage<T> {
  rows: T[];
  /** Only when asked for (`withTotal`); at most TOTAL_CAP. */
  total: number | null;
  /** There are more matches than `total` says. */
  capped?: boolean;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface ListCopy<T> {
  /** Where the copy is kept. */
  key: string;
  /** Brings the copy up to date (what changed, or everything once a day); offline it quietly keeps the old copy. */
  download: (opts?: { full?: boolean }) => Promise<void>;
  /** When the copy was last completed, or null when there is none. */
  savedAt: () => Promise<string | null>;
  /** Saved rows, newest first as the server sent them, searched and filtered in SQLite. */
  query: (q: LocalQuery) => Promise<LocalPage<T>>;
}

const FIELD = /^[a-z_][a-z0-9_]*$/;
/** A download per register at a time: a second one would remove the rows the first just wrote. */
const running = new Map<string, Promise<void>>();
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The server's deleted ids since a moment (`/…/deleted`); `complete` false: ask again from `until`. */
export type DeletedSince = { ids: string[]; until: string | null; complete: boolean };

/** No connection: the download stops and the copy stays as it was. */
class Offline extends Error {}

async function online<R>(load: () => Promise<R>): Promise<R> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) throw new Offline();
    throw error;
  }
}

/** The later of two ISO times (the server's, so the phone's clock does not matter). */
const later = (a: string | null, b?: string | null) => (b && (!a || b > a) ? b : a);

export function listCopy<T extends { id: string; updated_at?: string | null }>(
  name: string,
  fetchPage: (q: { limit: number; offset: number; updated_since?: string }) => Promise<{ rows: T[]; hasMore: boolean }>,
  slim: (row: T) => T,
  /** The words a search looks in. */
  searchText: (row: T) => string,
  deletedSince: (since: string) => Promise<DeletedSince>,
): ListCopy<T> {
  const key = `list:${name}`;
  const savedKey = `saved:${name}`;
  /** The newest updated_at kept: the next refresh asks from here. */
  const changedKey = `changed:${name}`;
  const fullKey = `full:${name}`;

  const getMeta = async (k: string) =>
    (await (await db()).getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", [k]))?.value ?? null;
  const setMeta = async (k: string, v: string) =>
    (await db()).runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [k, v]);

  /** Everything again; rows of this download carry `gen`, what the server no longer sends is removed at the end. */
  async function downloadAll() {
    const database = await db();
    const gen = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let pos = 0;
    let changed: string | null = null;
    for (let offset = 0; ; offset += PAGE) {
      const page = await online(() => fetchPage({ limit: PAGE, offset }));
      await database.withTransactionAsync(async () => {
        const insert = await database.prepareAsync(
          "INSERT OR REPLACE INTO register_rows (register, id, pos, search, data, gen) VALUES (?, ?, ?, ?, ?, ?)",
        );
        try {
          for (const row of page.rows.map(slim)) {
            changed = later(changed, row.updated_at);
            await insert.executeAsync([name, row.id, pos++, searchText(row).toLowerCase(), JSON.stringify(row), gen]);
          }
        } finally {
          await insert.finalizeAsync();
        }
      });
      if (!page.hasMore || page.rows.length === 0) break;
    }
    await database.runAsync("DELETE FROM register_rows WHERE register = ? AND gen <> ?", [name, gen]);
    if (changed) await setMeta(changedKey, changed);
    else await database.runAsync("DELETE FROM meta WHERE key = ?", [changedKey]);
    await setMeta(fullKey, new Date().toISOString());
  }

  /** Only what changed since `since`: changed rows updated in place, new ones on top, deleted ones removed. */
  async function downloadChanges(since: string) {
    const fresh: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await online(() => fetchPage({ limit: PAGE, offset, updated_since: since }));
      fresh.push(...page.rows.map(slim));
      if (!page.hasMore || page.rows.length === 0) break;
    }
    const gone: string[] = [];
    for (let from: string | null = since; from !== null; ) {
      const asked: string = from;
      const answer = await online(() => deletedSince(asked));
      gone.push(...answer.ids);
      from = answer.complete ? null : answer.until;
    }
    const database = await db();
    let changed: string | null = since;
    await database.withTransactionAsync(async () => {
      const top = await database.getFirstAsync<{ p: number | null }>(
        "SELECT min(pos) AS p FROM register_rows WHERE register = ?",
        [name],
      );
      let pos = top?.p ?? 0;
      const update = await database.prepareAsync("UPDATE register_rows SET search = ?, data = ? WHERE register = ? AND id = ?");
      const insert = await database.prepareAsync(
        "INSERT INTO register_rows (register, id, pos, search, data, gen) VALUES (?, ?, ?, ?, ?, 'change')",
      );
      try {
        // The server sends newest first: the oldest new row goes on top first, so the newest ends up first.
        for (const row of [...fresh].reverse()) {
          changed = later(changed, row.updated_at);
          const words = searchText(row).toLowerCase();
          const data = JSON.stringify(row);
          const done = await update.executeAsync([words, data, name, row.id]);
          if (done.changes === 0) await insert.executeAsync([name, row.id, --pos, words, data]);
        }
      } finally {
        await update.finalizeAsync();
        await insert.finalizeAsync();
      }
      for (const id of gone) await database.runAsync("DELETE FROM register_rows WHERE register = ? AND id = ?", [name, id]);
    });
    if (changed) await setMeta(changedKey, changed);
  }

  async function bringUpToDate(full: boolean) {
    if (!(await keepsRegisters())) return;
    const [since, lastFull] = await Promise.all([getMeta(changedKey), getMeta(fullKey)]);
    const fullDue = !since || !lastFull || Date.now() - new Date(lastFull).getTime() > FULL_HOURS * 3_600_000;
    try {
      if (full || fullDue || !since) await downloadAll();
      else await downloadChanges(since);
    } catch (error) {
      if (error instanceof Offline) return; // keep the old copy
      throw error;
    }
    await setMeta(savedKey, new Date().toISOString());
  }

  return {
    key,
    download: (opts) => {
      const busy = running.get(name);
      if (busy) return busy;
      const job = bringUpToDate(!!opts?.full).finally(() => running.delete(name));
      running.set(name, job);
      return job;
    },
    savedAt: async () => {
      try {
        const row = await (await db()).getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", [savedKey]);
        return row?.value ?? null;
      } catch {
        return null;
      }
    },
    query: async ({ term, where, limit, offset = 0, withTotal }) => {
      if (where === false) return { rows: [], total: withTotal ? 0 : null, hasMore: false, offset, limit };
      const parts = ["register = ?"];
      const params: (string | number)[] = [name];
      const words = term?.trim().toLowerCase();
      if (words) {
        parts.push("search LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(words)}%`);
      }
      for (const [field, want] of Object.entries(where ?? {})) {
        if (!FIELD.test(field)) throw new Error(`Not a field: ${field}`);
        // The record's id is its own column (the key), so that lookup needs no JSON.
        const value = field === "id" ? "id" : `json_extract(data, '$.${field}')`;
        if (want === true) parts.push(`COALESCE(${value}, 0) NOT IN (0, '')`);
        else if (want === false) parts.push(`COALESCE(${value}, 0) IN (0, '')`);
        else {
          parts.push(`${value} = ?`);
          params.push(want);
        }
      }
      const filter = parts.join(" AND ");
      const database = await db();
      // One extra row says whether there is a next page.
      const found = await database.getAllAsync<{ data: string }>(
        `SELECT data FROM register_rows WHERE ${filter} ORDER BY pos LIMIT ? OFFSET ?`,
        [...params, limit + 1, offset],
      );
      const counted = withTotal
        ? ((
            await database.getFirstAsync<{ n: number }>(
              `SELECT count(*) AS n FROM (SELECT 1 FROM register_rows WHERE ${filter} LIMIT ${TOTAL_CAP + 1})`,
              params,
            )
          )?.n ?? 0)
        : null;
      return {
        rows: found.slice(0, limit).map((r) => JSON.parse(r.data) as T),
        total: counted === null ? null : Math.min(counted, TOTAL_CAP),
        capped: counted !== null && counted > TOTAL_CAP,
        hasMore: found.length > limit,
        offset,
        limit,
      };
    },
  };
}

/**
 * When the saved copy of a register was completed, and its refresh while the
 * live list works (`online`). `savedAt` is undefined until a copy exists.
 */
export function useListCopy<T>(copy: ListCopy<T>, online: boolean) {
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["list-copy", copy.key], queryFn: copy.savedAt, staleTime: Infinity });
  const busy = useRef(false);
  const savedAt = saved.data ?? undefined;
  useEffect(() => {
    if (!online || saved.isLoading || busy.current) return;
    if (savedAt && Date.now() - new Date(savedAt).getTime() < REFRESH_MINUTES * 60_000) return;
    busy.current = true;
    void copy
      .download()
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["list-copy", copy.key] }),
          queryClient.invalidateQueries({ queryKey: ["local", copy.key] }),
        ]),
      )
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [online, saved.isLoading, savedAt, copy, queryClient]);
  return { savedAt, hasCopy: !!savedAt };
}

/** Pages of the saved copy for a list screen with no connection: what it searches and filters, `size` at a time. */
export function useLocalPages<T>(
  copy: ListCopy<T>,
  q: { term?: string; where?: Where | false },
  size: number,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ["local", copy.key, q.term ?? "", q.where ?? null],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => copy.query({ ...q, limit: size, offset: pageParam, withTotal: pageParam === 0 }),
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
  });
}

/** "10:42" for today, otherwise the date: for the "Offline — updated …" line. */
export function updatedLabel(savedAt: string | undefined): string {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en", { day: "numeric", month: "short" });
}
