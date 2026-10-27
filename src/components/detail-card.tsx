import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Card, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

/** The top of a read-only detail screen: an icon, the title, one line under it and status pills. */
export function DetailHeader({
  icon: Icon,
  color = colors.primary,
  tint = colors.primarySoft,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  color?: string;
  tint?: string;
  title: string;
  subtitle?: string | null;
  /** Status pills. */
  children?: ReactNode;
}) {
  return (
    <Card style={styles.header}>
      <View style={[styles.avatar, { backgroundColor: tint }]}>
        <Icon size={28} color={color} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.meta}>{subtitle}</Text> : null}
      {children ? <View style={styles.pills}>{children}</View> : null}
    </Card>
  );
}

/** A card of label / value lines, the same lined rows as the enterprise page. Empty values read "—". */
export function DetailCard({
  title,
  rows,
  children,
}: {
  title: string;
  rows?: { label: string; value?: string | null }[];
  children?: ReactNode;
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {(rows ?? []).map((r, i, all) => (
        <View key={r.label} style={[styles.row, i < all.length - 1 && styles.rowLine]}>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.value}>{r.value || "—"}</Text>
        </View>
      ))}
      {children}
    </Card>
  );
}

/** A longer text under a label (a description, a resolution). */
export function DetailText({ label, text }: { label: string; text?: string | null }) {
  return (
    <View style={styles.textBlock}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{text || "—"}</Text>
    </View>
  );
}

export const detailStyles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
});

const styles = StyleSheet.create({
  header: { alignItems: "center", gap: 4 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  meta: { fontSize: 13, color: colors.muted, textAlign: "center" },
  pills: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", justifyContent: "center", marginTop: spacing.sm },
  card: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 10, minHeight: 44 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 14, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  textBlock: { gap: 4, paddingVertical: spacing.xs },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
