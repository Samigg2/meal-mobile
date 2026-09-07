import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  api,
  clearSession,
  getRefreshToken,
  getSessionUser,
  loadSession,
  onSessionChange,
  saveSession,
  type SessionResponse,
  type SessionUser,
} from "./api";
import type { AppRole, ProfileRow } from "./types";
import { hasPermission, isGlobalRole, type PermissionAction, type PermissionModule } from "./permissions";

interface AuthState {
  user: SessionUser | null;
  profile: ProfileRow | null;
  roles: AppRole[];
  /** False until the stored session has been read from secure storage. */
  ready: boolean;
  loadingProfile: boolean;
  isGlobalScope: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  can: (module: PermissionModule, action?: PermissionAction) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [ready, setReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const data = await api.get<{ profile: ProfileRow; roles: AppRole[] }>("/auth/me");
      setProfile(data.profile);
      setRoles(data.roles);
    } catch {
      // Offline start-up keeps the stored session; roles arrive on next connect.
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const restored = await loadSession();
      if (!active) return;
      setUser(restored);
      setReady(true);
      if (restored) void fetchProfile();
    })();
    const unsubscribe = onSessionChange((next) => {
      setUser(next);
      if (!next) {
        setProfile(null);
        setRoles([]);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const session = await api.anon.post<SessionResponse>("/auth/login", { email, password });
        await saveSession(session);
        setUser(session.user);
        await fetchProfile();
        return {};
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Sign in failed" };
      }
    },
    [fetchProfile],
  );

  const signOut = useCallback(async () => {
    try {
      await api.anon.post("/auth/logout", { refreshToken: getRefreshToken() ?? undefined });
    } catch {
      /* offline sign-out still clears the local session */
    }
    await clearSession();
    setUser(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const can = useCallback(
    (module: PermissionModule, action: PermissionAction = "read") => hasPermission(roles, module, action),
    [roles],
  );

  const value = useMemo(
    () => ({
      user: user ?? getSessionUser(),
      profile,
      roles,
      ready,
      loadingProfile,
      isGlobalScope: isGlobalRole(roles),
      signIn,
      signOut,
      can,
      refreshProfile: fetchProfile,
    }),
    [user, profile, roles, ready, loadingProfile, signIn, signOut, can, fetchProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
