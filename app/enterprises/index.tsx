import { useRouter } from "expo-router";
import { enterprisesCopy, listEnterprisesPage } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { RecordList } from "@/components/record-list";
import type { PillTone } from "@/theme";

const REVIEW: Record<string, { label: string; tone: PillTone }> = {
  submitted: { label: "Pending", tone: "amber" },
  approved: { label: "Verified", tone: "green" },
  rejected: { label: "Sent back", tone: "red" },
};

/** Enterprises from the Overview tile; a row opens its owner. */
export default function Enterprises() {
  const router = useRouter();
  const { can } = useAuth();
  return (
    <RecordList
      queryKey="enterprises"
      copy={enterprisesCopy}
      searchText={(e) => `${e.enterprise_name} ${e.owner_name ?? ""} ${e.woreda ?? ""}`}
      fetch={listEnterprisesPage}
      topic="enterprises"
      noun={["enterprise", "enterprises"]}
      searchHint="Search enterprise or owner"
      toItem={(e) => {
        const owner = e.owner_participant_id;
        return {
          id: e.id,
          title: e.enterprise_name,
          meta: [e.owner_name, e.woreda ?? e.region].filter(Boolean).join(" · ") || "No owner recorded",
          pill: REVIEW[e.review_status],
          onPress: owner && can("participants") ? () => router.push(`/participants/${owner}`) : undefined,
        };
      }}
    />
  );
}
