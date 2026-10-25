import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { isSyncing, queueSize, subscribe, syncQueue } from "./queue";

/** While the app is open and something waits, try again this often. */
const EVERY_MS = 2 * 60 * 1000;
/** A save that just went to the queue: try shortly after, not in the same breath. */
const AFTER_SAVE_MS = 5 * 1000;

/**
 * Sends the offline queue without the officer having to remember the Sync
 * screen: shortly after something is queued, whenever the app comes back to the
 * front, and every two minutes while it is open with items waiting. With no
 * connection an attempt changes nothing (items stay "Still offline"), and only
 * one sync runs at a time (syncQueue). Nothing runs while the app is closed.
 */
export function useAutoSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let soon: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const attempt = async () => {
      if (stopped || AppState.currentState !== "active") return;
      if ((await queueSize()) === 0) return;
      const { synced } = await syncQueue();
      if (synced > 0) void queryClient.invalidateQueries();
    };
    const attemptSoon = () => {
      if (soon) clearTimeout(soon);
      soon = setTimeout(() => void attempt(), AFTER_SAVE_MS);
    };

    void attempt();
    const timer = setInterval(() => void attempt(), EVERY_MS);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void attempt();
    });
    // Every queue change calls this. A sync's own changes (marking an item
    // "Still offline") must not start another one, or an offline phone would
    // retry every few seconds; a new save does.
    const unsubscribe = subscribe(() => {
      if (!isSyncing()) attemptSoon();
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      if (soon) clearTimeout(soon);
      appState.remove();
      unsubscribe();
    };
  }, [user, queryClient]);
}
