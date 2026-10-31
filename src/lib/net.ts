import { useEffect, useState } from "react";
import { queueCounts, readQueue, subscribe, type QueuedItem } from "./queue";

/**
 * A sync changes the queue once per item, and every change used to make each
 * screen decrypt the whole queue again. Changes are now read at most this often.
 */
const SETTLE_MS = 150;

/** Calls `read` now and after queue changes, at most once per SETTLE_MS. */
function useQueueRead<T>(read: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      void read().then((next) => {
        if (active) setValue(next);
      });
    };
    refresh();
    const unsubscribe = subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, SETTLE_MS);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
    // `read` is a module function: fixed for the hook's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/** Live view of the pending offline submissions (opens every item: for the Sync screen). */
export function useQueue(): QueuedItem[] {
  return useQueueRead(readQueue, []);
}

/** How many items wait (and were refused), for badges and banners: nothing is decrypted. */
export function useQueueCounts(): { total: number; failed: number } {
  return useQueueRead(queueCounts, { total: 0, failed: 0 });
}
