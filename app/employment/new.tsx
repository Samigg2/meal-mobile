import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { PLACEMENT_TYPES, type PlacementInput, type PlacementType } from "@/lib/data";
import { ApiError } from "@/lib/api";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, makeRef, numberOf, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { useLookupOptions } from "@/lib/reference";
import { FormCard, FormScreen, PlaceFields, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { Button, ChoiceRow, Field, Loading, Select } from "@/components/ui";

/** A job waits with the person's name, for the Sync screen and to open it again. */
type QueuedPlacement = PlacementInput & { _person?: string };

/**
 * A job a participant got. Someone else verifies it on the web; follow-ups
 * (is the person still working?) are recorded on a verified job. The same
 * person, employer and start date twice is asked about first.
 */
export default function RecordJob() {
  const { participant, participantName } = useLocalSearchParams<{ participant?: string; participantName?: string }>();
  const queued = useQueuedPayload<QueuedPlacement>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <JobForm
      initial={initial}
      person={initial?.participant_id ?? participant ?? ""}
      personName={initial?._person ?? participantName ?? ""}
      queuedId={queued.queuedId}
    />
  );
}

function JobForm({
  initial,
  person,
  personName,
  queuedId,
}: {
  initial: QueuedPlacement | null;
  person: string;
  personName: string;
  queuedId?: string;
}) {
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [type, setType] = useState<PlacementType>(initial?.placement_type ?? "wage_employment");
  const [employer, setEmployer] = useState(initial?.employer_name ?? "");
  const [title, setTitle] = useState(initial?.job_title ?? "");
  const sectors = useLookupOptions("enterprise.sector");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [place, setPlace] = useState({
    region: initial?.region ?? "",
    zone: initial?.zone ?? "",
    woreda: initial?.woreda ?? "",
  });
  const [kebele, setKebele] = useState(initial?.kebele ?? "");
  const [start, setStart] = useState(initial?.start_date ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [income, setIncome] = useState(initial?.monthly_income !== undefined ? String(initial.monthly_income) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const pay = numberOf(income);
  // The web's rules and words (participants.employment.new.tsx), checked while filling and on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!person) found.form = "Open this from the participant who got the job.";
    if (type === "wage_employment" && !employer.trim()) found.employer_name = "Employer is required for wage employment";
    if (!title.trim()) found.job_title = "Job title is required";
    if (!sector.trim()) found.sector = "Sector is required";
    if (!start) found.start_date = "Start date is required";
    else if (start > todayISO()) found.start_date = "Start date cannot be in the future";
    if (end) {
      if (start && end < start) found.end_date = "End date cannot be before the start date";
      else if (end > todayISO()) found.end_date = "End date cannot be in the future";
    }
    if (pay !== undefined) {
      if (Number.isNaN(pay) || pay < 0) found.monthly_income = "Monthly income must be 0 or more";
      else if (pay > 10_000_000) found.monthly_income = "Monthly income must be at most 10,000,000";
      else if ((income.split(".")[1] ?? "").length > 2) found.monthly_income = "Monthly income takes at most 2 decimal places";
    }
    return found;
  });
  const { errors } = live;

  async function handleSave(confirmDuplicate = false) {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedPlacement = {
      participant_id: person,
      placement_type: type,
      employer_name: employer.trim(),
      job_title: title.trim() || undefined,
      sector: sector.trim() || undefined,
      region: place.region || undefined,
      zone: place.zone.trim() || undefined,
      woreda: place.woreda.trim() || undefined,
      kebele: kebele.trim() || undefined,
      start_date: start,
      end_date: end || undefined,
      monthly_income: pay,
      notes: notes.trim() || undefined,
      confirm_duplicate: confirmDuplicate || undefined,
      client_ref: clientRef,
      _person: personName || undefined,
    };
    setSaving(true);
    setDuplicate(null);
    try {
      const result = await saveOrQueue({
        kind: "placement",
        label: `Job — ${personName || "participant"} at ${payload.employer_name}`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["participant-detail", person] });
      setDone(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setDuplicate(err.message);
      live.setServer(errorsFrom(err, "Could not save the job"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="job" />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save the job" saving={saving} onSave={() => void handleSave()}>
      {duplicate ? (
        <FormCard title="Already recorded?" hint={`${duplicate} If this is a second, different job, save it anyway.`}>
          <Button title="It is a different job: save anyway" variant="outline" onPress={() => void handleSave(true)} />
        </FormCard>
      ) : null}
      <FormCard title={personName ? `Job for ${personName}` : "Job"} hint="It counts once someone else verifies it on the web.">
        <ChoiceRow label="Placement type" required value={type} options={[...PLACEMENT_TYPES]} onChange={setType} />
        <Field
          label="Employer / business"
          required={type === "wage_employment"}
          value={employer}
          onChangeText={setEmployer}
          onBlur={() => live.touch("employer_name")}
          error={errors.employer_name}
        />
        <Field label="Job title" required value={title} onChangeText={setTitle} onBlur={() => live.touch("job_title")} error={errors.job_title} />
        {sectors.length > 0 ? (
          <Select
            label="Sector"
            required
            value={sector || undefined}
            options={sectors}
            onChange={(v) => {
              setSector(v);
              live.touch("sector");
            }}
            placeholder="Select"
            error={errors.sector}
          />
        ) : (
          <Field label="Sector" required value={sector} onChangeText={setSector} onBlur={() => live.touch("sector")} error={errors.sector} />
        )}
        <DateField
          label="Start date"
          required
          value={start}
          onChange={(v) => {
            setStart(v);
            live.touch("start_date");
            live.touch("end_date");
          }}
          max={todayISO()}
          error={errors.start_date}
        />
        <DateField
          label="End date"
          value={end}
          onChange={(v) => {
            setEnd(v);
            live.touch("end_date");
          }}
          min={start || undefined}
          max={todayISO()}
          clearable
          error={errors.end_date}
        />
        <Field
          label="Monthly income"
          value={income}
          onChangeText={setIncome}
          onBlur={() => live.touch("monthly_income")}
          keyboardType="decimal-pad"
          error={errors.monthly_income}
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </FormCard>
      <FormCard title="Where the job is">
        <PlaceFields value={place} onChange={setPlace} errors={errors} />
        <Field label="Kebele" value={kebele} onChangeText={setKebele} autoCapitalize="words" />
      </FormCard>
    </FormScreen>
  );
}
