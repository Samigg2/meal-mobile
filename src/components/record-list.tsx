import { useEffect, useState, type ComponentProps } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Page } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { updatedLabel, useListCopy, useLocalPages, type ListCopy, type Where } from "@/lib/offline-lists";
import { Chips, EmptyState, ListSkeleton, PersonRow, SearchBar, Text } from "@/components/ui";
import { colors, spacing, topics, type TopicName } from "@/theme";

const PAGE_SIZE = 30;

type Row = Omit<ComponentProps<typeof PersonRow>, "last"> & { id: string };

/** A filter chip: what the server is asked for, and the same filter on the saved copy offline (false: not offline). */
export interface ListChip {
  label: string;
  value: string;
  query?: Record<string, string>;
  where?: Where | false;
}

/**
 * A register (enterprises, jobs, loans) as a chat-style list: search, filter chips,
 * then rows searched, filtered and paged by the server like the Participants tab.
 */
export function RecordList<T>({
  queryKey,
  fetch,
  toRow,
  topic,
  noun,
  searchHint,
  copy,
  chips,
}: {
  queryKey: string;
  fetch: (q: { q?: string; limit: number; offset: number; withTotal: boolean } & Record<string, string | number | boolean | undefined>) => Promise<Page<T>>;
  toRow: (row: T) => Row;
  topic: TopicName;
  /** Singular and plural, for the count line. */
  noun: [string, string];
  searchHint: string;
  /** The complete copy kept on the phone; it knows the words a search looks in. */
  copy: ListCopy<T>;
  /** The first chip is "All". */
  chips?: ListChip[];
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [chip, setChip] = useState(chips?.[0]?.value ?? "");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const current = chips?.find((c) => c.value === chip);

  const { data, isLoading, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: [queryKey, "page", term, chip],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        fetch({
          ...current?.query,
          q: term || undefined,
          limit: PAGE_SIZE,
          offset: pageParam,
          withTotal: pageParam === 0,
        }),
      getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
    });
  // No connection: the saved copy of the whole register, searched here on the phone.
  const offline = isError && error instanceof ApiError && error.isNetworkError;
  const saved = useListCopy(copy, !!data && !isError);
  const showSaved = offline && saved.hasCopy;
  // Offline: pages of the saved copy, searched and filtered in SQLite.
  const local = useLocalPages(copy, { term, where: current?.where }, PAGE_SIZE, showSaved);
  const pages = showSaved ? local : { data, hasNextPage, isFetchingNextPage, fetchNextPage };
  const rows = (pages.data?.pages.flatMap((p) => p.rows) ?? []).map(toRow);
  const total = pages.data?.pages[0]?.total ?? rows.length;
  const capped = showSaved && !!local.data?.pages[0]?.capped;
  const t = topics[topic];
  const filtered = !!term || (!!chips && chip !== chips[0]?.value);

  if (isError && !showSaved) {
    return (
      <EmptyState
        title={`Could not load ${noun[1]}`}
        message={
          offline
            ? `No connection, and the ${noun[1]} are not saved on this phone yet. Connect once, or use Download for offline on the Sync screen.`
            : error instanceof Error
              ? error.message
              : "Check your connection and try again."
        }
      />
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={searchHint} />
        {chips ? <Chips options={chips} value={chip} onChange={setChip} /> : null}
        {showSaved ? (
          <Text style={styles.offline}>
            Offline — the {noun[1]} saved on this phone, updated {updatedLabel(saved.savedAt)}.
          </Text>
        ) : null}
        {!isLoading || showSaved ? (
          <Text style={styles.count}>
            {total.toLocaleString()}
            {capped ? "+" : ""} {total === 1 ? noun[0] : noun[1]}
            {filtered ? " found" : ""}
          </Text>
        ) : null}
      </View>
      {isLoading && !showSaved ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
          }}
          ListFooterComponent={
            pages.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={t.icon}
              color={t.color}
              tint={t.tint}
              title={filtered ? "No matches" : `No ${noun[1]} yet`}
              message={filtered ? "Try a different search or chip." : "Add one from the participant it belongs to."}
            />
          }
          renderItem={({ item, index }) => <PersonRow {...item} last={index === rows.length - 1} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.sm },
  count: { fontSize: 13, color: colors.muted },
  offline: { fontSize: 12, fontWeight: "600", color: colors.warning },
  list: { paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
});
