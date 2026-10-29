import { useRouter } from "expo-router";
import { placementsCopy, listPlacementsPage } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { RecordList } from "@/components/record-list";
import { jobRow } from "@/components/register-rows";

/** Jobs; a row opens the person. */
export default function Jobs() {
  const router = useRouter();
  const { can } = useAuth();
  return (
    <RecordList
      queryKey="placements"
      copy={placementsCopy}
      fetch={listPlacementsPage}
      topic="jobs"
      noun={["job", "jobs"]}
      searchHint="Search person, employer or job"
      chips={[
        { label: "All", value: "all" },
        { label: "Placed", value: "placed", query: { status: "placed" }, where: { status: "placed" } },
        { label: "Retained", value: "retained", query: { status: "retained" }, where: { status: "retained" } },
        { label: "Exited", value: "exited", query: { status: "exited" }, where: { status: "exited" } },
        // Needs the next follow-up date, which the saved copy does not keep: online only.
        { label: "Follow-up overdue", value: "overdue", query: { follow_up: "overdue" }, where: false },
      ]}
      toRow={(j) => {
        const person = j.participant_id;
        return jobRow(j, person && can("participants") ? () => router.push(`/participants/${person}`) : undefined);
      }}
    />
  );
}
