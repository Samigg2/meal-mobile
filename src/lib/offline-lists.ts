import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cachedFetch, readCache } from "./offline-cache";

/*
 * The registers a field officer must be able to open with no connection
 * (participants, enterprises, jobs, loans): a complete copy of what the person's
 * own organization holds, kept on the phone encrypted and wiped on sign-out
 * (offline-cache.ts, `secret`). The server already limits every list to the
 * person's organization, so the copy never holds another organization's rows.
 *
 * A copy keeps only the fields the list screens show; the full record loads when
 * it is opened. It is downloaded page by page whenever the phone is online and the
 * copy is missing or older than REFRESH_HOURS, and by "Download for offline".
 */

const PAGE = 500;
const REFRESH_HOURS = 6;

interface Stored<T> {
  rows: T[];
}

export interface ListCopy<T> {
  /** Where the copy is kept. */
  key: string;
  /** Downloads every page again; offline it quietly keeps the old copy. */
  download: () => Promise<Stored<T>>;
  read: () => Promise<{ savedAt: string; data: Stored<T> } | null>;
}

export function listCopy<T>(
  name: string,
  fetchPage: (q: { limit: number; offset: number }) => Promise<{ rows: T[]; hasMore: boolean }>,
  slim: (row: T) => T,
): ListCopy<T> {
  const key = `list:${name}`;
  return {
    key,
    download: () =>
      cachedFetch<Stored<T>>(
        key,
        async () => {
          const rows: T[] = [];
          for (let offset = 0; ; offset += PAGE) {
            const page = await fetchPage({ limit: PAGE, offset });
            rows.push(...page.rows.map(slim));
            if (!page.hasMore || page.rows.length === 0) break;
          }
          return { rows };
        },
        { secret: true },
      ),
    read: () => readCache<Stored<T>>(key),
  };
}

/**
 * The saved copy of a register, and the refresh of it while the live list works
 * (`online`). `rows` is undefined until a copy exists.
 */
export function useListCopy<T>(copy: ListCopy<T>, online: boolean) {
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["list-copy", copy.key], queryFn: copy.read, staleTime: Infinity });
  const busy = useRef(false);
  const savedAt = saved.data?.savedAt;
  useEffect(() => {
    if (!online || saved.isLoading || busy.current) return;
    if (savedAt && Date.now() - new Date(savedAt).getTime() < REFRESH_HOURS * 3_600_000) return;
    busy.current = true;
    void copy
      .download()
      .then(() => queryClient.invalidateQueries({ queryKey: ["list-copy", copy.key] }))
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [online, saved.isLoading, savedAt, copy, queryClient]);
  return { rows: saved.data?.data.rows, savedAt };
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
