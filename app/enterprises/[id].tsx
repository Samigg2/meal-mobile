import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Store, UserRound } from "lucide-react-native";
import { getEnterprise, getEnterprisePerformance } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { Button, Card, EmptyState, ListSkeleton, StatusPill, Text } from "@/components/ui";
import { REVIEW, shortDate } from "@/components/register-rows";
import { colors, spacing } from "@/theme";
import type { PillTone } from "@/theme";

const capital = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : null);

const VISIT_TONE: Record<string, PillTone> = { submitted: "amber", validated: "green", rejected: "red" };
const VISIT_LABEL: Record<string, string> = { submitted: "Pending", validated: "Verified", rejected: "Sent back" };

/**
 * One enterprise on the phone: who it is, its owner (once, as a link), and its
 * visits (performance records) newest first, with "Record a visit".
 */
export default function EnterpriseDetail() {
  const { id, ownerName } = useLocalSearchParams<{ id: string; ownerName?: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const enterprise = useQuery({ queryKey: ["enterprise", id], queryFn: () => getEnterprise(id), enabled: !!id });
  const visits = useQuery({
    queryKey: ["enterprise-performance", id],
    queryFn: () => getEnterprisePerformance(id),
    enabled: !!id,
  });

  if (enterprise.isLoading) return <ListSkeleton rows={3} />;
  const e = enterprise.data;
  if (enterprise.isError || !e) {
    return (
      <EmptyState
        title="Could not load the enterprise"
        message={enterprise.error instanceof Error ? enterprise.error.message : "Check your connection and try again."}
      />
    );
  }

  const review = REVIEW[e.review_status ?? ""];
  const owner = e.owner_name ?? ownerName ?? null;
  const location = [e.kebele, e.woreda, e.zone, e.region].filter(Boolean).join(", ");
  const workers =
    e.employees_male != null || e.employees_female != null
      ? `${e.employees_male ?? 0} men · ${e.employees_female ?? 0} women`
      : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={enterprise.isRefetching || visits.isRefetching}
          onRefresh={() => {
            void enterprise.refetch();
            void visits.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <Card style={styles.header}>
        <View style={styles.avatar}>
          <Store size={28} color={colors.primary} />
        </View>
        <Text style={styles.name}>{e.enterprise_name}</Text>
        {e.enterprise_type ? <Text style={styles.meta}>{capital(e.enterprise_type)}</Text> : null}
        <View style={styles.pills}>
          {review ? (
            <StatusPill label={review.label === "Approved" ? "Verified" : review.label} tone={review.tone} />
          ) : null}
          <StatusPill label={capital(e.status) ?? "Active"} tone={e.status === "active" ? "green" : "grey"} />
        </View>
      </Card>

      {e.owner_participant_id ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Owner</Text>
          <Pressable
            accessibilityRole="button"
            disabled={!can("participants")}
            onPress={() => router.push(`/participants/${e.owner_participant_id}`)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <View style={styles.ownerRow}>
              <View style={styles.ownerIcon}>
                <UserRound size={18} color={colors.primary} />
              </View>
              <Text style={[styles.value, styles.flex]}>{owner ?? "Open the owner"}</Text>
              {can("participants") ? <ChevronRight size={18} color={colors.faint} /> : null}
            </View>
          </Pressable>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Row label="Registration" value={capital(e.registration_status)} />
        {e.tin_number ? <Row label="TIN" value={e.tin_number} /> : null}
        <Row label="Established" value={e.established_date ? shortDate(e.established_date) : null} />
        <Row label="Workers at registration" value={workers} />
        <Row label="Phone" value={e.phone} />
        {e.email ? <Row label="Email" value={e.email} /> : null}
        <Row label="Location" value={location} last />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Visits</Text>
        {visits.isLoading ? (
          <Text style={styles.meta}>Loading…</Text>
        ) : (visits.data ?? []).length === 0 ? (
          <Text style={styles.meta}>No visit recorded yet.</Text>
        ) : (
          (visits.data ?? []).map((v, i) => (
            <View key={v.id} style={[styles.visitRow, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.value}>{v.period_label ?? `${shortDate(v.period_start)} – ${shortDate(v.period_end)}`}</Text>
                <Text style={styles.meta}>
                  {Number(v.revenue).toLocaleString("en")} {v.currency} sales ·{" "}
                  {v.employees_male + v.employees_female} workers
                </Text>
              </View>
              <StatusPill label={VISIT_LABEL[v.status] ?? capital(v.status) ?? ""} tone={VISIT_TONE[v.status] ?? "grey"} />
            </View>
          ))
        )}
        {can("enterprises", "write") ? (
          <Button
            title="Record a visit"
            icon={Store}
            variant="outline"
            onPress={() =>
              router.push({ pathname: "/enterprises/performance", params: { id: e.id, name: e.enterprise_name } })
            }
          />
        ) : null}
      </Card>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.rowLine]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  header: { alignItems: "center", gap: 4 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  name: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  pills: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", justifyContent: "center", marginTop: spacing.sm },
  card: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  meta: { fontSize: 13, color: colors.muted },
  value: { fontSize: 15, color: colors.text, fontWeight: "600" },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  ownerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 10, minHeight: 44 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 14, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  visitRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
});
