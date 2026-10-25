import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRight, CircleAlert, UserPlus, UsersRound, X } from "lucide-react-native";
import { listParticipantsPage, participantsCopy } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { updatedLabel, useListCopy } from "@/lib/offline-lists";
import { useAuth } from "@/lib/auth";
import { initialsOf } from "@/lib/user";
import {
  BottomSheet,
  Button,
  ChoiceRow,
  EmptyState,
  FAB,
  ListSkeleton,
  SearchBar,
  StatusPill,
  Text,
} from "@/components/ui";
import { colors, radius, spacing, topics } from "@/theme";
import { useSettings } from "@/lib/reference";

type Filters = {
  status?: "active" | "inactive";
  sex?: "male" | "female";
  youth?: "yes" | "no";
  disability?: "yes" | "no";
  consent?: "yes" | "no";
};

const FILTER_LABELS: Record<keyof Filters, string> = {
  status: "Status",
  sex: "Sex",
  youth: "Youth",
  disability: "Disability",
  consent: "Consent",
};

/** Participants fetched per page as the list scrolls. */
const PAGE_SIZE = 30;

const yesNo = [
  { label: "Yes", value: "yes" as const },
  { label: "No", value: "no" as const },
];

export default function Participants() {
  const settings = useSettings();
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [sheet, setSheet] = useState(false);
  // Wait for a pause in typing before asking the server.
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Searched, filtered and paged by the server, a page at a time as the list
  // scrolls — the whole register is never downloaded to the phone.
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["participants", "page", term, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listParticipantsPage({
        q: term || undefined,
        status: filters.status,
        sex: filters.sex,
        is_youth: filters.youth,
        disability: filters.disability,
        consent: filters.consent,
        limit: PAGE_SIZE,
        offset: pageParam,
        withTotal: pageParam === 0,
      }),
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
  });
  // No connection: the saved copy of the whole register, searched and filtered here on the phone.
  const offline = isError && error instanceof ApiError && error.isNetworkError;
  const saved = useListCopy(participantsCopy, !!data && !isError);
  const showSaved = offline && !!saved.rows;
  const words = term.toLowerCase();
  const yes = (flag: boolean | null | undefined, want?: string) => !want || (want === "yes") === !!flag;
  const filtered = showSaved
    ? (saved.rows ?? []).filter(
        (r) =>
          (!words || `${r.full_name} ${r.participant_id} ${r.phone ?? ""}`.toLowerCase().includes(words)) &&
          (!filters.status || r.status === filters.status) &&
          (!filters.sex || r.sex === filters.sex) &&
          yes(r.is_youth, filters.youth) &&
          yes(r.disability, filters.disability) &&
          yes(r.consent_given, filters.consent),
      )
    : (data?.pages.flatMap((p) => p.rows) ?? []);
  const total = showSaved ? filtered.length : (data?.pages[0]?.total ?? filtered.length);

  const activeFilters = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k]);

  const canRegister = can("participants", "write");

  if (isError && !showSaved) {
    return (
      <EmptyState
        title="Could not load participants"
        message={
          offline
            ? "No connection, and the participants are not saved on this phone yet. Connect once, or use Download for offline on the Sync screen."
            : error instanceof Error
              ? error.message
              : "Check your connection and try again."
        }
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, ID or phone"
          onFilterPress={() => setSheet(true)}
          filterCount={activeFilters.length}
        />
        {activeFilters.length > 0 ? (
          <View style={styles.activeRow}>
            {activeFilters.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${FILTER_LABELS[k]} filter`}
                onPress={() => setFilters((f) => ({ ...f, [k]: undefined }))}
                style={styles.activeChip}
              >
                <Text style={styles.activeChipText}>
                  {FILTER_LABELS[k]}: {filters[k]}
                </Text>
                <X size={13} color={colors.primary} strokeWidth={2.6} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {showSaved ? (
          <Text style={styles.offline}>Offline — the participants saved on this phone, updated {updatedLabel(saved.savedAt)}.</Text>
        ) : null}
        {!isLoading || showSaved ? (
          <Text style={styles.count}>
            {total.toLocaleString()} participant{total === 1 ? "" : "s"}
            {term || activeFilters.length ? " found" : ""}
          </Text>
        ) : null}
      </View>

      {isLoading && !showSaved ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            search || activeFilters.length ? (
              <EmptyState
                icon={UsersRound}
                title="No matches"
                message="Try a different search term or clear the filters."
                action={
                  <Button
                    title="Clear filters"
                    variant="outline"
                    onPress={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  />
                }
              />
            ) : (
              <EmptyState
                icon={UsersRound}
                color={topics.participants.color}
                tint={topics.participants.tint}
                title="No participants yet"
                message="Register the first participant to start the register."
                action={
                  canRegister ? (
                    <Button title="Register participant" icon={UserPlus} onPress={() => router.push("/participants/new")} />
                  ) : undefined
                }
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const female = item.sex === "female";
            const t = female ? topics.female : topics.participants;
            const pills: { key: string; node: React.ReactNode }[] = [
              {
                key: "status",
                node: (
                  <StatusPill
                    label={item.status}
                    tone={item.status === "active" ? "green" : "grey"}
                  />
                ),
              },
              ...(!item.consent_given
                ? [
                    {
                      key: "consent",
                      node: <StatusPill label="No consent" tone="red" icon={CircleAlert} outline />,
                    },
                  ]
                : []),
              ...(item.is_youth ? [{ key: "youth", node: <StatusPill label="Youth" tone="blue" /> }] : []),
              ...(item.disability
                ? [{ key: "disability", node: <StatusPill label="Disability" tone="violet" /> }]
                : []),
            ];
            const shown = pills.slice(0, 3);
            const more = pills.length - shown.length;
            const place = [item.woreda, item.region].filter(Boolean).join(", ");
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/participants/${item.id}`)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
              >
                <View style={[styles.avatar, { backgroundColor: t.tint }]}>
                  <Text style={[styles.avatarText, { color: t.color }]}>{initialsOf(item.full_name)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.participant_id}
                    {place ? ` · ${place}` : ""}
                  </Text>
                  <View style={styles.pills}>
                    {shown.map((p) => (
                      <View key={p.key}>{p.node}</View>
                    ))}
                    {more > 0 ? <Text style={styles.more}>+{more}</Text> : null}
                  </View>
                </View>
                <ChevronRight size={18} color={colors.faint} />
              </Pressable>
            );
          }}
        />
      )}

      {canRegister ? <FAB label="Register" onPress={() => router.push("/participants/new")} icon={UserPlus} /> : null}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Filter participants">
        <View style={styles.sheetBody}>
          <ChoiceRow
            label="Status"
            value={filters.status}
            options={[
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            onChange={(v) => setFilters((f) => ({ ...f, status: f.status === v ? undefined : v }))}
          />
          <ChoiceRow
            label="Sex"
            value={filters.sex}
            options={[
              { label: "Female", value: "female" },
              { label: "Male", value: "male" },
            ]}
            onChange={(v) => setFilters((f) => ({ ...f, sex: f.sex === v ? undefined : v }))}
          />
          <ChoiceRow
            label={`Youth (${settings.youth_min_age}–${settings.youth_max_age})`}
            value={filters.youth}
            options={yesNo}
            onChange={(v) => setFilters((f) => ({ ...f, youth: f.youth === v ? undefined : v }))}
          />
          <ChoiceRow
            label="With disability"
            value={filters.disability}
            options={yesNo}
            onChange={(v) => setFilters((f) => ({ ...f, disability: f.disability === v ? undefined : v }))}
          />
          <ChoiceRow
            label="Consent on file"
            value={filters.consent}
            options={yesNo}
            onChange={(v) => setFilters((f) => ({ ...f, consent: f.consent === v ? undefined : v }))}
          />
          <View style={styles.sheetActions}>
            <View style={styles.flex}>
              <Button title="Clear" variant="outline" onPress={() => setFilters({})} />
            </View>
            <View style={styles.flex}>
              <Button title="Show results" onPress={() => setSheet(false)} />
            </View>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  activeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 32,
  },
  activeChipText: { fontSize: 12, fontWeight: "600", color: colors.primary, textTransform: "capitalize" },
  count: { fontSize: 13, color: colors.muted },
  offline: { fontSize: 12, fontWeight: "600", color: colors.warning },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 96, flexGrow: 1 },
  separator: { height: spacing.md },
  footer: { paddingVertical: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontWeight: "700" },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 1 },
  pills: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm, flexWrap: "wrap" },
  more: { fontSize: 12, fontWeight: "700", color: colors.muted },
  sheetBody: { gap: spacing.lg, paddingBottom: spacing.md },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
