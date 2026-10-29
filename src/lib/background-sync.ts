import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { getSessionUser, loadSession } from "./api";
import { queueSize, syncQueue } from "./queue";

/**
 * Sends the offline queue while the app is closed or in a pocket (2026-10-29),
 * so an officer back on Wi-Fi at the office does not have to open the app.
 * The phone decides when: Android runs it about every 15 minutes at the
 * soonest, often later to save battery; iPhones far less often (overnight).
 * It is a backstop for auto-sync.ts, which still sends as soon as the app is
 * open. Only one sync runs at a time (syncQueue), and a replay is recognised
 * by its client_ref, so a task that overlaps a sync from the screen sends
 * nothing twice.
 *
 * Defined when this file is first imported (app/_layout.tsx), as the task
 * manager requires; registered while someone is signed in (useAutoSync).
 */

const TASK = "meal-mis.send-queue";
const EVERY_MINUTES = 15;

TaskManager.defineTask(TASK, async () => {
  try {
    // A closed app starts with no session in memory: the kept one ("Keep me
    // signed in") is read back. Without one, nothing is sent as anybody.
    if (!getSessionUser()) await loadSession();
    if (!getSessionUser()) return BackgroundTask.BackgroundTaskResult.Success;
    if ((await queueSize()) > 0) await syncQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Asks the phone to run the task; quietly does nothing where it cannot (Expo Go, web). */
export async function startBackgroundSync(): Promise<void> {
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: EVERY_MINUTES });
  } catch {
    /* not available here: auto-sync while the app is open still works */
  }
}

/** Stops the task once nobody is signed in on this phone. */
export async function stopBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {
    /* never registered */
  }
}
