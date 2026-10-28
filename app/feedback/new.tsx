import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  FEEDBACK_TYPES,
  getRecord,
  type FeedbackInput,
  type FeedbackType,
} from "@/lib/data";
import type { FeedbackRow } from "@/lib/types";
import { PHONE_RE, todayISO } from "@/lib/participant-form";
import { useLookupOptions } from "@/lib/reference";
import {
  changedValues,
  errorsFrom,
  makeRef,
  numberOf,
  saveChange,
  saveOrQueue,
  useEditRecord,
  useLiveErrors,
  useQueuedPayload,
  type Errors,
} from "@/lib/field-form";
import {
  FormCard,
  FormScreen,
  FormStep,
  PlaceFields,
  SavedNotice,
} from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import {
  ChoiceRow,
  EmptyState,
  Field,
  Loading,
  Select,
  Toggle,
} from "@/components/ui";

/**
 * Accountability feedback heard in the field (TOR Annex 5, Complaint and Feedback
 * Reporting Log): a complaint, suggestion, compliment or query. The reporter may
 * stay anonymous. Same fields and words as the web intake; resolving it and telling
 * the reporter the outcome happen on the web.
 */
export default function RecordFeedback() {
  const edit = useEditRecord<FeedbackRow>(
    (id) => getRecord<FeedbackRow>("feedback", id),
    "feedback",
  );
  const queued = useQueuedPayload<FeedbackInput>();
  if (!queued.ready || !edit.ready) return <Loading />;
  // Opened with `edit`: the same form, filled in from the entry, saving a change.
  if (edit.editing) {
    if (!edit.row)
      return (
        <EmptyState
          title="Could not load the feedback"
          message={edit.loadError ?? "Try again."}
        />
      );
    return (
      <FeedbackForm
        initial={rowToInitial(edit.row)}
        queuedId={edit.queuedId}
        change={{ id: edit.id!, before: edit.before! }}
      />
    );
  }
  return <FeedbackForm initial={queued.payload} queuedId={queued.queuedId} />;
}

/** The entry as the form's own shape, so one form serves add and change. */
function rowToInitial(r: FeedbackRow): FeedbackInput {
  const x = r as unknown as Record<string, unknown>;
  const text = (k: string) =>
    x[k] == null || x[k] === "" ? undefined : String(x[k]);
  return {
    feedback_type: x.feedback_type as FeedbackType,
    source: text("source") ?? "meeting",
    description: text("description") ?? "",
    received_date: (text("received_date") ?? "").slice(0, 10),
    category: text("category"),
    priority: text("priority") ?? "medium",
    reporter_name: text("reporter_name"),
    reporter_sex: text("reporter_sex"),
    reporter_age: x.reporter_age != null ? Number(x.reporter_age) : undefined,
    reporter_contact: text("reporter_contact"),
    response_wanted: x.response_wanted !== false,
    referred_to: text("referred_to"),
    region: text("region"),
    zone: text("zone"),
    woreda: text("woreda"),
    kebele: text("kebele"),
    client_ref: "",
  };
}

function FeedbackForm({
  initial,
  queuedId,
  change,
}: {
  initial: FeedbackInput | null;
  queuedId?: string;
  /** Set when this is a change to an existing entry (the id, and the record as it was). */
  change?: { id: string; before: FeedbackRow };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const sources = useLookupOptions("feedback.source");
  const categories = useLookupOptions("feedback.category");
  const priorities = useLookupOptions("feedback.priority");
  const sexes = useLookupOptions("feedback.reporter_sex");
  const referrals = useLookupOptions("feedback.referred_to");
  const [type, setType] = useState<FeedbackType | undefined>(
    initial?.feedback_type,
  );
  const [source, setSource] = useState(initial?.source ?? "meeting");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [received, setReceived] = useState(
    initial?.received_date ?? todayISO(),
  );
  const [name, setName] = useState(initial?.reporter_name ?? "");
  const [sex, setSex] = useState(initial?.reporter_sex ?? "");
  const [age, setAge] = useState(
    initial?.reporter_age != null ? String(initial.reporter_age) : "",
  );
  const [phone, setPhone] = useState(initial?.reporter_contact ?? "");
  const [wantsAnswer, setWantsAnswer] = useState(
    initial?.response_wanted ?? true,
  );
  const [referredTo, setReferredTo] = useState(initial?.referred_to ?? "");
  const [place, setPlace] = useState({
    region: initial?.region ?? "",
    zone: initial?.zone ?? "",
    woreda: initial?.woreda ?? "",
  });
  const [kebele, setKebele] = useState(initial?.kebele ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const cleanPhone = phone.replace(/[\s-]/g, "");
  const years = numberOf(age);
  // The web's rules and words (feedback.schemas.ts), checked while filling and again on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!received) found.received_date = "Date received is required";
    else if (received > todayISO())
      found.received_date = "Date received cannot be in the future";
    if (!type) found.feedback_type = "Choose the complaint or feedback type";
    if (!description.trim()) found.description = "Description is required";
    if (
      years !== undefined &&
      (!Number.isInteger(years) || years < 0 || years > 120)
    ) {
      found.reporter_age = "Age must be a whole number between 0 and 120";
    }
    if (cleanPhone && !PHONE_RE.test(cleanPhone))
      found.reporter_contact = "Use 0912345678 or +251912345678";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: FeedbackInput = {
      feedback_type: type!,
      source,
      description: description.trim(),
      received_date: received,
      category: category || undefined,
      priority,
      reporter_name: name.trim() || undefined,
      reporter_sex: sex || undefined,
      reporter_age: years,
      reporter_contact: cleanPhone || undefined,
      response_wanted: wantsAnswer,
      referred_to: referredTo.trim() || undefined,
      region: place.region || undefined,
      zone: place.zone.trim() || undefined,
      woreda: place.woreda.trim() || undefined,
      kebele: kebele.trim() || undefined,
      client_ref: clientRef,
    };
    setSaving(true);
    try {
      if (change) {
        const { client_ref: _r, ...now } = payload;
        const values = changedValues(
          rowToInitial(change.before),
          now as Partial<FeedbackInput>,
        );
        if (Object.keys(values).length === 0) {
          router.back();
          return;
        }
        const sent = await saveChange({
          kind: "feedback_edit",
          label: `Change to feedback — ${name.trim() || "anonymous"}`,
          id: change.id,
          before: change.before,
          after: values,
          body: { values },
          queuedId,
        });
        await queryClient.invalidateQueries({ queryKey: ["feedback"] });
        if (sent === "sent") router.back();
        else setDone("queued");
        return;
      }
      const label = `${FEEDBACK_TYPES.find((t) => t.value === type)?.label ?? "Feedback"} — ${name.trim() || "anonymous"}`;
      setDone(
        await saveOrQueue({ kind: "feedback", label, payload, queuedId }),
      );
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not send the feedback"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done)
    return (
      <SavedNotice
        queued={done === "queued"}
        what={change ? "change" : "feedback"}
        another={!change}
      />
    );

  return (
    <FormScreen
      ref={scroll}
      error={errors.form}
      saveTitle={change ? "Save changes" : "Send the feedback"}
      saving={saving}
      onSave={handleSave}
      steps={{
        titles: ["Intake", "Who and where", "What was said"],
        fields: [
          ["received_date"],
          ["reporter_age", "reporter_contact", "region", "zone", "woreda"],
          ["feedback_type", "description"],
        ],
        check: live.checkStep,
        errors,
      }}
    >
      <FormStep index={0}>
        <FormCard title="Intake">
          <DateField
            label="Date received"
            required
            value={received}
            onChange={(v) => {
              setReceived(v);
              live.touch("received_date");
            }}
            max={todayISO()}
            error={errors.received_date}
          />
          {sources.length > 0 ? (
            <Select
              label="Channel (entry point)"
              value={source}
              options={sources}
              onChange={setSource}
            />
          ) : null}
        </FormCard>
      </FormStep>
      <FormStep index={1}>
        <FormCard
          title="Who raised it"
          hint="All optional: a person may stay anonymous."
        >
          <Field
            label="Reporter name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          {sexes.length > 0 ? (
            <Select
              label="Sex"
              value={sex || undefined}
              options={sexes}
              onChange={setSex}
              placeholder="Select"
            />
          ) : null}
          <Field
            label="Age"
            value={age}
            onChangeText={setAge}
            onBlur={() => live.touch("reporter_age")}
            keyboardType="number-pad"
            error={errors.reporter_age}
          />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            onBlur={() => live.touch("reporter_contact")}
            keyboardType="phone-pad"
            hint="Only if they agree to be called back."
            error={errors.reporter_contact}
          />
        </FormCard>
        <FormCard title="Where">
          <PlaceFields value={place} onChange={setPlace} errors={errors} />
          <Field
            label="Kebele"
            value={kebele}
            onChangeText={setKebele}
            autoCapitalize="words"
          />
        </FormCard>
      </FormStep>
      <FormStep index={2}>
        <FormCard title="What was said">
          <ChoiceRow
            label="Complaint or feedback type"
            required
            value={type}
            options={[...FEEDBACK_TYPES]}
            onChange={(v) => {
              setType(v);
              live.touch("feedback_type");
            }}
            error={errors.feedback_type}
          />
          {categories.length > 0 ? (
            <Select
              label="Category (topic)"
              value={category || undefined}
              options={categories}
              onChange={setCategory}
              placeholder="Select"
            />
          ) : null}
          <Field
            label="Description"
            required
            value={description}
            onChangeText={setDescription}
            onBlur={() => live.touch("description")}
            multiline
            maxLength={2000}
            error={errors.description}
          />
          <Toggle
            label="Wants a response?"
            value={wantsAnswer}
            onChange={setWantsAnswer}
          />
          {priorities.length > 0 ? (
            <Select
              label="Severity"
              value={priority}
              options={priorities}
              onChange={setPriority}
            />
          ) : null}
          {referrals.length > 0 ? (
            <Select
              label="Referred to"
              value={referredTo || undefined}
              options={referrals}
              onChange={setReferredTo}
              placeholder="Not referred"
            />
          ) : (
            <Field
              label="Referred to"
              value={referredTo}
              onChangeText={setReferredTo}
              maxLength={100}
            />
          )}
        </FormCard>
      </FormStep>
    </FormScreen>
  );
}
