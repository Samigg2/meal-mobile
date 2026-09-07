import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getParticipantDetail } from "@/lib/data";
import { Badge, Card, EmptyState, Loading } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

export default function ParticipantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["participant-detail", id],
    queryFn: () => getParticipantDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load the participant"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  const { participant, enterprise, trainings } = data;
  const location = [participant.kebele, participant.woreda, participant.zone, participant.region]
    .filter(Boolean)
    .join(", ");

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />
      }
    >
      <Card style={styles.card}>
        <Text style={styles.name}>{participant.full_name}</Text>
        <Text style={styles.meta}>{participant.participant_id}</Text>
        <View style={styles.badgeRow}>
          <Badge text={participant.status} tone={participant.status === "active" ? "success" : "neutral"} />
          {participant.is_youth ? <Badge text="Youth" /> : null}
          {participant.disability ? <Badge text={participant.disability_type ?? "Disability"} tone="warning" /> : null}
          <Badge
            text={participant.consent_given ? "Consent on file" : "No consent"}
            tone={participant.consent_given ? "success" : "danger"}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Row label="Sex" value={participant.sex} />
        <Row label="Date of birth" value={participant.date_of_birth} />
        <Row label="Phone" value={participant.phone} />
        <Row label="Education" value={participant.education_level} />
        <Row label="Location" value={location} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Enterprise</Text>
        {enterprise ? (
          <>
            <Text style={styles.value}>{enterprise.enterprise_name}</Text>
            <Text style={styles.meta}>
              {[enterprise.enterprise_type, enterprise.sector, enterprise.status].filter(Boolean).join(" · ")}
            </Text>
          </>
        ) : (
          <Text style={styles.meta}>Not linked to an enterprise.</Text>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Training history</Text>
        {trainings.length === 0 ? (
          <Text style={styles.meta}>No training attendance recorded.</Text>
        ) : (
          trainings.map((row) => (
            <View key={row.id} style={styles.trainingRow}>
              <View style={styles.flex}>
                <Text style={styles.value}>{row.training_events?.title ?? "Training"}</Text>
                <Text style={styles.meta}>{row.attendance_date}</Text>
              </View>
              <Badge text={row.status} tone={row.status === "present" ? "success" : "neutral"} />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  card: { gap: spacing.sm },
  name: { fontSize: 19, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted },
  value: { fontSize: 14, color: colors.text, fontWeight: "500", textTransform: "capitalize" },
  badgeRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginTop: spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 13, color: colors.text, fontWeight: "500", flexShrink: 1, textAlign: "right", textTransform: "capitalize" },
  trainingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
