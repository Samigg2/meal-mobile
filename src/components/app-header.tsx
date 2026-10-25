import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CloudCheck, CloudUpload } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getNotifications } from "@/lib/data";
import { useQueue } from "@/lib/net";
import { useAuth } from "@/lib/auth";
import { displayName, initialsOf } from "@/lib/user";
import { Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

/**
 * Header for the tab screens: white, safe-area aware, 56px, bottom border.
 * Title on the left; sync status and notifications (each a soft coloured circle)
 * and the profile avatar on the right. The cloud opens the offline queue, the bell
 * the notifications; the avatar opens My profile; settings live in More.
 */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queued = useQueue();
  const { profile, user } = useAuth();

  // The same count the web bell shows (not yet opened items); offline it keeps the last number.
  const { data: notes } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const notifications = notes?.total ?? 0;
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
          <View style={[styles.circle, { backgroundColor: pending > 0 ? colors.warningSoft : colors.successSoft }]}>
            {pending > 0 ? (
              <CloudUpload size={19} color={colors.warning} strokeWidth={2.2} />
            ) : (
              <CloudCheck size={19} color={colors.success} strokeWidth={2.2} />
            )}
          </View>
          {pending > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.warning }]}>
              <Text style={styles.badgeText}>{pending > 9 ? "9+" : pending}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={notifications ? `Notifications, ${notifications} new` : "Notifications"}
          onPress={() => router.push("/notifications")}
          style={styles.iconButton}
        >
          <View style={[styles.circle, { backgroundColor: colors.primarySoft }]}>
            <Bell size={19} color={colors.primary} strokeWidth={2.2} />
          </View>
          {notifications > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.danger }]}>
              <Text style={styles.badgeText}>{notifications > 9 ? "9+" : notifications}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My profile"
          onPress={() => router.push("/profile")}
          style={styles.avatarWrap}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(displayName(profile, user?.email))}</Text>
          </View>
        </Pressable>
      </View>
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
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 2 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  avatarWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "700", color: colors.white },
});
