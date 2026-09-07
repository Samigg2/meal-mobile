import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getDashboardStats } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { Card, EmptyState, Loading, Stat } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { colors, radius, spacing } from "@/lib/theme";

export default function Overview() {
  const { profile, roles } = useAuth();
  const queued = useQueue();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  });

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      <Card style={styles.hero}>
        <Text style={styles.greeting}>
          {profile?.full_name?.split(" ")[0] || profile?.email || "Welcome"}
        </Text>
        <Text style={styles.role}>
          {roles.length ? roles.map((r) => ROLE_LABELS[r]).join(", ") : "Awaiting role assignment"}
        </Text>
      </Card>

      {queued.length > 0 ? (
        <Link href="/sync" asChild>
          <Pressable style={styles.queueBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
            <View style={styles.flex}>
              <Text style={styles.queueTitle}>
                {queued.length} submission{queued.length === 1 ? "" : "s"} waiting to upload
              </Text>
              <Text style={styles.queueHint}>Tap to sync when you have a connection</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </Link>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <EmptyState
          title="Could not load the overview"
          message={error instanceof Error ? error.message : "Pull down to try again."}
        />
      ) : data ? (
        <>
          <View style={styles.statRow}>
            <Stat label="Participants" value={data.participants} hint={`${data.activeParticipants} active`} />
            <Stat label="Female" value={data.female} />
          </View>
          <View style={styles.statRow}>
            <Stat label="Youth (15–35)" value={data.youth} />
            <Stat label="With disability" value={data.disability} />
          </View>
          <View style={styles.statRow}>
            <Stat label="Enterprises" value={data.enterprises} />
            <Stat label="Training events" value={data.trainingEvents} />
          </View>
          <View style={styles.statRow}>
            <Stat label="Survey responses" value={data.surveyResponses} />
            <Stat
              label="Indicators"
              value={data.indicators}
              hint={`${data.onTrack} on track · ${data.atRisk} at risk`}
            />
          </View>

          {data.topRegions.length > 0 ? (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Reach by region</Text>
              {data.topRegions.map((row) => {
                const max = Math.max(...data.topRegions.map((r) => r.count), 1);
                return (
                  <View key={row.region} style={styles.barRow}>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {row.region}
                    </Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.round((row.count / max) * 100)}%` }]} />
                    </View>
                    <Text style={styles.barValue}>{row.count}</Text>
                  </View>
                );
              })}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  hero: { backgroundColor: colors.primary, borderColor: colors.primary, gap: 2 },
  greeting: { fontSize: 20, fontWeight: "700", color: colors.white },
  role: { fontSize: 13, color: "#D7E9DF" },
  queueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  queueTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  queueHint: { fontSize: 12, color: colors.muted },
  statRow: { flexDirection: "row", gap: spacing.md },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { width: 90, fontSize: 12, color: colors.muted },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.primarySoft, borderRadius: radius.pill, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.primary, borderRadius: radius.pill },
  barValue: { width: 32, textAlign: "right", fontSize: 12, fontWeight: "600", color: colors.text },
});
