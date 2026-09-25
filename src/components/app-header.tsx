import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CloudCheck, CloudUpload, MessageSquare, ShieldCheck, ListChecks, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDashboardStats } from "@/lib/data";
import { useQueue } from "@/lib/net";
import { BottomSheet, ListRow, Text } from "@/components/ui";
import { colors, spacing, topics } from "@/theme";

/**
 * Header for the tab screens: white, safe-area aware, 56px, bottom border.
 * Title on the left; sync status, notifications and the profile avatar on the
 * right. Settings live in More, reached from the avatar.
 */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queued = useQueue();
  const [bellOpen, setBellOpen] = useState(false);

  // Shares the Overview query, so this costs no extra request.
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: getDashboardStats });

  const attention = [
    { label: "Feedback awaiting response", count: stats?.openFeedback ?? 0, icon: MessageSquare, color: topics.surveys },
    { label: "Open safeguarding cases", count: stats?.openSafeguarding ?? 0, icon: ShieldCheck, color: topics.safeguarding },
    { label: "Open action items", count: stats?.openActions ?? 0, icon: ListChecks, color: topics.trainings },
  ].filter((i) => i.count > 0);
  const notifications = attention.reduce((n, i) => n + i.count, 0);
  const pending = queued.length;

  return (
    <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pending ? `${pending} items waiting to upload` : "All data uploaded"}
          onPress={() => router.push("/sync")}
          style={styles.iconButton}
        >
          {pending > 0 ? (
            <CloudUpload size={22} color={colors.warning} />
          ) : (
            <CloudCheck size={22} color={colors.success} />
          )}
          {pending > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.warning }]}>
              <Text style={styles.badgeText}>{pending > 9 ? "9+" : pending}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => setBellOpen(true)}
          style={styles.iconButton}
        >
          <Bell size={22} color={colors.secondary} />
          {notifications > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.danger }]}>
              <Text style={styles.badgeText}>{notifications > 9 ? "9+" : notifications}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => router.navigate("/(tabs)/more")}
          style={styles.avatarWrap}
        >
          <View style={styles.avatar}>
            <User size={17} color={colors.primary} strokeWidth={2.2} />
          </View>
        </Pressable>
      </View>

      <BottomSheet visible={bellOpen} onClose={() => setBellOpen(false)} title="Needs attention">
        {attention.length === 0 && pending === 0 ? (
          <Text style={styles.empty}>Nothing needs attention right now.</Text>
        ) : (
          <>
            {pending > 0 ? (
              <ListRow
                icon={CloudUpload}
                color={colors.warning}
                tint={colors.warningSoft}
                title={`${pending} submission${pending === 1 ? "" : "s"} waiting to upload`}
                subtitle="Tap to open the offline queue"
                onPress={() => {
                  setBellOpen(false);
                  router.push("/sync");
                }}
              />
            ) : null}
            {attention.map((item, i) => (
              <ListRow
                key={item.label}
                icon={item.icon}
                color={item.color.color}
                tint={item.color.tint}
                title={item.label}
                right={<Text style={styles.count}>{item.count}</Text>}
                chevron={false}
                last={i === attention.length - 1}
              />
            ))}
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 2 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 6,
    right: 5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  avatarWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { fontSize: 14, color: colors.muted, paddingVertical: spacing.lg },
  count: { fontSize: 15, fontWeight: "700", color: colors.text },
});
