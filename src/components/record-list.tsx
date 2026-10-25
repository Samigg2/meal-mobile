import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";
import type { Page } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { updatedLabel, useListCopy, type ListCopy } from "@/lib/offline-lists";
import { EmptyState, IconBox, ListSkeleton, SearchBar, StatusPill, Text } from "@/components/ui";
import { colors, spacing, topics, type PillTone, type TopicName } from "@/theme";

const PAGE_SIZE = 30;

export interface RecordListItem {
  id: string;
  title: string;
  meta: string;
  pill?: { label: string; tone: PillTone };
  /** Where a tap goes; no tap when there is nowhere the user may open. */
  onPress?: () => void;
}

/**
 * A register opened from an Overview tile (enterprises, jobs, loans): searched and
 * paged by the server like the Participants tab. Rows open the person they are for.
 */
export function RecordList<T>({
  queryKey,
  fetch,
  toItem,
  topic,
  noun,
  searchHint,
  copy,
  searchText,
}: {
  queryKey: string;
  fetch: (q: { q?: string; limit: number; offset: number; withTotal: boolean }) => Promise<Page<T>>;
  toItem: (row: T) => RecordListItem;
  topic: TopicName;
  /** Singular and plural, for the count line. */
  noun: [string, string];
  searchHint: string;
  /** The complete copy kept on the phone, and the words a search looks in. */
  copy: ListCopy<T>;
  searchText: (row: T) => string;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: [queryKey, "page", term],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        fetch({
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
  const words = term.toLowerCase();
  const offlineRows = (saved.rows ?? []).filter((r) => !words || searchText(r).toLowerCase().includes(words));
  const showSaved = offline && !!saved.rows;
  const items = (showSaved ? offlineRows : (data?.pages.flatMap((p) => p.rows) ?? [])).map(toItem);
  const total = showSaved ? items.length : (data?.pages[0]?.total ?? items.length);
  const t = topics[topic];

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
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={searchHint} />
        {showSaved ? (
          <Text style={styles.offline}>
            Offline — the {noun[1]} saved on this phone, updated {updatedLabel(saved.savedAt)}.
          </Text>
        ) : null}
        {!isLoading || showSaved ? (
          <Text style={styles.count}>
            {total.toLocaleString()} {total === 1 ? noun[0] : noun[1]}
            {term ? " found" : ""}
          </Text>
        ) : null}
      </View>
      {isLoading && !showSaved ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={items}
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
            <EmptyState
              icon={t.icon}
              color={t.color}
              tint={t.tint}
              title={term ? "No matches" : `No ${noun[1]} yet`}
              message={term ? "Try a different search." : "Add one from the participant it belongs to."}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole={item.onPress ? "button" : undefined}
              disabled={!item.onPress}
              onPress={item.onPress}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
            >
              <IconBox icon={t.icon} color={t.color} tint={t.tint} size={36} />
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.meta}
                </Text>
              </View>
              {item.pill ? <StatusPill label={item.pill.label} tone={item.pill.tone} /> : null}
              {item.onPress ? <ChevronRight size={18} color={colors.faint} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  count: { fontSize: 13, color: colors.muted },
  offline: { fontSize: 12, fontWeight: "600", color: colors.warning },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: { height: spacing.sm },
  footer: { paddingVertical: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
});
