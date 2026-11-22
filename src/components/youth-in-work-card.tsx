import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CalendarCheck } from "lucide-react-native";
import { api } from "@/lib/api";
import { Button, Card, Text } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

/** A Youth in Work record (F04A) as /youth-in-work/of-participant returns it. */
type YiwRow = {
  id: string;
  employment_type: string | null;
  employment_nature: string | null;
  yiw_category: string | null;
  pathway: string | null;
  start_date: string | null;
  /** The enterprise, lead firm or typed employer. */
  workplace?: string | null;
  latest_progress?: {
    reporting_month: string;
    progress_status: string | null;
    decent_work_score: number | null;
  } | null;
};

const words = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ");

/**
 * DMIS F04 on the participant page: the person's Youth in Work records with
 * their latest month, and "Monthly follow-up" for each. Records are made on
 * the web (F04A); the follow-up (F04B) is recorded here, offline too.
 */
export function YouthInWorkCard({
  participantId,
  participantName,
  canWrite,
  online,
}: {
  participantId: string;
  participantName: string;
  canWrite: boolean;
  /** Off when the page shows the saved offline copy: the list needs the server. */
  online: boolean;
}) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["yiw-of-participant", participantId],
    queryFn: () => api.get<YiwRow[]>(`/youth-in-work/of-participant/${participantId}`),
    enabled: online,
    staleTime: 5 * 60 * 1000,
  });
  const rows = data ?? [];

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Youth in Work</Text>
      {!online ? (
        <Text style={styles.meta}>Connect to see the Youth in Work records.</Text>
      ) : isLoading ? (
        <Text style={styles.meta}>Loading…</Text>
      ) : isError ? (
        <Text style={styles.meta}>Could not load the Youth in Work records.</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.meta}>No Youth in Work record yet. It is started on the web.</Text>
      ) : null}
      {rows.map((r, i) => {
        const where = r.workplace || "";
        const latest = r.latest_progress;
        const label = `${participantName} · ${words(r.employment_type)}${where ? ` at ${where}` : ""}`;
        return (
          <View key={r.id} style={[styles.row, i > 0 && styles.divider]}>
            <Text style={styles.rowTitle}>
              {words(r.employment_type)} · {words(r.yiw_category)}
              {where ? ` · ${where}` : ""}
            </Text>
            <Text style={styles.meta}>
              {words(r.pathway)} pathway · {words(r.employment_nature)}
              {r.start_date ? ` · since ${r.start_date.slice(0, 10)}` : ""}
            </Text>
            {latest ? (
              <Text style={styles.meta}>
                Latest {latest.reporting_month.slice(0, 7)}: {words(latest.progress_status) || "reported"}
                {latest.decent_work_score != null ? ` · decent work ${latest.decent_work_score}/3` : ""}
              </Text>
            ) : null}
            {canWrite ? (
              <Button
                title="Monthly follow-up"
                icon={CalendarCheck}
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/youth-in-work/follow-up",
                    params: {
                      id: r.id,
                      label,
                      pathway: r.pathway ?? "",
                      nature: r.employment_nature ?? "",
                      type: r.employment_type ?? "",
                      category: r.yiw_category ?? "",
                    },
                  })
                }
              />
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  row: { gap: spacing.xs, paddingTop: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTitle: { fontSize: 13, fontWeight: "600", color: colors.text, textTransform: "capitalize" },
  meta: { fontSize: 12, color: colors.muted, lineHeight: 18 },
});
