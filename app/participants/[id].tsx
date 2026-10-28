import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CircleAlert,
  FileText,
  HandCoins,
  Pencil,
  Plus,
  ShieldCheck,
  Store,
} from "lucide-react-native";
import { getParticipantDetail, REPAYABLE } from "@/lib/data";
import { initialsOf } from "@/lib/user";
import { useAuth } from "@/lib/auth";
import {
  Button,
  Card,
  EmptyState,
  ListSkeleton,
  StatusPill,
  Text,
} from "@/components/ui";
import { DocumentPhotos } from "@/components/document-photos";
import { colors, spacing, topics } from "@/theme";

const capital = (s?: string | null) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : null;

export default function ParticipantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
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
        message={
          error instanceof Error
            ? error.message
            : "Check your connection and try again."
        }
      />
    );
  }

  const {
    participant,
    enterprise,
    trainings,
    employment = [],
    loans = [],
  } = data;
  const who = {
    participant: participant.id,
    participantName: participant.full_name,
  };
  const female = participant.sex === "female";
  const t = female ? topics.female : topics.participants;
  const location = [
    participant.kebele,
    participant.woreda,
    participant.zone,
    participant.region,
  ]
    .filter(Boolean)
    .join(", ");
  // Same rule and words as the web: a registration nobody has approved yet gets no enterprise, job or loan.
  const pending =
    participant.review_status && participant.review_status !== "approved"
      ? `${participant.full_name} is still ${participant.review_status === "rejected" ? "rejected" : "pending approval"}: approve the registration first`
      : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <Card style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: t.tint }]}>
          <Text style={[styles.avatarText, { color: t.color }]}>
            {initialsOf(participant.full_name)}
          </Text>
        </View>
        <Text style={styles.name}>{participant.full_name}</Text>
        <Text style={styles.id}>{participant.participant_id}</Text>
        <View style={styles.pills}>
          <StatusPill
            label={participant.status}
            tone={participant.status === "active" ? "green" : "grey"}
          />
          {participant.is_youth ? (
            <StatusPill label="Youth" tone="blue" />
          ) : null}
          {participant.disability ? (
            <StatusPill
              label={participant.disability_type ?? "Disability"}
              tone="violet"
            />
          ) : null}
          {participant.consent_given ? (
            <StatusPill
              label="Consent on file"
              tone="green"
              icon={ShieldCheck}
            />
          ) : (
            <StatusPill
              label="No consent"
              tone="red"
              icon={CircleAlert}
              outline
            />
          )}
        </View>
        {can("participants", "write") ? (
          <View style={styles.editButton}>
            <Button
              title="Edit"
              icon={Pencil}
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: "/participants/edit/[id]",
                  params: { id: participant.id },
                })
              }
            />
          </View>
        ) : null}
      </Card>

      {pending ? (
        <Card style={styles.card}>
          <Text style={styles.value}>Not approved yet</Text>
          <Text style={styles.meta}>
            {pending}. An enterprise, job or loan can be added once someone else
            approves.
          </Text>
        </Card>
      ) : null}
      {data.fromCopy ? (
        <Card style={styles.card}>
          <Text style={styles.meta}>
            Offline: this is from the lists saved on this phone. Training
            history shows when you open this person online.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Row label="Sex" value={capital(participant.sex)} />
        <Row label="Date of birth" value={participant.date_of_birth} />
        <Row label="Phone" value={participant.phone} />
        <Row label="Education" value={capital(participant.education_level)} />
        <Row label="Location" value={location} last />
      </Card>

      {/* Registered with a Kebele ID and no National ID: the scan is the evidence (2026-10-25). */}
      {!participant.national_id?.trim() &&
      participant.kebele_id?.trim() &&
      can("participants", "write") &&
      !data.fromCopy ? (
        <DocumentPhotos
          module="participants"
          recordId={participant.id}
          types={["kebele_id_scan"]}
        />
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Enterprise</Text>
        {enterprise ? (
          <>
            <Text
              style={[styles.value, styles.link]}
              onPress={() =>
                router.push({
                  pathname: "/enterprises/[id]",
                  params: { id: enterprise.id },
                })
              }
            >
              {enterprise.enterprise_name} ›
            </Text>
            <Text style={styles.meta}>
              {[enterprise.enterprise_type, enterprise.status]
                .filter(Boolean)
                .map((x) => capital(String(x)))
                .join(" · ")}
            </Text>
          </>
        ) : (
          <Text style={styles.meta}>Not linked to an enterprise.</Text>
        )}
        {can("enterprises", "write") ? (
          <View style={styles.actions}>
            {enterprise ? (
              <Button
                title="Record a visit"
                icon={Store}
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/enterprises/performance",
                    params: {
                      id: enterprise.id,
                      name: enterprise.enterprise_name,
                    },
                  })
                }
              />
            ) : null}
            {pending ? null : (
              <Button
                title="Add an enterprise"
                icon={Plus}
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/enterprises/new",
                    params: {
                      owner: participant.id,
                      ownerName: participant.full_name,
                    },
                  })
                }
              />
            )}
          </View>
        ) : null}
      </Card>

      {can("employment") ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Jobs</Text>
          {employment.length === 0 ? (
            <Text style={styles.meta}>No job recorded.</Text>
          ) : null}
          {employment.map((job, i) => {
            const title =
              [job.job_title, job.employer_name].filter(Boolean).join(" at ") ||
              "Job";
            return (
              <View
                key={job.id}
                style={[styles.itemRow, i > 0 && styles.divider]}
              >
                <Text style={styles.value}>{title}</Text>
                <Text style={styles.meta}>
                  {[
                    capital(job.placement_type),
                    job.start_date
                      ? `from ${job.start_date.slice(0, 10)}`
                      : null,
                    capital(job.status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {job.verified_on ? "" : " · not verified yet"}
                </Text>
                {can("employment", "write") && !data.fromCopy ? (
                  <Button
                    title="Documents"
                    icon={FileText}
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/documents",
                        params: {
                          module: "employment",
                          id: job.id,
                          types: "placement_evidence",
                          title,
                        },
                      })
                    }
                  />
                ) : null}
                {can("employment", "write") &&
                !job.verified_on &&
                !data.fromCopy ? (
                  <Button
                    title="Edit"
                    icon={Pencil}
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/employment/new",
                        params: { edit: job.id },
                      })
                    }
                  />
                ) : null}
                {can("employment", "write") &&
                job.verified_on &&
                job.status !== "exited" ? (
                  <Button
                    title="Follow-up"
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/employment/follow-up",
                        params: {
                          id: job.id,
                          job: `${participant.full_name}: ${title}`,
                        },
                      })
                    }
                  />
                ) : null}
              </View>
            );
          })}
          {can("employment", "write") && !pending ? (
            <Button
              title="Add a job"
              icon={BriefcaseBusiness}
              variant="outline"
              onPress={() =>
                router.push({ pathname: "/employment/new", params: who })
              }
            />
          ) : null}
        </Card>
      ) : null}

      {can("finance") ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Loans</Text>
          {loans.length === 0 ? (
            <Text style={styles.meta}>No loan recorded.</Text>
          ) : null}
          {loans.map((loan, i) => {
            const label = `${capital(loan.product_type)} · ${Number(loan.amount_requested).toLocaleString("en")} ${loan.currency}`;
            return (
              <View
                key={loan.id}
                style={[styles.itemRow, i > 0 && styles.divider]}
              >
                <Text style={styles.value}>{label}</Text>
                <Text style={styles.meta}>
                  {[
                    loan.financial_service_providers?.name,
                    capital(loan.status),
                    loan.application_date?.slice(0, 10),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {can("finance", "write") && !data.fromCopy ? (
                  <Button
                    title="Documents"
                    icon={FileText}
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/documents",
                        params: {
                          module: "finance",
                          id: loan.id,
                          types: "loan_agreement",
                          title: label,
                        },
                      })
                    }
                  />
                ) : null}
                {can("finance", "write") &&
                loan.status === "applied" &&
                !data.fromCopy ? (
                  <Button
                    title="Edit"
                    icon={Pencil}
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/finance/loan",
                        params: { edit: loan.id },
                      })
                    }
                  />
                ) : null}
                {can("finance", "write") && REPAYABLE.has(loan.status) ? (
                  <Button
                    title="Record a repayment"
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/finance/repayment",
                        params: {
                          loan: loan.id,
                          loanLabel: `${participant.full_name}: ${label}`,
                        },
                      })
                    }
                  />
                ) : null}
              </View>
            );
          })}
          {can("finance", "write") && !pending ? (
            <Button
              title="Record a loan"
              icon={HandCoins}
              variant="outline"
              onPress={() =>
                router.push({ pathname: "/finance/loan", params: who })
              }
            />
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Training history</Text>
        {trainings.length === 0 ? (
          <Text style={styles.meta}>No training attendance recorded.</Text>
        ) : (
          trainings.map((row, i) => (
            <View
              key={row.id}
              style={[styles.trainingRow, i > 0 && styles.divider]}
            >
              <View style={styles.flex}>
                <Text style={styles.value}>
                  {row.training_events?.title ?? "Training"}
                </Text>
                <Text style={styles.meta}>{row.attendance_date}</Text>
              </View>
              {/* The attendance list carries no status of its own: a row means the person attended. */}
              <StatusPill
                label={row.status ?? "present"}
                tone={
                  !row.status || row.status === "present" ? "green" : "grey"
                }
              />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.divider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  flex: { flex: 1 },
  actions: { gap: spacing.sm },
  itemRow: { gap: spacing.xs, paddingTop: spacing.sm },
  header: { alignItems: "center", gap: 4 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 22, fontWeight: "700" },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  id: { fontSize: 13, color: colors.muted },
  pills: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  editButton: { marginTop: spacing.sm, alignSelf: "stretch" },
  card: { gap: spacing.sm },
  meta: { fontSize: 13, color: colors.muted },
  value: { fontSize: 15, color: colors.text, fontWeight: "600" },
  link: { color: colors.primary },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  trainingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
