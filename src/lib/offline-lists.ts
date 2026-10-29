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
 * it is opened. It is downloaded page by page whenever the phone is online and the
 * copy is missing or older than REFRESH_HOURS, and by "Download for offline".
 */

const PAGE = 500;
/** Offline counts stop here ("1,000+"): counting every match of 100,000 rows is the slow part. */
const TOTAL_CAP = 1000;
const REFRESH_HOURS = 6;

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
  /** Downloads every page again; offline it quietly keeps the old copy. */
  download: () => Promise<void>;
  /** When the copy was last completed, or null when there is none. */
  savedAt: () => Promise<string | null>;
  /** Saved rows, newest first as the server sent them, searched and filtered in SQLite. */
  query: (q: LocalQuery) => Promise<LocalPage<T>>;
}

const FIELD = /^[a-z_][a-z0-9_]*$/;
/** A download per register at a time: a second one would remove the rows the first just wrote. */
const running = new Map<string, Promise<void>>();
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listCopy<T extends { id: string }>(
  name: string,
  fetchPage: (q: { limit: number; offset: number }) => Promise<{ rows: T[]; hasMore: boolean }>,
  slim: (row: T) => T,
  /** The words a search looks in. */
  searchText: (row: T) => string,
): ListCopy<T> {
  const key = `list:${name}`;
  const savedKey = `saved:${name}`;
  async function downloadAll() {
    if (!(await keepsRegisters())) return;
    const database = await db();
    // Rows of this download carry `gen`; what the server no longer sends is removed at the end.
    const gen = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let pos = 0;
    for (let offset = 0; ; offset += PAGE) {
      let page: { rows: T[]; hasMore: boolean };
      try {
        page = await fetchPage({ limit: PAGE, offset });
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError) return; // offline: keep the old copy
        throw error;
      }
      await database.withTransactionAsync(async () => {
        const insert = await database.prepareAsync(
          "INSERT OR REPLACE INTO register_rows (register, id, pos, search, data, gen) VALUES (?, ?, ?, ?, ?, ?)",
        );
        try {
          for (const row of page.rows.map(slim)) {
            await insert.executeAsync([name, row.id, pos++, searchText(row).toLowerCase(), JSON.stringify(row), gen]);
          }
        } finally {
          await insert.finalizeAsync();
        }
      });
      if (!page.hasMore || page.rows.length === 0) break;
    }
    await database.runAsync("DELETE FROM register_rows WHERE register = ? AND gen <> ?", [name, gen]);
    await database.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [savedKey, new Date().toISOString()]);
  }
  return {
    key,
    download: () => {
      const busy = running.get(name);
      if (busy) return busy;
      const job = downloadAll().finally(() => running.delete(name));
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
    if (savedAt && Date.now() - new Date(savedAt).getTime() < REFRESH_HOURS * 3_600_000) return;
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
