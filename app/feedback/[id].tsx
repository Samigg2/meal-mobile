import { RefreshControl, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react-native";
import { getFeedback } from "@/lib/data";
import { DetailCard, DetailHeader, DetailText, detailStyles } from "@/components/detail-card";
import { shortDate } from "@/components/register-rows";
import { EmptyState, ListSkeleton, StatusPill } from "@/components/ui";
import { colors, topics, type PillTone } from "@/theme";

const words = (s?: string | null) => {
  const t = (s ?? "").replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
};

const TONE: Record<string, PillTone> = { new: "blue", in_review: "amber", resolved: "green", closed: "grey" };

/** One feedback entry, read only: what was said, who by, where, and how it was answered. */
export default function FeedbackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const feedback = useQuery({ queryKey: ["feedback", id], queryFn: () => getFeedback(id), enabled: !!id });

  if (feedback.isLoading) return <ListSkeleton rows={3} />;
  const f = feedback.data;
  if (feedback.isError || !f) {
    return (
      <EmptyState
        title="Could not load this feedback"
        message={feedback.error instanceof Error ? feedback.error.message : "Check your connection and try again."}
      />
    );
  }
  const place = [f.kebele, f.woreda, f.zone, f.region].filter(Boolean).join(", ") || f.location;

  return (
    <ScrollView
      contentContainerStyle={detailStyles.container}
      refreshControl={<RefreshControl refreshing={feedback.isRefetching} onRefresh={() => void feedback.refetch()} tintColor={colors.primary} />}
    >
      <DetailHeader
        icon={MessageSquareText}
        color={topics.disability.color}
        tint={topics.disability.tint}
        title={words(f.feedback_type) ?? "Feedback"}
        subtitle={f.reference_code}
      >
        <StatusPill label={words(f.status) ?? f.status} tone={TONE[f.status] ?? "grey"} />
        {f.priority ? <StatusPill label={`${words(f.priority)} priority`} tone="grey" /> : null}
      </DetailHeader>

      <DetailCard title="What was said">
        <DetailText label="Description" text={f.description} />
      </DetailCard>

      <DetailCard
        title="Details"
        rows={[
          { label: "Received", value: shortDate(f.received_date ?? f.created_at) ?? null },
          { label: "Source", value: words(f.source) },
          { label: "Category", value: words(f.category) },
          { label: "Location", value: place },
          { label: "Referred to", value: f.referred_to },
        ]}
      />

      <DetailCard
        title="Reporter"
        rows={[
          { label: "Name", value: f.reporter_name },
          { label: "Contact", value: f.reporter_contact },
          { label: "Sex", value: words(f.reporter_sex) },
          { label: "Age", value: f.reporter_age != null ? String(f.reporter_age) : null },
          { label: "Wants a reply", value: f.response_wanted ? "Yes" : "No" },
        ]}
      />

      <DetailCard title="Answer">
        <DetailText label="Resolution" text={f.resolution} />
        <DetailText
          label="Reporter told"
          text={
            f.feedback_provided_to_reporter
              ? `Yes${f.feedback_provided_date ? `, ${shortDate(f.feedback_provided_date)}` : ""}`
              : f.reporter_unreachable
                ? "Could not be reached"
                : "Not yet"
          }
        />
        {f.date_closed ? <DetailText label="Closed" text={shortDate(f.date_closed) ?? null} /> : null}
      </DetailCard>
    </ScrollView>
  );
}
