import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CloudUpload,
  FileLock2,
  Info,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { clearQueue, syncQueue } from "@/lib/queue";
import { clearSecretCache } from "@/lib/offline-cache";
import { apiBaseUrl } from "@/lib/api";
import { displayName, initialsOf } from "@/lib/user";
import { BottomSheet, Button, Card, ListRow, StatusPill, Text } from "@/components/ui";
import { roleLabel } from "@/lib/permissions";
import { colors, radius, spacing, topics } from "@/theme";

const PRIVACY =
  "Personal data collected with this app is handled under Ethiopia's Personal Data Protection Proclamation No. 1321/2024. " +
  "Collect it only with the participant's informed consent, keep captured records on this device only until they are uploaded, " +
  "and do not share the device or your sign-in with anyone else.";

export default function More() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, roles, user, signOut, isGlobalScope } = useAuth();
  const queued = useQueue();
  const [syncing, setSyncing] = useState(false);
  const [sheet, setSheet] = useState<"privacy" | null>(null);

  const name = displayName(profile, user?.email);
  const email = profile?.email ?? user?.email ?? "";
  const pending = queued.length;
  const version = Constants.expoConfig?.version ?? "1.0.0";

  async function handleSync() {
    setSyncing(true);
    try {
      const { synced, failed } = await syncQueue();
      await queryClient.invalidateQueries();
      Alert.alert(
        "Sync",
        synced === 0 && failed === 0
          ? "Nothing to sync — everything is uploaded."
          : `${synced} uploaded${failed ? `, ${failed} still pending` : ""}.`,
      );
    } finally {
      setSyncing(false);
    }
  }

  function confirmSignOut() {
    // Unsent items are deleted on sign-out: they hold personal data, and the
    // next person to sign in on this phone must not upload them as their own.
    const warning =
      pending > 0
        ? `You have ${pending} item${pending === 1 ? "" : "s"} not uploaded. Signing out deletes ${pending === 1 ? "it" : "them"} from this phone. Sync first if you can. Sign out anyway?`
        : "You will need to sign in again to continue.";
    Alert.alert("Sign out of RAYEE II?", warning, [
      { text: "Cancel", style: "cancel" },
      {
        text: pending > 0 ? "Delete and sign out" : "Sign out",
        style: "destructive",
        onPress: () => void Promise.all([clearQueue(), clearSecretCache()]).finally(() => void signOut()),
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Profile card: opens My profile */}
      <Pressable accessibilityRole="button" onPress={() => router.push("/profile")}>
        <Card style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(name)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {email ? (
              <Text style={styles.email} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
            <View style={styles.pills}>
              {roles.length ? (
                roles.map((r) => <StatusPill key={r} label={roleLabel(r)} tone="blue" />)
              ) : (
                <StatusPill label="No role assigned" tone="amber" />
              )}
            </View>
            <Text style={styles.scope}>
              {isGlobalScope ? "Sees data across all clusters" : "Sees data for their own cluster"}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.faint} />
        </Card>
      </Pressable>

      <Group title="Data">
        <ListRow
          icon={CloudUpload}
          color={pending ? colors.warning : colors.success}
          tint={pending ? colors.warningSoft : colors.successSoft}
          title="Offline queue"
          right={
            <StatusPill label={pending ? `${pending} pending` : "All uploaded"} tone={pending ? "amber" : "green"} />
          }
          onPress={() => router.push("/sync")}
        />
        <ListRow
          icon={RefreshCw}
          color={topics.indicators.color}
          tint={topics.indicators.tint}
          title={syncing ? "Syncing…" : "Sync now"}
          onPress={syncing ? undefined : () => void handleSync()}
          last
        />
      </Group>

      <Group title="Account">
        <ListRow icon={UserRound} title="My profile" onPress={() => router.push("/profile")} last />
      </Group>

      <Group title="Access">
        <ListRow
          icon={ShieldCheck}
          color={topics.enterprises.color}
          tint={topics.enterprises.tint}
          title="Your access"
          subtitle="What your role can see and change"
          onPress={() => router.push("/access")}
          last
        />
      </Group>

      <Group title="About">
        <ListRow icon={Info} title="App version" right={<Text style={styles.value}>{version}</Text>} chevron={false} />
        <ListRow icon={FileLock2} title="Privacy notice" onPress={() => setSheet("privacy")} last={!__DEV__} />
        {/* The API address is for developers only; it is not shown in release builds. */}
        {__DEV__ ? <ListRow icon={Info} title="API (development)" subtitle={apiBaseUrl} chevron={false} last /> : null}
      </Group>

      <Button title="Sign out" variant="outlineDanger" icon={LogOut} onPress={confirmSignOut} />

      <BottomSheet visible={sheet === "privacy"} onClose={() => setSheet(null)} title="Privacy notice">
        <Text style={styles.privacy}>{PRIVACY}</Text>
      </BottomSheet>
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Card style={styles.groupCard}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  flex: { flex: 1 },
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700", color: colors.white },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  email: { fontSize: 13, color: colors.muted, marginTop: 1 },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  scope: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  group: { gap: spacing.sm },
  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 4,
  },
  groupCard: { padding: 0, overflow: "hidden", borderRadius: radius.lg },
  value: { fontSize: 14, color: colors.muted },
  privacy: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 21,
    paddingBottom: spacing.md,
  },
});
