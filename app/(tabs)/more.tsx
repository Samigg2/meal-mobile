import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import {
  CloudUpload,
  FileLock2,
  Info,
  KeyRound,
  Languages,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { syncQueue } from "@/lib/queue";
import { apiBaseUrl } from "@/lib/api";
import { displayName } from "@/lib/user";
import { BottomSheet, Button, Card, ListRow, StatusPill, Text } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
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
  const [sheet, setSheet] = useState<"profile" | "privacy" | null>(null);

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
    const warning =
      pending > 0
        ? `You have ${pending} item${pending === 1 ? "" : "s"} not uploaded. Sign out anyway?`
        : "You will need to sign in again to continue.";
    Alert.alert("Sign out of RAYEE II?", warning, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Profile card */}
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <User size={28} color={colors.primary} strokeWidth={2} />
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
              roles.map((r) => <StatusPill key={r} label={ROLE_LABELS[r]} tone="blue" />)
            ) : (
              <StatusPill label="No role assigned" tone="amber" />
            )}
          </View>
          <Text style={styles.scope}>
            {isGlobalScope ? "Sees data across all organizations" : "Sees data for their own organization"}
          </Text>
        </View>
      </Card>

      <Group title="Data">
        <ListRow
          icon={CloudUpload}
          color={pending ? colors.warning : colors.success}
          tint={pending ? colors.warningSoft : colors.successSoft}
          title="Offline queue"
          right={<StatusPill label={pending ? `${pending} pending` : "All uploaded"} tone={pending ? "amber" : "green"} />}
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
        <ListRow icon={UserRound} title="My profile" onPress={() => setSheet("profile")} />
        <ListRow
          icon={KeyRound}
          title="Change password"
          onPress={() =>
            Alert.alert(
              "Change password",
              "Use “Forgot password?” on the sign-in screen, or ask an administrator to reset it for you.",
            )
          }
        />
        <ListRow
          icon={Languages}
          title="Language"
          right={<Text style={styles.value}>English</Text>}
          onPress={() => Alert.alert("Language", "English is the only language available for now.")}
          last
        />
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
        {__DEV__ ? (
          <ListRow icon={Info} title="API (development)" subtitle={apiBaseUrl} chevron={false} last />
        ) : null}
      </Group>

      <Button title="Sign out" variant="outlineDanger" icon={LogOut} onPress={confirmSignOut} />

      <BottomSheet visible={sheet === "profile"} onClose={() => setSheet(null)} title="My profile">
        <View style={styles.sheetBody}>
          <Detail label="Name" value={name} />
          <Detail label="Email" value={email} />
          <Detail label="Role" value={roles.length ? roles.map((r) => ROLE_LABELS[r]).join(", ") : "None assigned"} />
          <Detail label="Organization" value={profile?.organization ?? "—"} />
          <Detail label="Phone" value={profile?.phone ?? "—"} />
        </View>
      </BottomSheet>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  email: { fontSize: 13, color: colors.muted, marginTop: 1 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  scope: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginLeft: 4 },
  groupCard: { padding: 0, overflow: "hidden", borderRadius: radius.lg },
  value: { fontSize: 14, color: colors.muted },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.md },
  detail: { gap: 2 },
  detailLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  detailValue: { fontSize: 15, color: colors.text },
  privacy: { fontSize: 14, color: colors.secondary, lineHeight: 21, paddingBottom: spacing.md },
});
