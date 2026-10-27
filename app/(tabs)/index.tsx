import { useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  ChevronLeft,
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
import { Card, EmptyState, IconBox, PersonRow, Skeleton, Text } from "@/components/ui";
import { colors, radius, shadow, spacing, topics, type TopicName } from "@/theme";

/** How many task tiles show before More (two rows of three, More being the sixth). */
const FIRST = 5;
/** Rows each Home tab shows before See all. */
const NEWEST = 8;

type Task = { label: string; icon: LucideIcon; topic: TopicName; go: () => void };
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
  const tabsRef = useRef<ScrollView>(null);
  const [tabsAtEnd, setTabsAtEnd] = useState(false);

  // Every task the role may do, most used first; a role sees only its own.
  const tasks: Task[] = [
    can("participants", "write") && { label: "Register", icon: UserPlus, topic: "participants", go: () => router.push("/participants/new") },
    can("surveys") && { label: "Survey", icon: ClipboardList, topic: "surveys", go: () => router.navigate("/(tabs)/surveys") },
    can("training", "write") && { label: "Attendance", icon: GraduationCap, topic: "trainings", go: () => router.push("/training") },
    can("safeguarding", "write") && { label: "Concern", icon: ShieldAlert, topic: "safeguarding", go: () => router.push("/safeguarding/new") },
    can("feedback", "write") && { label: "Feedback", icon: MessageSquareText, topic: "disability", go: () => router.push("/feedback/new") },
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

  // The lists under the tiles, each only for those who may see it; the arrow scrolls to the rest.
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
      refreshControl={
        <RefreshControl refreshing={rows.isRefetching} onRefresh={() => void rows.refetch()} tintColor={colors.primary} />
      }
    >
      {/* Greeting and sync, one line each */}
      <Pressable accessibilityRole="button" onPress={() => router.push("/sync")} style={styles.hero}>
        <Text style={styles.hello} numberOfLines={1}>
          {greeting()} {displayName(profile, user?.email).split(" ")[0]}
        </Text>
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
              go: () => setMore((m) => !m),
            }}
          />
        ) : null}
        {more ? rest.map((t) => <Tile key={t.label} task={t} />) : null}
      </View>

      {lists.length > 0 ? (
        <Card style={styles.listCard}>
          <View style={styles.tabsRow}>
            <ScrollView
              ref={tabsRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
              scrollEventThrottle={64}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                setTabsAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 8);
              }}
            >
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
            {lists.length > 3 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tabsAtEnd ? "Back to the first lists" : "More lists"}
                onPress={() =>
                  tabsAtEnd ? tabsRef.current?.scrollTo({ x: 0, animated: true }) : tabsRef.current?.scrollToEnd({ animated: true })
                }
                style={styles.arrow}
              >
                {tabsAtEnd ? (
                  <ChevronLeft size={18} color={colors.secondary} />
                ) : (
                  <ChevronRight size={18} color={colors.secondary} />
                )}
              </Pressable>
            ) : null}
          </View>

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
        </Card>
      ) : null}
    </ScrollView>
  );
}

/** A task tile like the web dashboard cards: solid icon circle, name, coloured bottom line. */
function Tile({ task }: { task: Task }) {
  const t = topics[task.topic];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={task.go}
      style={({ pressed }) => [styles.tile, { borderBottomColor: t.color }, pressed && styles.pressed]}
    >
      <IconBox icon={task.icon} color={t.color} size={40} solid />
      <Text style={styles.tileLabel} numberOfLines={1}>
        {task.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
  },
  hello: { fontSize: 17, fontWeight: "700", color: colors.white, letterSpacing: -0.2 },
  syncLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  syncText: { fontSize: 12, color: colors.onNavyMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pressed: { opacity: 0.85 },
  tile: {
    width: "31.8%",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderBottomWidth: 3,
    ...shadow,
  },
  tileLabel: { fontSize: 12, fontWeight: "600", color: colors.text },
  listCard: { padding: 0, overflow: "hidden", marginTop: spacing.xs },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabs: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tab: { paddingHorizontal: 12, minHeight: 34, borderRadius: 8, justifyContent: "center" },
  tabOn: { backgroundColor: colors.primarySoft },
  tabText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  tabTextOn: { color: colors.primaryDark },
  arrow: {
    width: 40,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
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
