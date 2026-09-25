import {
  Accessibility,
  ClipboardList,
  GraduationCap,
  HandCoins,
  Landmark,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  UsersRound,
  Venus,
  type LucideIcon,
} from "lucide-react-native";

/**
 * The one theme for the field app. It mirrors the web dashboard: same colours,
 * same topic colour + icon pairs, same status pill colours.
 */
export const colors = {
  navy: "#16213A",
  primary: "#1D63D8",
  primaryDark: "#1E3A8A",
  primarySoft: "#EAF1FE",
  accent: "#3B82F6",
  /** Kept for older call sites: the dark brand surface. */
  ink: "#16213A",
  background: "#F5F7FB",
  card: "#FFFFFF",
  border: "#E3E8F0",
  text: "#0F172A",
  secondary: "#475569",
  muted: "#64748B",
  faint: "#94A3B8",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  success: "#15803D",
  successSoft: "#DCFCE7",
  white: "#FFFFFF",
  /** Muted text on the navy surfaces. */
  onNavyMuted: "#9FB0CC",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

/** Card lift: iOS shadow, Android elevation 1–2. */
export const shadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/** Plus Jakarta Sans, one family name per weight (RN cannot pick weights from a family). */
export const fontFamilies = {
  "400": "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
} as const;

export interface TopicStyle {
  color: string;
  tint: string;
  icon: LucideIcon;
}

/** Same topic colours and icons as the web dashboard. */
export const topics = {
  participants: { color: "#2563EB", tint: "#DBEAFE", icon: UsersRound },
  female: { color: "#DB2777", tint: "#FCE7F3", icon: Venus },
  youth: { color: "#0891B2", tint: "#CFFAFE", icon: Sparkles },
  disability: { color: "#7C3AED", tint: "#EDE9FE", icon: Accessibility },
  enterprises: { color: "#059669", tint: "#D1FAE5", icon: Store },
  trainings: { color: "#EA580C", tint: "#FFEDD5", icon: GraduationCap },
  surveys: { color: "#CA8A04", tint: "#FEF9C3", icon: ClipboardList },
  indicators: { color: "#C026D3", tint: "#FAE8FF", icon: TrendingUp },
  loans: { color: "#CA8A04", tint: "#FEF9C3", icon: HandCoins },
  safeguarding: { color: "#DC2626", tint: "#FEE2E2", icon: ShieldCheck },
  ysla: { color: "#EA580C", tint: "#FFEDD5", icon: Landmark },
} as const satisfies Record<string, TopicStyle>;

export type TopicName = keyof typeof topics;

/** Status pill colours: foreground on background. */
export const pillTones = {
  green: { fg: "#15803D", bg: "#DCFCE7" },
  amber: { fg: "#B45309", bg: "#FEF3C7" },
  red: { fg: "#B91C1C", bg: "#FEE2E2" },
  blue: { fg: "#1D4ED8", bg: "#DBEAFE" },
  violet: { fg: "#6D28D9", bg: "#EDE9FE" },
  grey: { fg: "#475569", bg: "#F1F5F9" },
} as const;

export type PillTone = keyof typeof pillTones;

/** Minimum touch target. */
export const TOUCH = 44;
