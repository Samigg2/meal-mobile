import { useEffect, useState } from "react";
import { readQueue, subscribe, type QueuedItem } from "./queue";

/** Live view of the pending offline submissions. */
export function useQueue(): QueuedItem[] {
  const [items, setItems] = useState<QueuedItem[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readQueue().then((next) => {
        if (active) setItems(next);
      });
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return items;
}
