import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GraduationCap } from "lucide-react-native";
import { listTrainingEvents, nearToday } from "@/lib/data";
import { formatDate } from "@/components/date-picker";
import { EmptyState, IconBox, ListSkeleton, SearchBar, Text } from "@/components/ui";
import { colors, radius, spacing, topics } from "@/theme";

/**
 * Every training the person can see, the ones nearest to today first, with a search
 * box. The ones running from two weeks ago to two weeks ahead are tagged "Near today":
 * those are what "Download for offline" keeps on the phone.
 */
export default function TrainingList() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({ queryKey: ["training-events"], queryFn: listTrainingEvents });
  const [search, setSearch] = useState("");

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load trainings"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }
  const near = new Set(nearToday(data).map((t) => t.id));
  const today = new Date().toISOString().slice(0, 10);
  // Days from today to the nearest day of the session (0 while it runs).
  const distance = (t: (typeof data)[number]) => {
    const from = t.start_date?.slice(0, 10);
    if (!from) return Number.MAX_SAFE_INTEGER;
    const to = t.end_date?.slice(0, 10) ?? from;
    const target = today < from ? from : today > to ? to : today;
    return Math.abs(new Date(target).getTime() - new Date(today).getTime());
  };
  const words = search.trim().toLowerCase();
  const events = [...data]
    .filter((t) => !words || `${t.title} ${t.training_type ?? ""} ${t.region ?? ""} ${t.woreda ?? ""}`.toLowerCase().includes(words))
    .sort((a, b) => distance(a) - distance(b));

  return (
    <FlatList
      data={events}
      // Drawn as it scrolls, so hundreds of trainings stay quick (12Beforeend).
      initialNumToRender={15}
      maxToRenderPerBatch={20}
      windowSize={7}
      ListHeaderComponent={
        <View style={styles.search}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search trainings" />
        </View>
      }
      keyExtractor={(t) => t.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <EmptyState
          icon={GraduationCap}
          title={words ? "No training matches" : "No trainings yet"}
          message={words ? "Try another word." : "Trainings you can take attendance for appear here."}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/training/event", params: { id: item.id } })}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
        >
          <IconBox icon={GraduationCap} color={topics.trainings.color} tint={topics.trainings.tint} size={40} />
          <View style={styles.flex}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.start_date ? formatDate(item.start_date.slice(0, 10)) : "—"}
              {item.end_date && item.end_date !== item.start_date ? ` to ${formatDate(item.end_date.slice(0, 10))}` : ""}
              {item.region ? ` · ${item.region}` : ""}
              {near.has(item.id) ? " · Near today" : ""}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.faint} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  separator: { height: spacing.md },
  search: { marginBottom: spacing.md },
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
});
