import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { SAFEGUARDING_TYPES, type SafeguardingInput, type SafeguardingType } from "@/lib/data";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, makeRef, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField, formatDate } from "@/components/date-picker";
import { Field, Loading, Select } from "@/components/ui";

/**
 * Report a safeguarding concern from the field. The phone sends it and keeps
 * nothing: cases are never listed here, since a phone can be lost or shared.
 * Who handles it, and how, is decided on the web.
 */
export default function ReportConcern() {
  const queued = useQueuedPayload<SafeguardingInput>();
  if (!queued.ready) return <Loading />;
  return <ConcernForm initial={queued.payload} queuedId={queued.queuedId} />;
}

function ConcernForm({ initial, queuedId }: { initial: SafeguardingInput | null; queuedId?: string }) {
  const scroll = useRef<ScrollView>(null);
  const [caseType, setCaseType] = useState<SafeguardingType | undefined>(initial?.case_type);
  const [reportedDate, setReportedDate] = useState(initial?.reported_date ?? todayISO());
  const [incidentDate, setIncidentDate] = useState(initial?.incident_date ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.confidential_notes ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  // The web's rules and words (safeguarding.record-spec.ts), checked while filling and again on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!caseType) found.case_type = "Case type is required";
    if (!reportedDate) found.reported_date = "Reported on is required";
    else if (reportedDate > todayISO()) found.reported_date = "Reported on cannot be in the future";
    else if (incidentDate && reportedDate < incidentDate) {
      found.reported_date = `Reported on cannot be before the incident date (${formatDate(incidentDate)})`;
    }
    if (incidentDate > todayISO()) found.incident_date = "Incident date cannot be in the future";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: SafeguardingInput = {
      case_type: caseType!,
      reported_date: reportedDate,
      incident_date: incidentDate || undefined,
      description: description.trim(),
      confidential_notes: notes.trim() || undefined,
      client_ref: clientRef,
    };
    setSaving(true);
    try {
      const label = `Concern — ${SAFEGUARDING_TYPES.find((t) => t.value === caseType)?.label ?? caseType}`;
      setDone(await saveOrQueue({ kind: "safeguarding", label, payload, queuedId }));
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not send the concern"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="concern" />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Send the concern" saving={saving} onSave={handleSave}>
      <FormCard
        title="What happened"
        hint="Write only what you were told or saw. The safeguarding focal point follows it up; it is not kept on this phone once sent."
      >
        <Select
          label="Case type"
          required
          value={caseType}
          options={[...SAFEGUARDING_TYPES]}
          onChange={(v) => {
            setCaseType(v);
            live.touch("case_type");
          }}
          placeholder="Select"
          error={errors.case_type}
        />
        <DateField
          label="Reported on"
          required
          value={reportedDate}
          onChange={(v) => {
            setReportedDate(v);
            live.touch("reported_date");
          }}
          max={todayISO()}
          error={errors.reported_date}
        />
        <DateField
          label="Incident date"
          value={incidentDate}
          onChange={(v) => {
            setIncidentDate(v);
            live.touch("incident_date");
            if (reportedDate) live.touch("reported_date");
          }}
          max={todayISO()}
          clearable
          error={errors.incident_date}
          hint="Leave empty if not known."
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />
        <Field
          label="Confidential notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={2000}
          hint="Names and details only the focal point should see."
        />
      </FormCard>
    </FormScreen>
  );
}
