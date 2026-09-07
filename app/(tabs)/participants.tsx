import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { listParticipants } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { Badge, Button, EmptyState, Loading } from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";

export default function Participants() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["participants"],
    queryFn: listParticipants,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((p) =>
      [p.full_name, p.participant_id, p.region, p.woreda, p.phone]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    );
  }, [data, search]);

  if (isLoading) return <Loading />;
  if (isError) {
    return (
      <EmptyState
        title="Could not load participants"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, ID or location"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
        {can("participants", "write") ? (
          <Button title="Register" onPress={() => router.push("/participants/new")} />
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title={search ? "No matches" : "No participants yet"}
            message={search ? "Try a different search term." : "Register the first participant to start the register."}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Link href={`/participants/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.meta}>
                  {item.participant_id}
                  {item.region ? ` · ${[item.woreda, item.region].filter(Boolean).join(", ")}` : ""}
                </Text>
                <View style={styles.badgeRow}>
                  <Badge text={item.status} tone={item.status === "active" ? "success" : "neutral"} />
                  {item.is_youth ? <Badge text="Youth" /> : null}
                  {item.disability ? <Badge text="Disability" tone="warning" /> : null}
                  {!item.consent_given ? <Badge text="No consent" tone="danger" /> : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm, alignItems: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  separator: { height: spacing.sm },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 1 },
  badgeRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm, flexWrap: "wrap" },
});
