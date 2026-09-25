import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, ShieldCheck } from "lucide-react-native";
import { getParticipantDetail } from "@/lib/data";
import { initialsOf } from "@/lib/user";
import { Card, EmptyState, ListSkeleton, StatusPill, Text } from "@/components/ui";
import { colors, spacing, topics } from "@/theme";

const capital = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : null);

export default function ParticipantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["participant-detail", id],
    queryFn: () => getParticipantDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load the participant"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  const { participant, enterprise, trainings } = data;
  const female = participant.sex === "female";
  const t = female ? topics.female : topics.participants;
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
      <Card style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: t.tint }]}>
          <Text style={[styles.avatarText, { color: t.color }]}>{initialsOf(participant.full_name)}</Text>
        </View>
        <Text style={styles.name}>{participant.full_name}</Text>
        <Text style={styles.id}>{participant.participant_id}</Text>
        <View style={styles.pills}>
          <StatusPill label={participant.status} tone={participant.status === "active" ? "green" : "grey"} />
          {participant.is_youth ? <StatusPill label="Youth" tone="blue" /> : null}
          {participant.disability ? (
            <StatusPill label={participant.disability_type ?? "Disability"} tone="violet" />
          ) : null}
          {participant.consent_given ? (
            <StatusPill label="Consent on file" tone="green" icon={ShieldCheck} />
          ) : (
            <StatusPill label="No consent" tone="red" icon={CircleAlert} outline />
          )}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Row label="Sex" value={capital(participant.sex)} />
        <Row label="Date of birth" value={participant.date_of_birth} />
        <Row label="Phone" value={participant.phone} />
        <Row label="Education" value={capital(participant.education_level)} />
        <Row label="Location" value={location} last />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Enterprise</Text>
        {enterprise ? (
          <>
            <Text style={styles.value}>{enterprise.enterprise_name}</Text>
            <Text style={styles.meta}>
              {[enterprise.enterprise_type, enterprise.sector, enterprise.status]
                .filter(Boolean)
                .map((x) => capital(String(x)))
                .join(" · ")}
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
          trainings.map((row, i) => (
            <View key={row.id} style={[styles.trainingRow, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.value}>{row.training_events?.title ?? "Training"}</Text>
                <Text style={styles.meta}>{row.attendance_date}</Text>
              </View>
              {/* The attendance list carries no status of its own: a row means the person attended. */}
              <StatusPill label={row.status ?? "present"} tone={!row.status || row.status === "present" ? "green" : "grey"} />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.divider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  header: { alignItems: "center", gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  avatarText: { fontSize: 22, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  id: { fontSize: 13, color: colors.muted },
  pills: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", justifyContent: "center", marginTop: spacing.sm },
  card: { gap: spacing.sm },
  meta: { fontSize: 13, color: colors.muted },
  value: { fontSize: 15, color: colors.text, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 10, minHeight: 44 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 14, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  trainingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
});
