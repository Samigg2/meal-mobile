import Constants from "expo-constants";
import { secureStorage } from "./storage";

/**
 * HTTP client for the MEAL MIS API (meal-mis-backend).
 *
 * Handles bearer auth, a single transparent token refresh on 401, and turns
 * connectivity failures into a recognisable error so field screens can queue
 * the submission instead of losing it.
 */
const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "http://localhost:4000/api/v1"
).replace(/\/$/, "");

const ACCESS_KEY = "meal-mis.access-token";
const REFRESH_KEY = "meal-mis.refresh-token";
const USER_KEY = "meal-mis.user";

export interface SessionUser {
  id: string;
  email: string;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: SessionUser;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the request never reached the API (offline, DNS, timeout). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let sessionUser: SessionUser | null = null;

const listeners = new Set<(user: SessionUser | null) => void>();

function emit() {
  for (const listener of listeners) listener(sessionUser);
}

export function onSessionChange(listener: (user: SessionUser | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Restores a stored session on cold start. */
export async function loadSession(): Promise<SessionUser | null> {
  const [access, refresh, raw] = await Promise.all([
    secureStorage.get(ACCESS_KEY),
    secureStorage.get(REFRESH_KEY),
    secureStorage.get(USER_KEY),
  ]);
  accessToken = access;
  refreshToken = refresh;
  try {
    sessionUser = raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    sessionUser = null;
  }
  if (!accessToken || !refreshToken) sessionUser = null;
  emit();
  return sessionUser;
}

export async function saveSession(session: SessionResponse): Promise<void> {
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;
  sessionUser = session.user;
  await Promise.all([
    secureStorage.set(ACCESS_KEY, session.accessToken),
    secureStorage.set(REFRESH_KEY, session.refreshToken),
    secureStorage.set(USER_KEY, JSON.stringify(session.user)),
  ]);
  emit();
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  sessionUser = null;
  await Promise.all([
    secureStorage.remove(ACCESS_KEY),
    secureStorage.remove(REFRESH_KEY),
    secureStorage.remove(USER_KEY),
  ]);
  emit();
}

export function getSessionUser(): SessionUser | null {
  return sessionUser;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return false;
        const session = (await response.json()) as SessionResponse;
        accessToken = session.accessToken;
        refreshToken = session.refreshToken;
        await Promise.all([
          secureStorage.set(ACCESS_KEY, session.accessToken),
          secureStorage.set(REFRESH_KEY, session.refreshToken),
        ]);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  anonymous?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const params = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join("&")}` : url;
}

async function send<T>(path: string, options: Options, allowRefresh: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : "Network request failed");
  }

  if (response.status === 401 && allowRefresh && !options.anonymous) {
    if (await refreshSession()) return send<T>(path, options, false);
    await clearSession();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
      else if (Array.isArray(payload.message)) message = payload.message.join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => send<T>(path, { method: "GET", query }, true),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: "POST", body }, true),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: "PATCH", body }, true),
  delete: <T>(path: string) => send<T>(path, { method: "DELETE" }, true),
  anon: {
    post: <T>(path: string, body?: unknown) => send<T>(path, { method: "POST", body, anonymous: true }, false),
  },
};

export const apiBaseUrl = BASE_URL;
