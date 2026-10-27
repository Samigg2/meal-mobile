import type { ComponentProps } from "react";
import { Store, UserRound } from "lucide-react-native";
import type { EnterpriseRow, FeedbackRow, ParticipantRow, SafeguardingCaseRow, TrainingEventRow } from "@/lib/types";
import { PLACEMENT_TYPES, type ActivityRow, type LoanListRow, type PlacementListRow } from "@/lib/data";
import { initialsOf } from "@/lib/user";
import { PersonRow, StatusPill } from "@/components/ui";
import { colors, topics, type PillTone } from "@/theme";

/**
 * How each register shows as a chat-style row, the same on Home and on its list.
 * `open` is where a tap goes (the participant the row is for), or undefined.
 */
type Row = Omit<ComponentProps<typeof PersonRow>, "last"> & { id: string };

/** "12 Oct", with the year only when it is not this year. */
export function shortDate(iso?: string | null) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

const pill = (label: string, tone: PillTone) => <StatusPill label={label} tone={tone} />;

export const REVIEW: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "grey" },
  submitted: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Sent back", tone: "red" },
};

export function participantRow(p: ParticipantRow, open?: () => void): Row {
  const review = REVIEW[p.review_status ?? ""];
  return {
    id: p.id,
    initials: initialsOf(p.full_name),
    icon: UserRound,
    color: colors.primary,
    tint: colors.primarySoft,
    title: p.full_name,
    meta: [p.participant_id, p.woreda].filter(Boolean).join(" · "),
    date: shortDate(p.created_at),
    pill: review ? pill(review.label, review.tone) : undefined,
    onPress: open,
  };
}

export function enterpriseRow(e: EnterpriseRow, open?: () => void): Row {
  const review = REVIEW[e.review_status ?? ""];
  return {
    id: e.id,
    initials: initialsOf(e.enterprise_name),
    icon: Store,
    color: colors.primary,
    tint: colors.primarySoft,
    title: e.enterprise_name,
    meta: [e.owner_name, e.woreda].filter(Boolean).join(" · "),
    date: shortDate(e.created_at),
    pill: review ? pill(review.label === "Approved" ? "Verified" : review.label, review.tone) : undefined,
    onPress: open,
  };
}

const typeLabel = (v: string) => PLACEMENT_TYPES.find((t) => t.value === v)?.label ?? v.replace(/_/g, " ");

export function jobRow(j: PlacementListRow, open?: () => void): Row {
  return {
    id: j.id,
    initials: initialsOf(j.participant_name),
    color: topics.jobs.color,
    tint: topics.jobs.tint,
    title: j.participant_name,
    meta: [j.job_title, j.employer_name, typeLabel(j.placement_type)].filter(Boolean).join(" · "),
    date: shortDate(j.start_date),
    pill: j.verified_on
      ? pill("Verified", "green")
      : j.status === "exited"
        ? pill("Exited", "grey")
        : pill("Pending", "amber"),
    onPress: open,
  };
}

const LOAN_TONE: Record<string, PillTone> = {
  applied: "blue",
  approved: "violet",
  rejected: "red",
  disbursed: "amber",
  repaying: "amber",
  closed: "green",
};

export function loanRow(l: LoanListRow, open?: () => void): Row {
  return {
    id: l.id,
    initials: initialsOf(l.borrower),
    color: topics.loans.color,
    tint: topics.loans.tint,
    title: l.borrower,
    meta: [`${Number(l.amount_approved ?? l.amount_requested).toLocaleString()} ${l.currency}`, l.provider_name]
      .filter(Boolean)
      .join(" · "),
    date: shortDate(l.application_date),
    pill: pill(l.status, LOAN_TONE[l.status] ?? "grey"),
    onPress: open,
  };
}

const words = (s?: string | null) => {
  const t = (s ?? "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const FEEDBACK_TONE: Record<string, PillTone> = { new: "blue", in_review: "amber", resolved: "green", closed: "grey" };

export function feedbackRow(f: FeedbackRow, open?: () => void): Row {
  return {
    onPress: open,
    id: f.id,
    initials: words(f.feedback_type).slice(0, 2),
    color: topics.disability.color,
    tint: topics.disability.tint,
    title: f.reference_code ? `${words(f.feedback_type)} · ${f.reference_code}` : words(f.feedback_type),
    meta: f.description,
    date: shortDate(f.received_date ?? f.created_at),
    pill: pill(f.status, FEEDBACK_TONE[f.status] ?? "grey"),
  };
}

const CASE_TONE: Record<string, PillTone> = { open: "red", investigating: "amber", referred: "violet", closed: "grey" };

export function concernRow(
  c: Pick<SafeguardingCaseRow, "id" | "case_type" | "status" | "reported_date" | "created_at">,
  open?: () => void,
): Row {
  return {
    onPress: open,
    id: c.id,
    initials: "SG",
    color: topics.safeguarding.color,
    tint: topics.safeguarding.tint,
    title: words(c.case_type),
    date: shortDate(c.reported_date ?? c.created_at),
    pill: pill(c.status, CASE_TONE[c.status] ?? "grey"),
  };
}

const TRAINING_TONE: Record<string, PillTone> = { planned: "blue", ongoing: "amber", completed: "green", cancelled: "grey" };

export function trainingRow(t: TrainingEventRow, open?: () => void): Row {
  return {
    id: t.id,
    initials: initialsOf(t.title),
    color: topics.trainings.color,
    tint: topics.trainings.tint,
    title: t.title,
    date: shortDate(t.start_date),
    pill: pill(t.status, TRAINING_TONE[t.status] ?? "grey"),
    onPress: open,
  };
}

const ACTIVITY_TONE: Record<string, PillTone> = {
  not_started: "grey",
  in_progress: "blue",
  delayed: "red",
  completed: "green",
  cancelled: "grey",
};

export function activityRow(a: ActivityRow, open?: () => void): Row {
  const status = a.is_delayed && a.status !== "completed" ? "delayed" : a.status;
  return {
    id: a.id,
    initials: initialsOf(a.title),
    color: topics.indicators.color,
    tint: topics.indicators.tint,
    title: a.title,
    meta: `${a.progress_percent}% done`,
    date: shortDate(a.planned_end),
    pill: pill(status, ACTIVITY_TONE[status] ?? "grey"),
    onPress: open,
  };
}
