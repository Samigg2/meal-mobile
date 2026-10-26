import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronDown, ChevronRight, GraduationCap } from "lucide-react-native";
import { getTrainingDetail } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/components/date-picker";
import { Button, Card, EmptyState, ListSkeleton, StatusPill, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

const capital = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : null);

/**
 * One training on the phone: its days and the attendance already recorded for
 * each (how many came; tap a day for the names), with "Take attendance".
 */
export default function TrainingEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["training-detail", id],
    queryFn: () => getTrainingDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <ListSkeleton rows={3} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load this training"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  const { event, roster, attendance } = data;
  const names = new Map(roster.map((r) => [r.participant_id, r.participants?.full_name ?? "Unknown"]));
  // Each day recorded, newest first, with who was present.
  const days = [...new Set(attendance.map((a) => a.attendance_date.slice(0, 10)))].sort((a, b) => (a < b ? 1 : -1));
  const presentOn = (day: string) =>
    attendance
      .filter((a) => a.attendance_date.slice(0, 10) === day)
      .map((a) => names.get(a.participant_id) ?? "Unknown")
      .sort();
  const start = event.start_date?.slice(0, 10);
  const end = event.end_date?.slice(0, 10);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      <Card style={styles.header}>
        <View style={styles.avatar}>
          <GraduationCap size={28} color={colors.primary} />
        </View>
        <Text style={styles.name}>{event.title}</Text>
        <Text style={styles.meta}>
          {start ? formatDate(start) : "—"}
          {end && end !== start ? ` to ${formatDate(end)}` : ""}
          {event.region ? ` · ${event.region}` : ""}
        </Text>
        <View style={styles.pills}>
          <StatusPill label={capital(event.status) ?? ""} tone={event.status === "completed" ? "green" : "blue"} />
          <StatusPill label={`${roster.length} enrolled`} tone="grey" />
        </View>
        {can("training", "write") ? (
          <View style={styles.action}>
            <Button
              title="Take attendance"
              icon={CalendarCheck}
              onPress={() => router.push({ pathname: "/training/[id]", params: { id: event.id } })}
            />
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Attendance recorded</Text>
        {days.length === 0 ? (
          <Text style={styles.meta}>No day recorded yet.</Text>
        ) : (
          days.map((day, i) => {
            const present = presentOn(day);
            const shown = open === day;
            return (
              <View key={day} style={i > 0 && styles.divider}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: shown }}
                  onPress={() => setOpen(shown ? null : day)}
                  style={({ pressed }) => [styles.dayRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.value}>{formatDate(day)}</Text>
                    <Text style={styles.meta}>
                      {present.length} of {roster.length} present
                    </Text>
                  </View>
                  {shown ? <ChevronDown size={18} color={colors.faint} /> : <ChevronRight size={18} color={colors.faint} />}
                </Pressable>
                {shown ? (
                  <View style={styles.names}>
                    {present.map((n, j) => (
                      <Text key={`${n}-${j}`} style={styles.nameItem}>
                        {n}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  header: { alignItems: "center", gap: 4 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  name: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  pills: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", justifyContent: "center", marginTop: spacing.sm },
  action: { marginTop: spacing.sm, alignSelf: "stretch" },
  card: { gap: spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  meta: { fontSize: 13, color: colors.muted },
  value: { fontSize: 15, color: colors.text, fontWeight: "600" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, minHeight: 44 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  names: { paddingBottom: spacing.sm, paddingLeft: spacing.md, gap: 4 },
  nameItem: { fontSize: 14, color: colors.text },
});
