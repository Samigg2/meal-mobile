import Constants from "expo-constants";
import { api } from "./api";

/**
 * Sends an app crash to the API's log (POST /client-errors, deep review
 * 2026-10-31), so it is seen by whoever runs the server. Once per message per
 * launch, a few at most, never anything typed into a form. Offline, it is
 * simply lost: a crash report is not field data.
 */
const MAX_REPORTS = 10;
const sent = new Set<string>();

export function reportError(error: unknown, where: string, screen?: string): void {
  if (sent.size >= MAX_REPORTS) return;
  const message = error instanceof Error ? error.message : String(error);
  const key = `${where}|${message}`;
  if (sent.has(key)) return;
  sent.add(key);
  void api.anon
    .post("/client-errors", {
      source: "mobile",
      where,
      message: message.slice(0, 1000),
      stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
      page: screen?.slice(0, 300),
      release: Constants.expoConfig?.version ?? undefined,
    })
    .catch(() => undefined);
}
