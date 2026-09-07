import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { apiBaseUrl } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { MODULE_LABELS, ROLE_LABELS, type PermissionModule } from "@/lib/permissions";
import { colors, radius, spacing } from "@/lib/theme";

const MODULES: PermissionModule[] = [
  "participants",
  "enterprises",
  "training",
  "surveys",
  "monitoring",
  "feedback",
  "learning",
];

export default function More() {
  const { profile, roles, signOut, isGlobalScope, can } = useAuth();
  const queued = useQueue();

  function confirmSignOut() {
    Alert.alert("Sign out?", "Queued submissions stay on this device until you sync them.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.name}>{profile?.full_name || profile?.email || "Signed in"}</Text>
        <Text style={styles.meta}>{profile?.email}</Text>
        <View style={styles.badgeRow}>
          {roles.length ? (
            roles.map((role) => <Badge key={role} text={ROLE_LABELS[role]} />)
          ) : (
            <Badge text="No role assigned" tone="warning" />
          )}
        </View>
        <Text style={styles.meta}>
          {isGlobalScope ? "Sees data across all organizations" : "Sees data for their own organization"}
        </Text>
      </Card>

      <Link href="/sync" asChild>
        <Pressable style={styles.linkCard}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.linkTitle}>Offline queue</Text>
            <Text style={styles.meta}>
              {queued.length === 0
                ? "Everything is uploaded"
                : `${queued.length} submission${queued.length === 1 ? "" : "s"} waiting`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </Link>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Your access</Text>
        {MODULES.map((module) => (
          <View key={module} style={styles.accessRow}>
            <Text style={styles.accessLabel}>{MODULE_LABELS[module]}</Text>
            <Badge
              text={can(module, "write") ? "Read & write" : can(module) ? "Read only" : "No access"}
              tone={can(module, "write") ? "success" : can(module) ? "neutral" : "danger"}
            />
          </View>
        ))}
        <Text style={styles.note}>
          Roles are assigned by an administrator in the web app. The server enforces them on every request.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.meta}>RAYEE II MEAL MIS field app</Text>
        <Text style={styles.meta}>API: {apiBaseUrl}</Text>
        <Text style={styles.note}>
          {"Personal data is handled under Ethiopia's Personal Data Protection Proclamation No. 1321/2024."}
        </Text>
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  card: { gap: spacing.sm },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  linkTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted },
  badgeRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginVertical: spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  accessRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  accessLabel: { fontSize: 13, color: colors.text },
  note: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: spacing.xs },
});
