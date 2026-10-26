import { useRouter } from "expo-router";
import { enterprisesCopy, listEnterprisesPage } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { RecordList } from "@/components/record-list";
import { enterpriseRow } from "@/components/register-rows";

/** The Enterprises tab; a row opens its owner (an enterprise has no page of its own on the phone yet). */
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
      chips={[
        { label: "All", value: "all" },
        {
          label: "Pending",
          value: "submitted",
          query: { review_status: "submitted" },
          test: (e) => e.review_status === "submitted",
        },
        {
          label: "Verified",
          value: "approved",
          query: { review_status: "approved" },
          test: (e) => e.review_status === "approved",
        },
        { label: "Inactive", value: "inactive", query: { status: "inactive" }, test: (e) => e.status === "inactive" },
      ]}
      toRow={(e) => {
        const owner = e.owner_participant_id;
        return enterpriseRow(e, owner && can("participants") ? () => router.push(`/participants/${owner}`) : undefined);
      }}
    />
  );
}
