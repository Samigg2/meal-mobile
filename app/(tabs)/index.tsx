import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  ClipboardList,
  CloudUpload,
  GraduationCap,
  HandCoins,
  LayoutGrid,
  MessageSquareText,
  ShieldAlert,
  Shield,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react-native";
import {
  enterprisesCopy,
  listActivities,
  listConcernsPage,
  listEnterprisesPage,
  listFeedbackPage,
  listLoansPage,
  listParticipantsPage,
  listPlacementsPage,
  listTrainingPage,
  loansCopy,
  newestOf,
  participantsCopy,
  placementsCopy,
} from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { useQueue } from "@/lib/net";
import { displayName, greeting } from "@/lib/user";
import {
  activityRow,
  concernRow,
  enterpriseRow,
  feedbackRow,
  jobRow,
  loanRow,
  participantRow,
  trainingRow,
} from "@/components/register-rows";
import { EmptyState, IconBox, PersonRow, Skeleton, Text } from "@/components/ui";
import { colors, radius, shadow, spacing, topics, type TopicName } from "@/theme";

/** How many task tiles show before More (two rows of three, More being the sixth). */
const FIRST = 5;
/** Rows each Home tab shows before See all. */
const NEWEST = 8;

/** `color` is the tile's own circle colour (15Beforeend); without it the topic colour is used. */
type Task = { label: string; icon: LucideIcon; topic: TopicName; color?: string; go: () => void };

/** The first five tiles' colours, as in the 15Beforeend design; More is sky. */
const TILE = {
  register: "#0051D5",
  survey: "#F59E0B",
  attendance: "#10B981",
  concern: "#E11D48",
  feedback: "#4F46E5",
  more: "#0284C7",
};
type ListKey = "participants" | "enterprises" | "jobs" | "loans" | "feedback" | "concerns" | "attendance" | "workplan";

const timeAgo = (ms: number) => {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

export default function Home() {
  const router = useRouter();
  const { can, profile, user } = useAuth();
  const queued = useQueue();
  const [more, setMore] = useState(false);

  // Every task the role may do, most used first; a role sees only its own.
  const tasks: Task[] = [
    can("participants", "write") && { label: "Register", icon: UserPlus, topic: "participants", color: TILE.register, go: () => router.push("/participants/new") },
    can("surveys") && { label: "Survey", icon: ClipboardList, topic: "surveys", color: TILE.survey, go: () => router.navigate("/(tabs)/surveys") },
    can("training", "write") && { label: "Attendance", icon: GraduationCap, topic: "trainings", color: TILE.attendance, go: () => router.push("/training") },
    can("safeguarding", "write") && { label: "Concern", icon: ShieldAlert, topic: "safeguarding", color: TILE.concern, go: () => router.push("/safeguarding/new") },
    can("feedback", "write") && { label: "Feedback", icon: MessageSquareText, topic: "disability", color: TILE.feedback, go: () => router.push("/feedback/new") },
    can("monitoring", "write") && { label: "Work plan", icon: CalendarCheck, topic: "indicators", go: () => router.push("/activities") },
    can("employment") && { label: "Jobs", icon: BriefcaseBusiness, topic: "jobs", go: () => router.push("/employment") },
    can("finance") && { label: "Loans", icon: HandCoins, topic: "loans", go: () => router.push("/finance") },
    { label: "Offline queue", icon: CloudUpload, topic: "indicators", go: () => router.push("/sync") },
    { label: "Notifications", icon: Bell, topic: "participants", go: () => router.push("/notifications") },
    { label: "Your access", icon: ShieldCheck, topic: "enterprises", go: () => router.push("/access") },
  ].filter((t): t is Task => !!t);
  const folded = tasks.length > FIRST + 1;
  const first = folded ? tasks.slice(0, FIRST) : tasks;
  const rest = folded ? tasks.slice(FIRST) : [];

  // The lists under the tiles, each only for those who may see it.
  const lists = (
    [
      can("participants") && { key: "participants", label: "Participants" },
      can("enterprises") && { key: "enterprises", label: "Enterprises" },
      can("employment") && { key: "jobs", label: "Employment" },
      can("finance") && { key: "loans", label: "Loans" },
      can("feedback") && { key: "feedback", label: "Feedback" },
      can("safeguarding") && { key: "concerns", label: "Concerns" },
      can("training") && { key: "attendance", label: "Attendance" },
      can("monitoring") && { key: "workplan", label: "Work plan" },
    ] as const
  ).filter((l): l is { key: ListKey; label: string } => !!l);
  const [tab, setTab] = useState<ListKey | undefined>(lists[0]?.key);
  const active = lists.find((l) => l.key === tab)?.key ?? lists[0]?.key;

  const person = (id?: string | null) => (id && can("participants") ? () => router.push(`/participants/${id}`) : undefined);
  const rows = useQuery({
    queryKey: ["home", active],
    enabled: !!active,
    queryFn: async () => {
      switch (active) {
        case "participants":
          return (await newestOf(listParticipantsPage, participantsCopy, NEWEST)).map((p) => participantRow(p, person(p.id)));
        case "enterprises":
          return (await newestOf(listEnterprisesPage, enterprisesCopy, NEWEST)).map((e) =>
            enterpriseRow(e, () =>
              router.push({ pathname: "/enterprises/[id]", params: { id: e.id, ownerName: e.owner_name ?? "" } }),
            ),
          );
        case "jobs":
          return (await newestOf(listPlacementsPage, placementsCopy, NEWEST)).map((j) => jobRow(j, person(j.participant_id)));
        case "loans":
          return (await newestOf(listLoansPage, loansCopy, NEWEST)).map((l) =>
            loanRow(l, person(l.participant_id ?? l.enterprises?.owner_participant_id)),
          );
        case "feedback":
          return (await newestOf(listFeedbackPage, undefined, NEWEST)).map((f) =>
            feedbackRow(f, () => router.push({ pathname: "/feedback/[id]", params: { id: f.id } })),
          );
        case "concerns":
          return (await newestOf(listConcernsPage, undefined, NEWEST)).map((c) =>
            concernRow(c, () => router.push({ pathname: "/safeguarding/[id]", params: { id: c.id } })),
          );
        case "attendance":
          return (await newestOf(listTrainingPage, undefined, NEWEST)).map((t) =>
            trainingRow(t, can("training", "write") ? () => router.push(`/training/${t.id}`) : undefined),
          );
        case "workplan":
          return (await listActivities())
            .slice(0, NEWEST)
            .map((a) => activityRow(a, can("monitoring", "write") ? () => router.push(`/activities/${a.id}`) : undefined));
        default:
          return [];
      }
    },
  });
  // Where See all goes; Feedback and Concerns have no full list on the phone.
  const seeAll: Partial<Record<ListKey, () => void>> = {
    participants: () => router.navigate("/(tabs)/participants"),
    enterprises: () => router.navigate("/(tabs)/enterprises"),
    jobs: () => router.push("/employment"),
    loans: () => router.push("/finance"),
    attendance: () => router.push("/training"),
    workplan: () => router.push("/activities"),
  };
  const openAll = active ? seeAll[active] : undefined;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      // The list tabs (child 1) stop under the top bar while the rows scroll under them.
      stickyHeaderIndices={lists.length > 0 ? [1] : undefined}
      refreshControl={
        <RefreshControl refreshing={rows.isRefetching} onRefresh={() => void rows.refetch()} tintColor={colors.primary} />
      }
    >
      <View style={styles.top}>
        {/* Greeting and sync, one line each */}
        <Pressable accessibilityRole="button" onPress={() => router.push("/sync")} style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.hello} numberOfLines={1}>
              {greeting()} {displayName(profile, user?.email).split(" ")[0]}
            </Text>
            <Shield size={20} color={colors.onNavyMuted} />
          </View>
          <View style={styles.syncLine}>
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
                  All data synced{rows.dataUpdatedAt ? ` · ${timeAgo(rows.dataUpdatedAt)}` : ""}
                </Text>
              </>
            )}
          </View>
        </Pressable>

        <View style={styles.grid}>
          {first.map((t) => (
            <Tile key={t.label} task={t} />
          ))}
          {folded ? (
            <Tile
              task={{
                label: more ? "Less" : "More",
                icon: more ? ChevronUp : LayoutGrid,
                topic: "participants",
                color: TILE.more,
                go: () => setMore((m) => !m),
              }}
            />
          ) : null}
          {more ? rest.map((t) => <Tile key={t.label} task={t} />) : null}
        </View>
      </View>

      {lists.length > 0 ? (
        <View style={styles.tabsRow}>
          {/* No arrow: the tabs run to the edge, so a cut-off last tab shows there are more. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {lists.map((l) => {
              const on = l.key === active;
              return (
                <Pressable
                  key={l.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setTab(l.key)}
                  style={[styles.tab, on && styles.tabOn]}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {lists.length > 0 ? (
        <View style={styles.listBody}>
          {rows.isLoading ? (
            <View style={styles.skeletons}>
              {Array.from({ length: 4 }, (_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width={46} height={46} borderRadius={23} />
                  <Skeleton width="55%" height={14} />
                </View>
              ))}
            </View>
          ) : rows.isError ? (
            <EmptyState
              title="Could not load the list"
              message={rows.error instanceof Error ? rows.error.message : "Pull down to try again."}
            />
          ) : (rows.data ?? []).length === 0 ? (
            <EmptyState title="Nothing here yet" message="New records show here first." />
          ) : (
            <>
              {(rows.data ?? []).map((r, i, all) => (
                <PersonRow key={r.id} {...r} last={i === all.length - 1 && !openAll} />
              ))}
              {openAll ? (
                <Pressable accessibilityRole="button" onPress={openAll} style={styles.seeAll}>
                  <Text style={styles.seeAllText}>See all</Text>
                  <ChevronRight size={16} color={colors.primary} />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** A task tile: solid colour circle with a white icon, then the name (15Beforeend). */
function Tile({ task }: { task: Task }) {
  const t = topics[task.topic];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={task.go}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <IconBox icon={task.icon} color={task.color ?? t.color} size={48} solid />
      <Text style={styles.tileLabel} numberOfLines={1}>
        {task.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xxl * 2 },
  // Welcome box and tiles keep 16px sides; 1px under the top bar (15Beforeend follow-up).
  top: { paddingHorizontal: spacing.lg, paddingTop: 1, paddingBottom: spacing.md, gap: spacing.md },
  hero: {
    backgroundColor: colors.heroNavy,
    borderRadius: radius.md,
    padding: spacing.lg + 4,
    gap: spacing.sm,
    overflow: "hidden",
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  hello: { flex: 1, fontSize: 18, fontWeight: "600", color: colors.white, letterSpacing: -0.2 },
  // The "All data synced" chip.
  syncLine: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0, 35, 111, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(144, 168, 255, 0.2)",
  },
  syncText: { fontSize: 11, fontWeight: "500", color: "#DCE9FF" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pressed: { opacity: 0.85 },
  tile: {
    width: "31.8%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 110,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    // iOS shadow only: Android's elevation drew a square grey box behind some rounded tiles.
    ...shadow,
    elevation: 0,
  },
  tileLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  // The list runs edge to edge; its tab line is the sticky header.
  listBody: { backgroundColor: colors.card },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // 16px, so the first tab lines up with the welcome box, the tiles and the row icons.
  tabs: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  // A softer corner than a full pill, so its left end sits on the same line as the tiles.
  tab: { paddingHorizontal: 14, minHeight: 32, borderRadius: 10, justifyContent: "center" },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: "500", color: colors.muted },
  tabTextOn: { color: colors.white, fontWeight: "600" },
  skeletons: { padding: spacing.lg, gap: spacing.lg },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  seeAllText: { fontSize: 14, fontWeight: "600", color: colors.primary },
});
