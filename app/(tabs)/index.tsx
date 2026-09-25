import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CircleCheck, CloudUpload, RefreshCw, UserPlus, ClipboardList, type LucideIcon } from "lucide-react-native";
import { getDashboardStats, listParticipants } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { displayName, greeting, initialsOf } from "@/lib/user";
import { Card, EmptyState, IconBox, Skeleton, StatCard, Text } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { colors, radius, spacing, topics } from "@/theme";

const timeAgo = (ms: number) => {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

const shortDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export default function Overview() {
  const router = useRouter();
  const { profile, roles, user, can } = useAuth();
  const queued = useQueue();
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: getDashboardStats });
  // Shared with the Participants tab, so the recent list costs no extra request.
  const people = useQuery({ queryKey: ["participants"], queryFn: listParticipants });

  const { data, isLoading, isError, error, refetch, isRefetching, dataUpdatedAt } = stats;
  const name = displayName(profile, user?.email);
  const role = roles.length ? roles.map((r) => ROLE_LABELS[r]).join(", ") : "Awaiting role assignment";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  const recent = [...(people.data ?? [])]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 5);

  const actions: { label: string; icon: LucideIcon; color: string; tint: string; onPress: () => void }[] = [
    ...(can("participants", "write")
      ? [
          {
            label: "Register participant",
            icon: UserPlus,
            color: topics.participants.color,
            tint: topics.participants.tint,
            onPress: () => router.push("/participants/new"),
          },
        ]
      : []),
    ...(can("surveys")
      ? [
          {
            label: "Start survey",
            icon: ClipboardList,
            color: topics.surveys.color,
            tint: topics.surveys.tint,
            onPress: () => router.navigate("/(tabs)/surveys"),
          },
        ]
      : []),
    {
      label: "Sync now",
      icon: RefreshCw,
      color: topics.indicators.color,
      tint: topics.indicators.tint,
      onPress: () => router.push("/sync"),
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            void refetch();
            void people.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Compact greeting card */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={styles.date}>{today}</Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{role}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push("/sync")} style={styles.syncLine}>
          {queued.length > 0 ? (
            <>
              <CloudUpload size={14} color="#FCD34D" />
              <Text style={styles.syncText}>
                {queued.length} item{queued.length === 1 ? "" : "s"} waiting to upload
              </Text>
            </>
          ) : (
            <>
              <CircleCheck size={14} color="#86EFAC" />
              <Text style={styles.syncText}>
                All data synced{dataUpdatedAt ? ` · ${timeAgo(dataUpdatedAt)}` : ""}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* KPI grid */}
      {isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} width="48%" height={112} borderRadius={radius.lg} />
          ))}
        </View>
      ) : isError ? (
        <EmptyState
          title="Could not load the overview"
          message={error instanceof Error ? error.message : "Pull down to try again."}
        />
      ) : data ? (
        <>
          <View style={styles.grid}>
            <StatCard topic="participants" label="Participants" value={data.participants} sub={`${data.activeParticipants} active`} />
            <StatCard topic="female" label="Female" value={data.female} />
            <StatCard topic="youth" label="Youth (15–35)" value={data.youth} />
            <StatCard topic="disability" label="With disability" value={data.disability} />
            <StatCard topic="enterprises" label="Enterprises" value={data.enterprises} />
            <StatCard topic="trainings" label="Trainings" value={data.trainingEvents} />
            <StatCard topic="surveys" label="Surveys" value={data.surveyResponses} sub="responses collected" />
            <StatCard
              topic="indicators"
              label="Indicators on track"
              value={data.onTrack}
              sub={`of ${data.indicators} · ${data.atRisk} at risk`}
            />
          </View>

          {/* Quick actions */}
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                onPress={a.onPress}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
              >
                <IconBox icon={a.icon} color={a.color} tint={a.tint} size={32} round />
                <Text style={styles.chipText}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Recent activity */}
          {recent.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Recent activity</Text>
              <Card style={styles.listCard}>
                {recent.map((p, i) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/participants/${p.id}`)}
                    style={[styles.activityRow, i < recent.length - 1 && styles.activityDivider]}
                  >
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: p.sex === "female" ? topics.female.tint : topics.participants.tint },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          { color: p.sex === "female" ? topics.female.color : topics.participants.color },
                        ]}
                      >
                        {initialsOf(p.full_name)}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.activityName} numberOfLines={1}>
                        {p.full_name}
                      </Text>
                      <Text style={styles.activityMeta}>Registered · {shortDate(p.created_at)}</Text>
                    </View>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}

          {data.topRegions.length > 0 ? (
            <Card style={styles.regions}>
              <Text style={styles.cardTitle}>Reach by region</Text>
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
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1 },
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  greeting: { fontSize: 13, color: colors.onNavyMuted },
  name: { fontSize: 20, fontWeight: "700", color: colors.white, letterSpacing: -0.3, marginTop: 2 },
  date: { fontSize: 12, color: colors.onNavyMuted },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  roleText: { fontSize: 12, color: colors.white, fontWeight: "600" },
  syncLine: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28, marginTop: 2 },
  syncText: { fontSize: 12, color: colors.onNavyMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: spacing.lg,
    minHeight: 44,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  listCard: { padding: 0 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 56 },
  activityDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontWeight: "700" },
  activityName: { fontSize: 14, fontWeight: "600", color: colors.text },
  activityMeta: { fontSize: 12, color: colors.muted },
  regions: { gap: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { width: 90, fontSize: 12, color: colors.secondary },
  barTrack: { flex: 1, height: 8, backgroundColor: "#EEF2F7", borderRadius: radius.pill, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.primary, borderRadius: radius.pill },
  barValue: { width: 32, textAlign: "right", fontSize: 12, fontWeight: "700", color: colors.text },
});
