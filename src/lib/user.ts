import type { ProfileRow } from "./types";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The name to greet someone by. Uses the profile's full name; with none (or the
 * placeholder "System" the seed account carries) it falls back to the part of
 * the email before the "@", capitalised. A raw email is never shown.
 */
export function displayName(profile: ProfileRow | null, email?: string | null): string {
  const full = profile?.full_name?.trim();
  // "System Administrator" is the seed account's placeholder, not a person's name.
  if (full && !/^system/i.test(full)) return full;
  const address = (profile?.email ?? email ?? "").trim();
  const local = address.split("@")[0];
  if (!local) return "there";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(capitalise)
    .join(" ");
}

/** Up to two initials from a display name. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning," : h < 18 ? "Good afternoon," : "Good evening,";
}
