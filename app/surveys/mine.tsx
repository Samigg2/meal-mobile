import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react-native";
import { listMyResponses } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/components/date-picker";
import { Button, Card, EmptyState, ListSkeleton, StatusPill, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "grey" }> = {
  submitted: { label: "Waiting for review", tone: "amber" },
  draft: { label: "Draft", tone: "grey" },
  rejected: { label: "Sent back", tone: "red" },
  validated: { label: "Verified", tone: "green" },
};

/**
 * The responses to one survey this officer collected. One that waits for
 * review or was sent back can be changed; a verified one is counted evidence
 * and only M&E can reopen it (decision 2026-10-20). Online only: other
 * people's answers are never kept on the phone, and neither are these.
 */
export default function MyResponses() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-responses", id],
    queryFn: () => listMyResponses(id, user?.id ?? ""),
    enabled: !!user,
  });

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load your responses"
        message={error instanceof Error ? error.message : "This list needs a connection."}
      />
    );
  }
  if (data.length === 0) {
    return <EmptyState title="No responses yet" message="Responses you send for this survey appear here." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {data.map((r) => {
        const status = STATUS[r.status] ?? { label: r.status, tone: "grey" as const };
        return (
          <Card key={r.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.title}>{r.respondent_name || "Anonymous respondent"}</Text>
                <Text style={styles.meta}>
                  Collected {formatDate(r.collected_on.slice(0, 10))}
                  {r.region ? ` · ${r.region}` : ""}
                </Text>
              </View>
              <StatusPill label={status.label} tone={status.tone} />
            </View>
            {r.status === "rejected" && r.rejection_reason ? (
              <Text style={styles.reason}>Reason: {r.rejection_reason}</Text>
            ) : null}
            {r.status === "validated" ? (
              <Text style={styles.meta}>Verified and counted. Ask M&E to reopen it if something is wrong.</Text>
            ) : (
              <Button
                title="Change"
                icon={Pencil}
                variant="outline"
                onPress={() => router.push({ pathname: "/surveys/[id]", params: { id, response: r.id } })}
              />
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.muted },
  reason: { fontSize: 13, color: colors.danger },
});
