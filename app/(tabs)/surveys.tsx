import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { listSurveys } from "@/lib/data";
import { Badge, EmptyState, Loading } from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";

export default function Surveys() {
  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["surveys"],
    queryFn: listSurveys,
  });

  if (isLoading) return <Loading />;
  if (isError) {
    return (
      <EmptyState
        title="Could not load surveys"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  const open = data.filter((s) => s.status === "active");

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <Text style={styles.header}>
          {open.length} active round{open.length === 1 ? "" : "s"} · {data.length} total
        </Text>
      }
      ListEmptyComponent={
        <EmptyState title="No surveys yet" message="Survey rounds created in the web app appear here." />
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => {
        const collectable = item.status === "active";
        const body = (
          <>
            <View style={styles.flex}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.question_count} question{item.question_count === 1 ? "" : "s"} · {item.response_count} response
                {item.response_count === 1 ? "" : "s"}
                {item.target_sample ? ` of ${item.target_sample}` : ""}
              </Text>
              <View style={styles.badgeRow}>
                <Badge text={item.survey_round} />
                <Badge text={item.status} tone={collectable ? "success" : "neutral"} />
              </View>
            </View>
            {collectable ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
          </>
        );

        if (!collectable) return <View style={styles.rowClosed}>{body}</View>;

        return (
          <Link href={`/surveys/${item.id}`} asChild>
            <Pressable style={styles.row}>{body}</Pressable>
          </Link>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { fontSize: 12, color: colors.muted, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowClosed: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    opacity: 0.6,
  },
  separator: { height: spacing.sm },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  badgeRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
});
