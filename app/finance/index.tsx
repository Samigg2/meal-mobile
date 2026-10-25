import { useRouter } from "expo-router";
import { loansCopy, listLoansPage } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { RecordList } from "@/components/record-list";
import type { PillTone } from "@/theme";

const STATUS: Record<string, PillTone> = {
  applied: "blue",
  approved: "violet",
  rejected: "red",
  disbursed: "amber",
  repaying: "amber",
  closed: "green",
};

/** Loans from the Overview tile; a row opens the borrower, or the owner of a borrowing enterprise. */
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
      toItem={(l) => {
        const person = l.participant_id ?? l.enterprises?.owner_participant_id ?? null;
        return {
          id: l.id,
          title: l.borrower,
          meta: [
            `${Number(l.amount_approved ?? l.amount_requested).toLocaleString()} ${l.currency}`,
            l.provider_name,
            l.application_date,
          ]
            .filter(Boolean)
            .join(" · "),
          pill: { label: l.status, tone: STATUS[l.status] ?? "grey" },
          onPress: person && can("participants") ? () => router.push(`/participants/${person}`) : undefined,
        };
      }}
    />
  );
}
