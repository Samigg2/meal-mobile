import { useRouter } from "expo-router";
import { loansCopy, listLoansPage } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { RecordList } from "@/components/record-list";
import { loanRow } from "@/components/register-rows";

const STATUS = [
  { label: "Applied", value: "applied" },
  { label: "Approved", value: "approved" },
  { label: "Disbursed", value: "disbursed" },
  { label: "Repaying", value: "repaying" },
  { label: "Closed", value: "closed" },
  { label: "Rejected", value: "rejected" },
];

/** Loans; a row opens the borrower, or the owner of a borrowing enterprise. */
export default function Loans() {
  const router = useRouter();
  const { can } = useAuth();
  return (
    <RecordList
      queryKey="loans"
      copy={loansCopy}
      searchText={(l) => `${l.borrower} ${l.provider_name ?? ""}`}
      fetch={listLoansPage}
      topic="loans"
      noun={["loan", "loans"]}
      searchHint="Search borrower"
      chips={[
        { label: "All", value: "all" },
        ...STATUS.map((s) => ({ ...s, query: { status: s.value }, test: (l: { status: string }) => l.status === s.value })),
      ]}
      toRow={(l) => {
        const person = l.participant_id ?? l.enterprises?.owner_participant_id ?? null;
        return loanRow(l, person && can("participants") ? () => router.push(`/participants/${person}`) : undefined);
      }}
    />
  );
}
