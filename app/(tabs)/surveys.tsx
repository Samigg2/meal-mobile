import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRight, ClipboardList } from "lucide-react-native";
import { listSurveys } from "@/lib/data";
import {
  EmptyState,
  IconBox,
  ListSkeleton,
  ProgressBar,
  SegmentedControl,
  StatusPill,
  Text,
} from "@/components/ui";
import { colors, radius, spacing, topics, type PillTone } from "@/theme";

type Tab = "active" | "draft" | "closed";

const STATUS_TONE: Record<string, PillTone> = { active: "green", draft: "amber", closed: "grey" };

const EMPTY_TEXT: Record<Tab, string> = {
  active: "No survey rounds are open for collection. Rounds you activate in the web app appear here.",
  draft: "Draft rounds are still being prepared in the web app.",
  closed: "Rounds that have finished collecting appear here.",
};

export default function Surveys() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");
  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["surveys"],
    queryFn: listSurveys,
  });

  if (isError) {
    return (
      <EmptyState
        title="Could not load surveys"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  const count = (s: Tab) => data.filter((x) => x.status === s).length;
  const shown = data.filter((x) => x.status === tab);
  const t = topics.surveys;

  return (
    <FlatList
      data={isLoading ? [] : shown}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.summaryRow}>
            <View style={styles.summary}>
              <IconBox icon={ClipboardList} color={t.color} tint={t.tint} size={40} />
              <View>
                <Text style={[styles.summaryValue, { color: t.color }]}>{count("active")}</Text>
                <Text style={styles.summaryLabel}>Active rounds</Text>
              </View>
            </View>
            <View style={styles.summary}>
              <IconBox icon={ClipboardList} color={t.color} tint={t.tint} size={40} />
              <View>
                <Text style={[styles.summaryValue, { color: t.color }]}>{data.length}</Text>
                <Text style={styles.summaryLabel}>Total surveys</Text>
              </View>
            </View>
          </View>
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { label: "Active", value: "active", count: count("active") },
              { label: "Draft", value: "draft", count: count("draft") },
              { label: "Closed", value: "closed", count: count("closed") },
            ]}
          />
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <ListSkeleton rows={4} />
        ) : (
          <EmptyState
            icon={ClipboardList}
            color={t.color}
            tint={t.tint}
            title={data.length === 0 ? "No surveys yet" : `No ${tab} surveys`}
            message={data.length === 0 ? "Survey rounds created in the web app appear here." : EMPTY_TEXT[tab]}
          />
        )
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => {
        const collectable = item.status === "active";
        const progress = item.target_sample ? (item.response_count / item.target_sample) * 100 : null;
        const body = (
          <>
            <IconBox icon={ClipboardList} color={t.color} tint={t.tint} size={44} />
            <View style={styles.flex}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.question_count} question{item.question_count === 1 ? "" : "s"} · {item.response_count}
                {item.target_sample ? ` of ${item.target_sample}` : ""} response
                {(item.target_sample ?? item.response_count) === 1 ? "" : "s"}
              </Text>
              {progress !== null ? (
                <View style={styles.progress}>
                  <ProgressBar value={progress} color={t.color} />
                </View>
              ) : null}
              <View style={styles.pills}>
                <StatusPill label={item.survey_round} tone="blue" />
                <StatusPill label={item.status} tone={STATUS_TONE[item.status] ?? "grey"} />
              </View>
            </View>
            {collectable ? <ChevronRight size={18} color={colors.faint} /> : null}
          </>
        );

        // Drafts and closed rounds stay fully readable; they just cannot be opened for collection.
        if (!collectable) return <View style={styles.row}>{body}</View>;
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/surveys/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            {body}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  summaryRow: { flexDirection: "row", gap: spacing.md },
  summary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  summaryValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  summaryLabel: { fontSize: 12, color: colors.secondary, fontWeight: "600" },
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
  separator: { height: spacing.md },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  progress: { marginTop: spacing.sm },
  pills: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
});
