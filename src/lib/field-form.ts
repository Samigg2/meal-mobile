import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ApiError } from "./api";
import { newRef } from "./participant-form";
import { enqueue, getQueued, removeFromQueue, sendQueued, shouldQueue, updateQueued, type QueuedKind } from "./queue";

/*
 * What every field form shares: a device-made reference so a form sent twice
 * is saved once, "send now, or keep it on the phone when offline", opening a
 * waiting item again to correct it, and the server's checks shown under the
 * fields they are about.
 */

/** A device-made id, so the server recognises a replayed offline submission. */
export const makeRef = newRef;

/**
 * The waiting item a form was opened with from the Sync screen (`?queued=<id>`),
 * or none for a new form. `ready` is false only while it is being read.
 */
export function useQueuedPayload<T>(): { queuedId: string | undefined; payload: T | null; ready: boolean } {
  const { queued } = useLocalSearchParams<{ queued?: string }>();
  const [state, setState] = useState<{ payload: T | null; ready: boolean }>({ payload: null, ready: !queued });
  useEffect(() => {
    if (!queued) return;
    let active = true;
    void getQueued(queued).then((item) => {
      if (active) setState({ payload: (item?.payload as T) ?? null, ready: true });
    });
    return () => {
      active = false;
    };
  }, [queued]);
  return { queuedId: queued, ...state };
}

/**
 * Sends the form now; with no connection it waits on the phone instead (a
 * corrected waiting item replaces itself). A refusal from the server is thrown
 * for the form to show, and a waiting item that is refused stays waiting.
 */
export async function saveOrQueue(opts: {
  kind: QueuedKind;
  label: string;
  payload: unknown;
  queuedId?: string;
}): Promise<"sent" | "queued"> {
  try {
    await sendQueued(opts.kind, opts.payload);
    if (opts.queuedId) await removeFromQueue(opts.queuedId);
    return "sent";
  } catch (error) {
    if (!shouldQueue(error)) throw error;
    if (opts.queuedId) await updateQueued(opts.queuedId, opts.label, opts.payload);
    else await enqueue({ kind: opts.kind, label: opts.label, payload: opts.payload });
    return "queued";
  }
}

export type Errors = Record<string, string | undefined>;

/** A refusal as field messages plus one line on top. */
export function errorsFrom(error: unknown, fallback = "Could not save"): Errors {
  if (!(error instanceof ApiError)) return { form: fallback };
  const fields = error.fieldErrors;
  return { ...fields, form: Object.keys(fields).length ? "Check the fields marked in red." : error.problems.join("\n") };
}

/** "3 things to fix", for the line on top when the form's own checks fail. */
export const fixCount = (errors: Errors) => {
  const count = Object.values(errors).filter(Boolean).length;
  return `${count} thing${count === 1 ? "" : "s"} to fix before saving. Check the fields marked in red.`;
};

/** A typed amount or count as a number, or undefined when empty. */
export const numberOf = (value: string): number | undefined => {
  const clean = value.replace(/,/g, "").trim();
  return clean === "" ? undefined : Number(clean);
};

/**
 * Checks a form while it is filled, like the web: a field's message shows once the
 * person has left it (typed field) or picked a value (dropdown, date) and goes away
 * as soon as it is fixed; nothing is red on a fresh form. Save marks everything.
 * `check` is the form's one list of rules, run on the current values each render;
 * the server's refusals (`setServer`) show under their fields until that field is
 * touched again.
 */
export function useLiveErrors(check: () => Errors) {
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<Errors>({});
  const found = check();
  const count = Object.values(found).filter(Boolean).length;
  const errors: Errors = {};
  for (const [name, message] of Object.entries(found)) {
    if (message && name !== "form" && (submitted || touched[name])) errors[name] = message;
  }
  for (const [name, message] of Object.entries(server)) {
    if (message && name !== "form" && !errors[name]) errors[name] = message;
  }
  errors.form = submitted && count ? (found.form ?? fixCount(found)) : server.form;
  return {
    errors,
    /** A field was left or given a value. */
    touch: (name: string) => {
      setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
      setServer((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    },
    /** Save pressed: show every message; true when nothing is wrong. */
    submit: () => {
      setSubmitted(true);
      setServer({});
      return count === 0;
    },
    /** Next pressed on a stepped form: show this step's messages; true when its fields are fine. */
    checkStep: (names: string[]) => {
      setTouched((prev) => ({ ...prev, ...Object.fromEntries(names.map((n) => [n, true as const])) }));
      return names.every((n) => !found[n]);
    },
    setServer,
  };
}
