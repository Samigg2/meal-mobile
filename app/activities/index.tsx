import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronRight } from "lucide-react-native";
import { ACTIVITY_STATUS, listActivities } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/components/date-picker";
import { EmptyState, ListSkeleton, ProgressBar, SegmentedControl, StatusPill, Text } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

/** The work plan: the officer's own activities first, to update their progress (kept on the phone). */
export default function WorkPlan() {
  const router = useRouter();
  const { user } = useAuth();
  const [show, setShow] = useState<"mine" | "all">("mine");
  const { data, isLoading, error } = useQuery({ queryKey: ["activities"], queryFn: listActivities });

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load the work plan"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }
  const mine = data.filter((a) => a.responsible_id === user?.id);
  const rows = (show === "mine" ? mine : data).filter((a) => a.status !== "cancelled");

  return (
    <FlatList
      data={rows}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <SegmentedControl
            options={[
              { label: "Mine", value: "mine", count: mine.length },
              { label: "All", value: "all", count: data.length },
            ]}
            value={show}
            onChange={setShow}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon={CalendarCheck}
          title={show === "mine" ? "Nothing assigned to you" : "No activities"}
          message="Activities are planned on the web; the ones you are responsible for appear here."
        />
      }
      renderItem={({ item }) => {
        const status = ACTIVITY_STATUS[item.status];
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/activities/[id]", params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.flex}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.planned_start ? formatDate(item.planned_start.slice(0, 10)) : "—"} to{" "}
                {item.planned_end ? formatDate(item.planned_end.slice(0, 10)) : "—"}
                {item.responsible_name && show === "all" ? ` · ${item.responsible_name}` : ""}
              </Text>
              <View style={styles.progress}>
                <ProgressBar value={item.progress_percent} />
              </View>
              <View style={styles.pills}>
                <StatusPill label={`${status.label} · ${item.progress_percent}%`} tone={status.tone} />
                {item.is_delayed ? <StatusPill label="Late" tone="red" /> : null}
              </View>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { marginBottom: spacing.md },
  separator: { height: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  progress: { marginTop: spacing.sm },
  pills: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
});
