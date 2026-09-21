/** Shared visual tokens, taken from the web app's stylesheet (src/styles.css). */
export const colors = {
  primary: "#2563eb",
  primaryDark: "#1e3a8a",
  primarySoft: "#eff6ff",
  accent: "#3b82f6",
  /** The web sidebar colour; used for dark brand surfaces. */
  ink: "#1e293b",
  background: "#f7f9fc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  success: "#059669",
  successSoft: "#ecfdf5",
  white: "#ffffff",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

/** One soft elevation, so cards lift off the page without heavy borders. */
export const shadow = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
