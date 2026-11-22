import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import type { Targeted } from "@/lib/queue";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, numberOf, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { useLookupOptions } from "@/lib/reference";
import { FormCard, FormScreen, FormStep, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { ChoiceRow, Field, Loading, Select } from "@/components/ui";

/**
 * DMIS F04B: the monthly Youth in Work follow-up, one per record and month.
 * The record itself (F04A baseline) is made on the web; the phone records the
 * month in the field, offline too: it waits in the queue with its record
 * (`_target`) and is sent on the next sync. The server's rules are repeated
 * here so the officer can fix everything before saving.
 */
type FollowUpBody = {
  reporting_date: string;
  pathway: string;
  currently_working: boolean;
  not_working_reason?: string | null;
  stopped_on?: string | null;
  same_enterprise: boolean;
  monthly_income?: number | null;
  employment_nature: string;
  employment_type: string;
  yiw_category: string;
  dw_honest_respected: boolean;
  dw_dignity: boolean;
  dw_satisfaction: boolean;
  notes?: string;
};
type QueuedFollowUp = Targeted<FollowUpBody & { _label?: string }>;

type YesNo = "yes" | "no";
const YES_NO = [
  { label: "Yes", value: "yes" as const },
  { label: "No", value: "no" as const },
];
const toYesNo = (v: boolean | undefined): YesNo | undefined => (v === undefined ? undefined : v ? "yes" : "no");

export default function YiwFollowUp() {
  const p = useLocalSearchParams<{
    id?: string;
    label?: string;
    pathway?: string;
    nature?: string;
    type?: string;
    category?: string;
  }>();
  const queued = useQueuedPayload<QueuedFollowUp>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <FollowUpForm
      recordId={initial?._target ?? p.id ?? ""}
      label={initial?._label ?? p.label ?? ""}
      initial={initial}
      defaults={{ pathway: p.pathway, nature: p.nature, type: p.type, category: p.category }}
      queuedId={queued.queuedId}
    />
  );
}

function FollowUpForm({
  recordId,
  label,
  initial,
  defaults,
  queuedId,
}: {
  recordId: string;
  label: string;
  initial: QueuedFollowUp | null;
  defaults: { pathway?: string; nature?: string; type?: string; category?: string };
  queuedId?: string;
}) {
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const pathways = useLookupOptions("youth_in_work.pathway");
  const natures = useLookupOptions("youth_in_work.employment_nature");
  const categories = useLookupOptions("youth_in_work.category");
  const reasons = useLookupOptions("youth_in_work.not_working_reason");

  const [date, setDate] = useState(initial?.reporting_date ?? todayISO());
  const [pathway, setPathway] = useState(initial?.pathway ?? defaults.pathway ?? "");
  const [working, setWorking] = useState<YesNo | undefined>(toYesNo(initial?.currently_working));
  const [reason, setReason] = useState(initial?.not_working_reason ?? "");
  const [stopped, setStopped] = useState(initial?.stopped_on ?? "");
  const [same, setSame] = useState<YesNo | undefined>(toYesNo(initial?.same_enterprise));
  const [income, setIncome] = useState(initial?.monthly_income != null ? String(initial.monthly_income) : "");
  const [nature, setNature] = useState(initial?.employment_nature ?? defaults.nature ?? "");
  const [type, setType] = useState(initial?.employment_type ?? defaults.type ?? "");
  const [category, setCategory] = useState(initial?.yiw_category ?? defaults.category ?? "");
  const [honest, setHonest] = useState<YesNo | undefined>(toYesNo(initial?.dw_honest_respected));
  const [dignity, setDignity] = useState<YesNo | undefined>(toYesNo(initial?.dw_dignity));
  const [satisfied, setSatisfied] = useState<YesNo | undefined>(toYesNo(initial?.dw_satisfaction));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const pay = numberOf(income);
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!recordId) found.form = "Open this from the participant's Youth in Work record.";
    if (!date) found.reporting_date = "Reporting date is required";
    else if (date > todayISO()) found.reporting_date = "The reporting date cannot be in the future";
    if (!pathway) found.pathway = "Choose the pathway";
    if (!working) found.currently_working = "Answer Yes or No";
    if (working === "yes") {
      if (pay === undefined) found.monthly_income = "Give the month's earning income";
      else if (Number.isNaN(pay) || pay < 0) found.monthly_income = "Income must be 0 or more";
    }
    if (working === "no") {
      if (!reason) found.not_working_reason = "Give the reason for not working";
      if (stopped && date && stopped > date) found.stopped_on = "The stop date cannot be after the reporting date";
    }
    if (!same) found.same_enterprise = "Answer Yes or No";
    if (!nature) found.employment_nature = "Choose permanent, seasonal or temporary";
    if (!type) found.employment_type = "Choose wage or self";
    if (!category) found.yiw_category = "Choose the Youth in Work category";
    if (!honest) found.dw_honest_respected = "Answer Yes or No";
    if (!dignity) found.dw_dignity = "Answer Yes or No";
    if (!satisfied) found.dw_satisfaction = "Answer Yes or No";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const isWorking = working === "yes";
    const payload: QueuedFollowUp = {
      reporting_date: date,
      pathway,
      currently_working: isWorking,
      not_working_reason: isWorking ? null : reason,
      stopped_on: isWorking ? null : stopped || null,
      same_enterprise: same === "yes",
      // Not working with no income given counts as 0 on the server.
      monthly_income: pay ?? null,
      employment_nature: nature,
      employment_type: type,
      yiw_category: category,
      dw_honest_respected: honest === "yes",
      dw_dignity: dignity === "yes",
      dw_satisfaction: satisfied === "yes",
      notes: notes.trim() || undefined,
      _target: recordId,
      _label: label || undefined,
    };
    setSaving(true);
    try {
      const result = await saveOrQueue({
        kind: "yiw_follow_up",
        label: `Youth in Work follow-up — ${label || "participant"} (${date.slice(0, 7)})`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["yiw-of-participant"] });
      setDone(result);
    } catch (err) {
      live.setServer(
        err instanceof ApiError && err.status === 409
          ? { form: "This month already has a follow-up for this record." }
          : errorsFrom(err, "Could not save the follow-up"),
      );
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="follow-up" another={false} />;

  const score = [honest, dignity, satisfied].filter((v) => v === "yes").length;

  return (
    <FormScreen
      ref={scroll}
      error={errors.form}
      saveTitle="Save the follow-up"
      saving={saving}
      onSave={() => void handleSave()}
      steps={{
        titles: ["Work this month", "Decent work"],
        fields: [
          [
            "reporting_date",
            "pathway",
            "currently_working",
            "not_working_reason",
            "stopped_on",
            "same_enterprise",
            "monthly_income",
            "employment_nature",
            "employment_type",
            "yiw_category",
          ],
          ["dw_honest_respected", "dw_dignity", "dw_satisfaction"],
        ],
        check: live.checkStep,
        errors,
      }}
    >
      <FormStep index={0}>
        <FormCard title={label ? `Follow-up: ${label}` : "Monthly follow-up"} hint="One follow-up per month for this record.">
          <DateField
            label="Reporting date"
            required
            value={date}
            onChange={(v) => {
              setDate(v);
              live.touch("reporting_date");
            }}
            max={todayISO()}
            error={errors.reporting_date}
          />
          <Select label="Youth in Work pathway" required value={pathway || undefined} options={pathways} onChange={setPathway} error={errors.pathway} />
          <ChoiceRow label="Currently working?" required value={working} options={YES_NO} onChange={setWorking} error={errors.currently_working} />
          {working === "no" ? (
            <>
              <Select
                label="Reason for not working"
                required
                value={reason || undefined}
                options={reasons}
                onChange={setReason}
                error={errors.not_working_reason}
              />
              <DateField
                label="Date stopped working"
                value={stopped}
                onChange={setStopped}
                max={date || todayISO()}
                clearable
                error={errors.stopped_on}
              />
            </>
          ) : null}
          <ChoiceRow label="Still in the same enterprise?" required value={same} options={YES_NO} onChange={setSame} error={errors.same_enterprise} />
          <Field
            label="Monthly earning income (ETB)"
            required={working === "yes"}
            value={income}
            onChangeText={setIncome}
            onBlur={() => live.touch("monthly_income")}
            keyboardType="decimal-pad"
            error={errors.monthly_income}
          />
          <Select label="Employment nature" required value={nature || undefined} options={natures} onChange={setNature} error={errors.employment_nature} />
          <ChoiceRow
            label="Employment type"
            required
            value={(type || undefined) as "wage" | "self" | undefined}
            options={[
              { label: "Wage", value: "wage" },
              { label: "Self", value: "self" },
            ]}
            onChange={setType}
            error={errors.employment_type}
          />
          <Select label="Youth in Work category" required value={category || undefined} options={categories} onChange={setCategory} error={errors.yiw_category} />
        </FormCard>
      </FormStep>
      <FormStep index={1}>
        <FormCard title="Decent work" hint={`Score this month: ${score} of 3.`}>
          <ChoiceRow
            label="Is the work regarded as honest and socially respected?"
            required
            value={honest}
            options={YES_NO}
            onChange={setHonest}
            error={errors.dw_honest_respected}
          />
          <ChoiceRow
            label="Treated with dignity and appreciation at work?"
            required
            value={dignity}
            options={YES_NO}
            onChange={setDignity}
            error={errors.dw_dignity}
          />
          <ChoiceRow
            label="Feeling satisfaction, accomplishment and meaningful engagement through work?"
            required
            value={satisfied}
            options={YES_NO}
            onChange={setSatisfied}
            error={errors.dw_satisfaction}
          />
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
        </FormCard>
      </FormStep>
    </FormScreen>
  );
}
