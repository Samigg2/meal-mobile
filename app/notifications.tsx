import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CircleCheck } from "lucide-react-native";
import { getNotifications, markNotificationSeen, type NotificationItem } from "@/lib/data";
import { formatDate } from "@/components/date-picker";
import { Card, EmptyState, ListRow, ListSkeleton, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

/** The phone screens a web path can open; anything else is read here and finished on the web. */
function phoneRoute(href: string) {
  const person = /^\/participants\/([0-9a-f-]{36})\/?$/i.exec(href);
  if (person) return { pathname: "/participants/[id]" as const, params: { id: person[1] } };
  return null;
}

/**
 * What is waiting for this person (the same list as the web bell): feedback to answer,
 * cases to review, records to approve, by what their access allows. Opening an item
 * marks it seen, so it stops counting on the bell until its record changes.
 */
export default function Notifications() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    retry: false,
  });

  if (isLoading) return <ListSkeleton rows={5} />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load notifications"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  async function open(queue: string, item: NotificationItem) {
    // Marking it seen is a courtesy: opening the record must not wait for it, or fail without a connection.
    void markNotificationSeen(queue, item.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => undefined);
    const route = phoneRoute(item.href);
    if (route) router.push(route);
  }

  const groups = data.groups.filter((g) => g.items.length > 0);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      {groups.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          color={colors.success}
          tint={colors.successSoft}
          title="Nothing is waiting"
          message="New feedback, cases and approvals for you appear here."
        />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              {group.unseen > 0 ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{group.unseen} new</Text>
                </View>
              ) : null}
            </View>
            <Card style={styles.card}>
              {group.items.slice(0, 20).map((item, i, shown) => {
                const onPhone = !!phoneRoute(item.href);
                return (
                  <ListRow
                    key={item.id}
                    icon={BellRing}
                    color={item.seen ? colors.faint : colors.primary}
                    tint={item.seen ? colors.background : colors.primarySoft}
                    title={item.title}
                    subtitle={`${item.subtitle}${item.subtitle ? " · " : ""}${formatDate(item.created_at.slice(0, 10))}${onPhone ? "" : " · finish on the web"}`}
                    onPress={() => void open(group.key, item)}
                    chevron={onPhone}
                    last={i === shown.length - 1}
                  />
                );
              })}
            </Card>
            {group.items.length > 20 ? (
              <Text style={styles.more}>
                {group.items.length - 20} more: open the web app to see the full list.
              </Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, flexGrow: 1 },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  pill: { backgroundColor: colors.dangerSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "700", color: colors.danger },
  card: { padding: 0 },
  more: { fontSize: 12, color: colors.muted },
});
