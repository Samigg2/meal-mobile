import { useRouter } from "expo-router";
import { placementsCopy, listPlacementsPage, PLACEMENT_TYPES } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { RecordList } from "@/components/record-list";

const typeLabel = (v: string) => PLACEMENT_TYPES.find((t) => t.value === v)?.label ?? v.replace(/_/g, " ");

/** Jobs from the Overview tile; a row opens the person. */
export default function Jobs() {
  const router = useRouter();
  const { can } = useAuth();
  return (
    <RecordList
      queryKey="placements"
      copy={placementsCopy}
      searchText={(j) => `${j.participant_name} ${j.employer_name ?? ""} ${j.job_title ?? ""}`}
      fetch={listPlacementsPage}
      topic="jobs"
      noun={["job", "jobs"]}
      searchHint="Search person, employer or job"
      toItem={(j) => {
        const person = j.participant_id;
        return {
          id: j.id,
          title: j.participant_name,
          meta: [j.job_title, j.employer_name, typeLabel(j.placement_type)].filter(Boolean).join(" · "),
          pill: j.verified_on
            ? { label: "Verified", tone: "green" }
            : {
                label: j.status === "exited" ? "Exited" : "Pending",
                tone: j.status === "exited" ? "grey" : "amber",
              },
          onPress: person && can("participants") ? () => router.push(`/participants/${person}`) : undefined,
        };
      }}
    />
  );
}
