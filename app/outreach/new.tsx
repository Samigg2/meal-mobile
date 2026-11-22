import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { useLookupOptions } from "@/lib/reference";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { ChoiceRow, Field, Loading, Select } from "@/components/ui";

/**
 * DMIS F03: a work-enabling service one participant received, recorded in the
 * field (the web also records one service for many people at once). The
 * server fills the person's woreda and enterprise from their registration, so
 * this works offline: it waits in the queue and is sent on the next sync.
 */
type WeoBody = {
  service_category: string;
  service_date: string;
  notes?: string;
  participants: { participant_id: string; employment_type?: "self" | "wage" }[];
};
type QueuedWeo = WeoBody & { _person?: string };

export default function RecordService() {
  const { participant, participantName, preference } = useLocalSearchParams<{
    participant?: string;
    participantName?: string;
    /** The person's F01 employment preference, the default employment type. */
    preference?: string;
  }>();
  const queued = useQueuedPayload<QueuedWeo>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <ServiceForm
      initial={initial}
      person={initial?.participants[0]?.participant_id ?? participant ?? ""}
      personName={initial?._person ?? participantName ?? ""}
      preference={preference === "self" || preference === "wage" ? preference : undefined}
      queuedId={queued.queuedId}
    />
  );
}

function ServiceForm({
  initial,
  person,
  personName,
  preference,
  queuedId,
}: {
  initial: QueuedWeo | null;
  person: string;
  personName: string;
  preference?: "self" | "wage";
  queuedId?: string;
}) {
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const categories = useLookupOptions("work_enabling_services.category");
  const [category, setCategory] = useState(initial?.service_category ?? "");
  const [date, setDate] = useState(initial?.service_date ?? todayISO());
  const [type, setType] = useState<"self" | "wage" | undefined>(
    initial?.participants[0]?.employment_type ?? preference,
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!person) found.form = "Open this from the participant who received the service.";
    if (!category) found.service_category = "Choose the work-enabling service";
    if (!date) found.service_date = "Date is required";
    else if (date > todayISO()) found.service_date = "The date cannot be in the future";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedWeo = {
      service_category: category,
      service_date: date,
      notes: notes.trim() || undefined,
      participants: [{ participant_id: person, employment_type: type }],
      _person: personName || undefined,
    };
    setSaving(true);
    try {
      const result = await saveOrQueue({
        kind: "weo_service",
        label: `Work-enabling service — ${personName || "participant"}`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["participant-detail", person] });
      setDone(result);
    } catch (err) {
      live.setServer(
        err instanceof ApiError && err.status === 409
          ? { form: "This service is already recorded for this person on that date." }
          : errorsFrom(err, "Could not save the service"),
      );
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="service" />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save the service" saving={saving} onSave={() => void handleSave()}>
      <FormCard
        title={personName ? `Service for ${personName}` : "Work-enabling service"}
        hint="Their woreda and enterprise are taken from their registration."
      >
        <Select
          label="Work-enabling service"
          required
          value={category || undefined}
          options={categories}
          onChange={(v) => {
            setCategory(v);
            live.touch("service_category");
          }}
          placeholder={categories.length ? "Select" : "Connect once to load the list"}
          error={errors.service_category}
        />
        <DateField
          label="Date received"
          required
          value={date}
          onChange={(v) => {
            setDate(v);
            live.touch("service_date");
          }}
          max={todayISO()}
          error={errors.service_date}
        />
        <ChoiceRow
          label="Employment type"
          value={type}
          options={[
            { label: "Self", value: "self" },
            { label: "Wage", value: "wage" },
          ]}
          onChange={setType}
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </FormCard>
    </FormScreen>
  );
}
