import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react-native";
import { getConcern } from "@/lib/data";
import { DetailCard, DetailHeader, DetailText, detailStyles } from "@/components/detail-card";
import { shortDate } from "@/components/register-rows";
import { Card, EmptyState, ListSkeleton, StatusPill, Text } from "@/components/ui";
import { colors, spacing, topics, type PillTone } from "@/theme";

const words = (s?: string | null) => {
  const t = (s ?? "").replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
};

const TONE: Record<string, PillTone> = { open: "red", investigating: "amber", referred: "violet", closed: "grey" };

/**
 * One safeguarding concern, read only. It is read from the server each time
 * and never kept on the phone; the server decides what this person may see.
 */
export default function ConcernDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const concern = useQuery({ queryKey: ["concern", id], queryFn: () => getConcern(id), enabled: !!id });

  if (concern.isLoading) return <ListSkeleton rows={3} />;
  const c = concern.data;
  if (concern.isError || !c) {
    return (
      <EmptyState
        title="Could not load this concern"
        message={concern.error instanceof Error ? concern.error.message : "Check your connection and try again."}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={detailStyles.container}
      refreshControl={<RefreshControl refreshing={concern.isRefetching} onRefresh={() => void concern.refetch()} tintColor={colors.primary} />}
    >
      <DetailHeader
        icon={ShieldAlert}
        color={topics.safeguarding.color}
        tint={topics.safeguarding.tint}
        title={words(c.case_type) ?? "Concern"}
      >
        <StatusPill label={words(c.status) ?? c.status} tone={TONE[c.status] ?? "grey"} />
      </DetailHeader>

      <Card style={styles.notice}>
        <Text style={styles.noticeText}>Confidential. Do not share this concern, and do not name the person it is about anywhere else.</Text>
      </Card>

      <DetailCard
        title="Details"
        rows={[
          { label: "Reported", value: shortDate(c.reported_date ?? c.created_at) ?? null },
          { label: "Incident date", value: shortDate(c.incident_date) ?? null },
        ]}
      >
        <DetailText label="Description" text={c.description} />
      </DetailCard>

      {c.confidential_notes ? (
        <DetailCard title="Confidential notes">
          <DetailText label="Safeguarding staff only" text={c.confidential_notes} />
        </DetailCard>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.dangerSoft, padding: spacing.md },
  noticeText: { fontSize: 13, color: colors.danger, fontWeight: "600" },
});
