import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Building2, CloudDownload, CloudUpload, Mail, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { cachedAt } from "@/lib/offline-cache";
import { LOOKUPS_CACHE_KEY } from "@/lib/reference";
import { displayName, initialsOf } from "@/lib/user";
import { roleLabel } from "@/lib/permissions";
import { Card, ListRow, StatusPill, Text } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

/** Who is signed in on this phone, where their data reaches, and what is still on the phone. */
export default function Profile() {
  const router = useRouter();
  const { profile, roles, user, isGlobalScope } = useAuth();
  const queued = useQueue();
  const [lastDownload, setLastDownload] = useState<string | null>(null);
  useEffect(() => {
    void cachedAt(LOOKUPS_CACHE_KEY).then(setLastDownload);
  }, []);

  const name = displayName(profile, user?.email);
  const email = profile?.email ?? user?.email ?? "";
  const failed = queued.filter((q) => q.lastError).length;
  const reach = isGlobalScope ? "National: all organizations" : (profile?.organization ?? "Own organization only");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(name)}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {profile?.position ? <Text style={styles.position}>{profile.position}</Text> : null}
        <View style={styles.pills}>
          {roles.length ? (
            roles.map((r) => <StatusPill key={r} label={roleLabel(r)} tone="blue" />)
          ) : (
            <StatusPill label="No role assigned" tone="amber" />
          )}
        </View>
      </View>

      <Text style={styles.groupTitle}>Account</Text>
      <Card style={styles.group}>
        <ListRow icon={Mail} title="Email" subtitle={email || "—"} chevron={false} />
        <ListRow icon={Building2} title="Data you see" subtitle={reach} chevron={false} />
        <ListRow
          icon={ShieldCheck}
          title="Your access"
          subtitle="What your role can see and change"
          onPress={() => router.push("/access")}
          last
        />
      </Card>

      <Text style={styles.groupTitle}>On this phone</Text>
      <Card style={styles.group}>
        <ListRow
          icon={CloudUpload}
          color={queued.length ? colors.warning : colors.success}
          tint={queued.length ? colors.warningSoft : colors.successSoft}
          title="Waiting to send"
          right={
            <StatusPill
              label={queued.length ? String(queued.length) : "None"}
              tone={queued.length ? "amber" : "green"}
            />
          }
          onPress={() => router.push("/sync")}
        />
        {failed > 0 ? (
          <ListRow
            icon={TriangleAlert}
            color={colors.danger}
            tint={colors.dangerSoft}
            title={`${failed} refused by the server`}
            subtitle="Open Sync to fix them"
            onPress={() => router.push("/sync")}
          />
        ) : null}
        <ListRow
          icon={CloudDownload}
          title="Offline data"
          subtitle={`Downloaded: ${when(lastDownload)}`}
          onPress={() => router.push("/sync")}
          last
        />
      </Card>
      <Text style={styles.note}>To change your name or password, ask your administrator.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  head: { alignItems: "center", gap: 4, paddingVertical: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 26, fontWeight: "700", color: colors.white },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  position: { fontSize: 13, color: colors.muted },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: spacing.md,
  },
  group: { padding: 0, overflow: "hidden", borderRadius: radius.lg },
  note: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
