import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  CalendarCheck,
  ChevronRight,
  CircleCheck,
  CloudUpload,
  GraduationCap,
  MessageSquareText,
  ShieldAlert,
  UserPlus,
  ClipboardList,
  type LucideIcon,
} from "lucide-react-native";
import { getDashboardStats, listRecentParticipants, type DashboardStats } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { displayName, greeting, initialsOf } from "@/lib/user";
import { Card, EmptyState, IconBox, Skeleton, Text } from "@/components/ui";
import { roleLabel } from "@/lib/permissions";
import { colors, radius, shadow, spacing, topics, type TopicName } from "@/theme";
import { useSettings } from "@/lib/reference";

const timeAgo = (ms: number) => {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

const shortDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const tone = (t: TopicName) => ({
  color: topics[t].color,
  tint: topics[t].tint,
});

function SectionTitle({ children }: { children: string }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export default function Overview() {
  const settings = useSettings();
  const router = useRouter();
  const { profile, roles, user, can } = useAuth();
  const queued = useQueue();
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  });
  // Only the five newest — the server lists newest first.
  const people = useQuery({
    queryKey: ["participants", "recent"],
    queryFn: () => listRecentParticipants(5),
  });

  const { data, isLoading, isError, error, refetch, isRefetching, dataUpdatedAt } = stats;
  const name = displayName(profile, user?.email);
  const role = roles.length ? roles.map((r) => roleLabel(r)).join(", ") : "Awaiting role assignment";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const recent = people.data ?? [];

  // Field forms that work offline, each only for those who may fill it. Enterprise,
  // loan and job are opened from the participant they are for.
  const fieldWork: {
    label: string;
    icon: LucideIcon;
    color: string;
    tint: string;
    go: () => void;
  }[] = [
    ...(can("participants", "write")
      ? [
          {
            label: "Register",
            icon: UserPlus,
            ...tone("participants"),
            go: () => router.push("/participants/new"),
          },
        ]
      : []),
    ...(can("surveys")
      ? [
          {
            label: "Survey",
            icon: ClipboardList,
            ...tone("surveys"),
            go: () => router.navigate("/(tabs)/surveys"),
          },
        ]
      : []),
    ...(can("training", "write")
      ? [
          {
            label: "Attendance",
            icon: GraduationCap,
            ...tone("trainings"),
            go: () => router.push("/training"),
          },
        ]
      : []),
    ...(can("safeguarding", "write")
      ? [
          {
            label: "Concern",
            icon: ShieldAlert,
            ...tone("safeguarding"),
            go: () => router.push("/safeguarding/new"),
          },
        ]
      : []),
    ...(can("feedback", "write")
      ? [
          {
            label: "Feedback",
            icon: MessageSquareText,
            ...tone("disability"),
            go: () => router.push("/feedback/new"),
          },
        ]
      : []),
    ...(can("monitoring", "write")
      ? [
          {
            label: "Work plan",
            icon: CalendarCheck,
            ...tone("indicators"),
            go: () => router.push("/activities"),
          },
        ]
      : []),
  ];

  // Small numbers; the registers among them open their list.
  const numbers = (d: DashboardStats): { topic: TopicName; label: string; value: number; go?: () => void }[] => [
    {
      topic: "participants",
      label: "Participants",
      value: d.participants,
      go: () => router.navigate("/(tabs)/participants"),
    },
    { topic: "female", label: "Female", value: d.female },
    {
      topic: "youth",
      label: `Youth ${settings.youth_min_age}–${settings.youth_max_age}`,
      value: d.youth,
    },
    { topic: "disability", label: "Disability", value: d.disability },
    ...(can("enterprises")
      ? [
          {
            topic: "enterprises" as const,
            label: "Enterprises",
            value: d.enterprises,
            go: () => router.push("/enterprises"),
          },
        ]
      : []),
    ...(can("employment")
      ? [
          {
            topic: "jobs" as const,
            label: "Jobs",
            value: d.placements ?? 0,
            go: () => router.push("/employment"),
          },
        ]
      : []),
    ...(can("finance")
      ? [
          {
            topic: "loans" as const,
            label: "Loans",
            value: d.loans ?? 0,
            go: () => router.push("/finance"),
          },
        ]
      : []),
    { topic: "trainings", label: "Trainings", value: d.trainingEvents },
    { topic: "surveys", label: "Responses", value: d.surveyResponses },
    {
      topic: "indicators",
      label: `On track of ${d.indicators}`,
      value: d.onTrack,
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
                {data?.savedAt
                  ? `Offline · numbers saved ${timeAgo(new Date(data.savedAt).getTime())}`
                  : `All data synced${dataUpdatedAt ? ` · ${timeAgo(dataUpdatedAt)}` : ""}`}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Field work first: it is what the officer opened the app for */}
      {fieldWork.length > 0 ? (
        <>
          <SectionTitle>Field work</SectionTitle>
          <View style={styles.grid}>
            {fieldWork.map((f) => (
              <Pressable
                key={f.label}
                accessibilityRole="button"
                onPress={f.go}
                style={({ pressed }) => [styles.tile, { borderBottomColor: f.color }, pressed && styles.pressed]}
              >
                {/* Like the web dashboard cards: solid icon circle, coloured bottom line. */}
                <IconBox icon={f.icon} color={f.color} size={38} solid />
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {can("enterprises", "write") || can("finance", "write") || can("employment", "write") ? (
            <Text style={styles.fieldHint}>Enterprise, loan and job: open the participant they are for.</Text>
          ) : null}
        </>
      ) : null}

      {/* Numbers */}
      {isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} width="31.5%" height={64} borderRadius={radius.md} />
          ))}
        </View>
      ) : isError ? (
        <EmptyState
          title="Could not load the overview"
          message={error instanceof Error ? error.message : "Pull down to try again."}
        />
      ) : data ? (
        <>
          <SectionTitle>Programme</SectionTitle>
          <View style={styles.grid}>
            {numbers(data).map((n) => {
              const t = topics[n.topic];
              return (
                <Pressable
                  key={n.label}
                  accessibilityRole={n.go ? "button" : undefined}
                  disabled={!n.go}
                  onPress={n.go}
                  style={({ pressed }) => [styles.stat, { borderBottomColor: t.color }, pressed && styles.pressed]}
                >
                  <View style={styles.statTop}>
                    <View style={styles.statFigure}>
                      <IconBox icon={t.icon} color={t.color} size={24} solid />
                      <Text style={[styles.statValue, { color: t.color }]}>{n.value.toLocaleString()}</Text>
                    </View>
                    {n.go ? <ChevronRight size={14} color={colors.faint} /> : null}
                  </View>
                  <Text style={styles.statLabel} numberOfLines={1}>
                    {n.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Recent activity */}
          {recent.length > 0 ? (
            <>
              <SectionTitle>Recently registered</SectionTitle>
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
                        {
                          backgroundColor: p.sex === "female" ? topics.female.tint : topics.participants.tint,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          {
                            color: p.sex === "female" ? topics.female.color : topics.participants.color,
                          },
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
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  flex: { flex: 1 },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  greeting: { fontSize: 13, color: colors.onNavyMuted },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  date: { fontSize: 12, color: colors.onNavyMuted },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  roleText: { fontSize: 12, color: colors.white, fontWeight: "600" },
  syncLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    marginTop: 2,
  },
  syncText: { fontSize: 12, color: colors.onNavyMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
  },
  sectionBar: { width: 4, height: 14, borderRadius: 2, backgroundColor: colors.primary },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  fieldHint: { fontSize: 12, color: colors.muted },
  pressed: { opacity: 0.85 },
  tile: {
    width: "31.5%",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderBottomWidth: 3,
    ...shadow,
  },
  tileLabel: { fontSize: 12, fontWeight: "600", color: colors.text },
  stat: {
    width: "31.5%",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderBottomWidth: 3,
    ...shadow,
  },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statFigure: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  statLabel: { fontSize: 11, fontWeight: "600", color: colors.secondary, marginTop: 4 },
  listCard: { padding: 0 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 56,
  },
  activityDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  activityName: { fontSize: 14, fontWeight: "600", color: colors.text },
  activityMeta: { fontSize: 12, color: colors.muted },
  regions: { gap: spacing.md },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { width: 90, fontSize: 12, color: colors.secondary },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#EEF2F7",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  barValue: {
    width: 32,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
});
