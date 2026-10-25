import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { FollowUpInput } from "@/lib/data";
import type { Targeted } from "@/lib/queue";
import { todayISO } from "@/lib/participant-form";
import { useLookupOptions } from "@/lib/reference";
import { errorsFrom, makeRef, numberOf, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { ChoiceRow, Field, Loading, Select } from "@/components/ui";

/** A follow-up waits with its job (`_target`) and a line describing it. */
type QueuedFollowUp = Targeted<FollowUpInput & { _job?: string }>;

const NOT_WORKING = "not_working";

/**
 * A retention check on a verified job, at the rounds the programme set (6 and
 * 12 months): is the person still working, and earning what? The server
 * holds each round to its due date and verifies the job was confirmed first.
 */
export default function JobFollowUp() {
  const { id, job } = useLocalSearchParams<{ id?: string; job?: string }>();
  const queued = useQueuedPayload<QueuedFollowUp>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <FollowUpForm
      placementId={initial?._target ?? id ?? ""}
      job={initial?._job ?? job ?? ""}
      initial={initial}
      queuedId={queued.queuedId}
    />
  );
}

function FollowUpForm({
  placementId,
  job,
  initial,
  queuedId,
}: {
  placementId: string;
  job: string;
  initial: QueuedFollowUp | null;
  queuedId?: string;
}) {
  const scroll = useRef<ScrollView>(null);
  const rounds = useLookupOptions("employment.follow_up_round");
  const outcomes = useLookupOptions("employment.follow_up_outcome");
  const methods = useLookupOptions("employment.follow_up_method");
  const reasons = useLookupOptions("employment.exit_reason");
  const [round, setRound] = useState(initial ? String(initial.round_months) : "");
  const [date, setDate] = useState(initial?.follow_up_date ?? todayISO());
  const [outcome, setOutcome] = useState(initial?.outcome ?? "");
  const [income, setIncome] = useState(initial?.monthly_income !== undefined ? String(initial.monthly_income) : "");
  const [ended, setEnded] = useState(initial?.job_ended_on ?? "");
  const [reason, setReason] = useState(initial?.exit_reason ?? "");
  const [method, setMethod] = useState(initial?.contact_method ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);
  const stopped = outcome === NOT_WORKING;

  const pay = numberOf(income);
  // The web's rules and words (lib/employment-follow-ups.ts), checked while filling and on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!placementId) found.form = "Open this from the participant's job.";
    if (!round) found.round_months = "Choose the round";
    if (!date) found.follow_up_date = "The follow-up date is required";
    else if (date > todayISO()) found.follow_up_date = "A follow-up cannot be dated in the future";
    if (!outcome) found.outcome = "Say whether they are still working";
    if (!stopped && outcome) {
      if (income.trim() === "" || pay === undefined || !(pay >= 0)) found.monthly_income = "Give their current monthly income";
      else if (pay > 10_000_000) found.monthly_income = "Monthly income must be at most 10,000,000";
      else if ((income.split(".")[1] ?? "").length > 2) found.monthly_income = "Monthly income takes at most 2 decimal places";
    }
    if (stopped) {
      if (!reason) found.exit_reason = "Give the reason they are no longer working";
      if (!ended) found.job_ended_on = "Give the date the job ended";
      else if (date && ended > date) found.job_ended_on = "The job cannot have ended after this follow-up";
    }
    if (!method) found.contact_method = "Say how they were contacted";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedFollowUp = {
      round_months: Number(round),
      follow_up_date: date,
      outcome,
      monthly_income: stopped ? undefined : pay,
      job_ended_on: stopped ? ended : undefined,
      exit_reason: stopped ? reason : undefined,
      contact_method: method,
      notes: notes.trim() || undefined,
      client_ref: clientRef,
      _target: placementId,
      _job: job || undefined,
    };
    setSaving(true);
    try {
      setDone(
        await saveOrQueue({
          kind: "follow_up",
          label: `${round}-month follow-up — ${job || "job"}`,
          payload,
          queuedId,
        }),
      );
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not save the follow-up"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="follow-up" />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save the follow-up" saving={saving} onSave={handleSave}>
      <FormCard title={job || "Job follow-up"} hint="It counts once someone else verifies it on the web.">
        <ChoiceRow
          label="Round"
          required
          value={round || undefined}
          options={rounds}
          onChange={(v) => {
            setRound(v);
            live.touch("round_months");
          }}
          error={errors.round_months}
        />
        <DateField label="Follow-up date" required value={date} onChange={(v) => { setDate(v); live.touch("follow_up_date"); live.touch("job_ended_on"); }} max={todayISO()} error={errors.follow_up_date} />
        <Select label="Outcome" required value={outcome || undefined} options={outcomes} onChange={(v) => { setOutcome(v); live.touch("outcome"); }} placeholder="Select" error={errors.outcome} />
        {stopped ? (
          <>
            <DateField label="When the job ended" required value={ended} onChange={(v) => { setEnded(v); live.touch("job_ended_on"); }} max={date || todayISO()} error={errors.job_ended_on} />
            <Select label="Why they stopped working" required value={reason || undefined} options={reasons} onChange={(v) => { setReason(v); live.touch("exit_reason"); }} placeholder="Select" error={errors.exit_reason} />
          </>
        ) : (
          <Field label="Monthly income" required value={income} onChangeText={setIncome} onBlur={() => live.touch("monthly_income")} keyboardType="decimal-pad" error={errors.monthly_income} />
        )}
        <Select label="How they were contacted" required value={method || undefined} options={methods} onChange={(v) => { setMethod(v); live.touch("contact_method"); }} placeholder="Select" error={errors.contact_method} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </FormCard>
    </FormScreen>
  );
}
