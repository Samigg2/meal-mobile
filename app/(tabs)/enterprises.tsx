import { useRouter } from "expo-router";
import { enterprisesCopy, listEnterprisesPage } from "@/lib/data";
import { RecordList } from "@/components/record-list";
import { enterpriseRow } from "@/components/register-rows";

/** The Enterprises tab; a row opens the enterprise. */
export default function Enterprises() {
  const router = useRouter();
  return (
    <RecordList
      queryKey="enterprises"
      copy={enterprisesCopy}
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
          where: { review_status: "submitted" },
        },
        {
          label: "Verified",
          value: "approved",
          query: { review_status: "approved" },
          where: { review_status: "approved" },
        },
        { label: "Inactive", value: "inactive", query: { status: "inactive" }, where: { status: "inactive" } },
      ]}
      toRow={(e) =>
        enterpriseRow(e, () =>
          router.push({ pathname: "/enterprises/[id]", params: { id: e.id, ownerName: e.owner_name ?? "" } }),
        )
      }
    />
  );
}
