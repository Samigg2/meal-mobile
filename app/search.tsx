import { useEffect, useState, type ComponentProps } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Search as SearchIcon } from "lucide-react-native";
import {
  enterprisesCopy,
  listEnterprisesPage,
  listParticipantsPage,
  listPlacementsPage,
  participantsCopy,
  placementsCopy,
} from "@/lib/data";
import { ApiError } from "@/lib/api";
import type { ListCopy } from "@/lib/offline-lists";
import { useAuth } from "@/lib/auth";
import { enterpriseRow, jobRow, participantRow } from "@/components/register-rows";
import { EmptyState, Loading, PersonRow, SearchBar, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

const LIMIT = 5;

/** The first matches from the server; offline, from the copy saved on the phone (one SQLite query). */
async function find<T>(
  fetch: (q: { q: string; limit: number; offset: number }) => Promise<{ rows: T[] }>,
  copy: ListCopy<T>,
  term: string,
): Promise<T[]> {
  try {
    return (await fetch({ q: term, limit: LIMIT, offset: 0 })).rows;
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) {
      return (await copy.query({ term, limit: LIMIT })).rows;
    }
    throw error;
  }
}

/** One search from the header: participants, enterprises and jobs, each as far as the role may see. */
export default function Search() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const ready = term.length >= 2;
  const people = can("participants");

  const participants = useQuery({
    queryKey: ["search", "participants", term],
    enabled: ready && people,
    queryFn: () => find(listParticipantsPage, participantsCopy, term),
  });
  const enterprises = useQuery({
    queryKey: ["search", "enterprises", term],
    enabled: ready && can("enterprises"),
    queryFn: () => find(listEnterprisesPage, enterprisesCopy, term),
  });
  const jobs = useQuery({
    queryKey: ["search", "jobs", term],
    enabled: ready && can("employment"),
    queryFn: () => find(listPlacementsPage, placementsCopy, term),
  });

  const open = (id?: string | null) => (id && people ? () => router.push(`/participants/${id}`) : undefined);
  const groups: { title: string; rows: (ComponentProps<typeof PersonRow> & { id: string })[] }[] = [
    { title: "Participants", rows: (participants.data ?? []).map((p) => participantRow(p, open(p.id))) },
    {
      title: "Enterprises",
      rows: (enterprises.data ?? []).map((e) =>
        enterpriseRow(e, () =>
          router.push({ pathname: "/enterprises/[id]", params: { id: e.id, ownerName: e.owner_name ?? "" } }),
        ),
      ),
    },
    { title: "Jobs", rows: (jobs.data ?? []).map((j) => jobRow(j, open(j.participant_id))) },
  ].filter((g) => g.rows.length > 0);
  const loading = participants.isFetching || enterprises.isFetching || jobs.isFetching;

  return (
    <View style={styles.page}>
      <View style={styles.bar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Name, ID, phone, employer…" autoFocus />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {!ready ? (
          <EmptyState icon={SearchIcon} title="Search" message="Type at least two letters." />
        ) : loading && groups.length === 0 ? (
          <Loading label="Searching…" />
        ) : groups.length === 0 ? (
          <EmptyState icon={SearchIcon} title="No matches" message="Try a different name, ID or phone." />
        ) : (
          groups.map((g) => (
            <View key={g.title}>
              <Text style={styles.group}>{g.title}</Text>
              {g.rows.map((r, i) => (
                <PersonRow key={r.id} {...r} last={i === g.rows.length - 1} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  bar: { padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingBottom: spacing.xxl, flexGrow: 1 },
  group: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
});
