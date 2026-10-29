import { useRef, useState } from "react";
import { useRegionChoices } from "@/lib/region-lock";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Heart, IdCard, MapPin, ShieldCheck, User } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getParticipantDetail, type ParticipantInput } from "@/lib/data";
import type { ParticipantRow } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { type Targeted } from "@/lib/queue";
import { saveOrQueue, useQueuedPayload } from "@/lib/field-form";
import { SavedNotice } from "@/components/field-form";
import {
  EMPTY,
  OTHER,
  ageOn,
  isRealDate,
  STEP_FIELDS,
  STEPS,
  stepOf,
  todayISO,
  toInput,
  validate,
  yearsAgo,
  type FormErrors,
  type FormState,
} from "@/lib/participant-form";
import { useLocations, useLookupOptions, useSettings, type Option } from "@/lib/reference";
import {
  Badge,
  Button,
  ChoiceRow,
  EmptyState,
  ErrorText,
  Field,
  ListSkeleton,
  Section,
  Select,
  StepBar,
  StickyFooter,
  Text,
  Toggle,
} from "@/components/ui";
import { DateField } from "@/components/date-picker";
import { colors, spacing } from "@/lib/theme";

/**
 * The same shape edited, the same validation as registration
 * (@/lib/participant-form). `woredasOf` decides the same "Other (type it)"
 * split the registration form uses: a stored woreda not in the reference
 * list for its zone goes into woreda_other instead, so it stays editable as
 * free text rather than silently not matching any option.
 */
function toForm(p: ParticipantRow, woredasOf: (zone: string) => Option[]): FormState {
  const zoneWoredas = woredasOf(p.zone ?? "");
  const listed = !p.woreda || zoneWoredas.some((w) => w.value === p.woreda);
  return {
    ...EMPTY,
    full_name: p.full_name,
    national_id: p.national_id ?? "",
    kebele_id: p.kebele_id ?? "",
    date_of_birth: p.date_of_birth ?? "",
    sex: p.sex ?? undefined,
    region: p.region ?? "",
    zone: p.zone ?? "",
    woreda: listed ? (p.woreda ?? "") : OTHER,
    woreda_other: listed ? "" : (p.woreda ?? ""),
    kebele: p.kebele ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    education_level: p.education_level ?? "",
    marital_status: p.marital_status ?? "",
    family_size: p.family_size != null ? String(p.family_size) : "",
    vulnerability_category: p.vulnerability_category ?? "",
    disability: !!p.disability,
    disability_type: p.disability_type ?? "",
    consent_given: p.consent_given,
    notes: p.notes ?? "",
  };
}

/**
 * A change made with no connection waits on the phone as only the fields that
 * changed, so it does not undo what the office changed meanwhile in the
 * others. It keeps the record as it was (`_before`, never sent) so it can be
 * opened again from Sync without a connection.
 */
/**
 * `expected_updated_at`: when the record was last changed as this form saw it, so a
 * change someone made since (while this waited offline) is not overwritten (409).
 */
type QueuedEdit = Targeted<{
  participant: Partial<ParticipantInput>;
  expected_updated_at?: string;
  _before: ParticipantRow;
}>;

/** The fields that differ; a cleared one is sent empty so the server clears it too. */
function changedFields(before: Partial<ParticipantInput>, after: Partial<ParticipantInput>): Partial<ParticipantInput> {
  const changed: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof ParticipantInput>) {
    if (key === "client_ref") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed[key] = after[key] ?? "";
  }
  return changed as Partial<ParticipantInput>;
}

export default function EditParticipant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queued = useQueuedPayload<QueuedEdit>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["participant-detail", id],
    queryFn: () => getParticipantDetail(id),
    enabled: !!id && queued.ready,
  });

  if (!queued.ready || isLoading) return <ListSkeleton rows={3} />;
  // A waiting change opened from Sync, with the change on top of the record as it
  // is now (online), so after "someone else changed it" saving goes over the latest
  // version; offline, the copy the change was made on.
  if (queued.payload) {
    const { _before, participant } = queued.payload;
    return (
      <EditForm id={id} participant={data?.participant ?? _before} pending={participant} queuedId={queued.queuedId} />
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load the participant"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  return <EditForm id={id} participant={data.participant} />;
}

/**
 * Mounted only once the record has loaded, so its form state initializes from
 * the real data in one pass — no effect needed to fill it in after the fact.
 */
function EditForm({
  id,
  participant,
  pending,
  queuedId,
}: {
  id: string;
  participant: ParticipantRow;
  /** The waiting change, when opened from Sync. */
  pending?: Partial<ParticipantInput>;
  queuedId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const locations = useLocations();
  const [form, setForm] = useState<FormState>(() =>
    toForm({ ...participant, ...(pending as Partial<ParticipantRow>) }, locations.woredasOf),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [queuedNotice, setQueuedNotice] = useState(false);

  const education = useLookupOptions("participants.education_level");
  const marital = useLookupOptions("participants.marital_status");
  const vulnerability = useLookupOptions("participants.vulnerability_category");
  const disability = useLookupOptions("participants.disability_type");
  const settings = useSettings();
  const youthBand = `${settings.youth_min_age}–${settings.youth_max_age}`;
  const regionChoices = useRegionChoices(form.region);
  // A cluster's own region is filled in for it, as on the web (set while
  // rendering, React's way to adjust state from what was just read).
  if (regionChoices.locked && !form.region) setForm((p) => (p.region ? p : { ...p, region: regionChoices.locked! }));
  const zones = locations.zonesOf(form.region);
  const woredas = locations.woredasOf(form.zone);
  // Woreda coverage in reference data is partial, so "Other" lets a woreda that
  // is not listed yet be typed rather than blocking the save.
  const woredaOptions: Option[] = [...woredas, { label: "Other (type it)", value: OTHER }];

  const age = isRealDate(form.date_of_birth) && form.date_of_birth <= todayISO() ? ageOn(form.date_of_birth) : null;
  const isYouth = age !== null && age >= settings.youth_min_age && age <= settings.youth_max_age;

  /** The web's rules for one field, shown when it is left or picked (not only on Save). */
  function checkField(key: keyof FormState, next: FormState = form) {
    const found = validate(next, woredas.length > 0, settings);
    const keys: (keyof FormState)[] = key === "national_id" || key === "kebele_id" ? ["national_id", "kebele_id"] : [key];
    setErrors((prev) => {
      const out = { ...prev, form: undefined };
      for (const k of keys) out[k] = found[k];
      return out;
    });
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K], check = false) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (check) {
      checkField(key, { ...form, [key]: value });
      return;
    }
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev));
  }

  function goToStep(next: number) {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function goNext() {
    const found = validate(form, woredas.length > 0, settings) as Record<string, string>;
    const here = Object.fromEntries(Object.entries(found).filter(([k]) => STEP_FIELDS[step].includes(k)));
    if (Object.keys(here).length > 0) {
      showErrors(here as FormErrors);
      return;
    }
    setErrors({});
    goToStep(step + 1);
  }

  function showErrors(found: FormErrors) {
    setErrors(found);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  async function handleSave() {
    const found = validate(form, woredas.length > 0, settings);
    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      showErrors({
        ...found,
        form: `${count} thing${count === 1 ? "" : "s"} to fix before saving. Check the fields marked in red.`,
      });
      const bad = stepOf(found);
      if (bad >= 0) setStep(bad);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const changes = changedFields(toInput(toForm(participant, locations.woredasOf)), toInput(form));
      if (Object.keys(changes).length === 0) {
        router.back();
        return;
      }
      const payload: QueuedEdit = {
        participant: changes,
        expected_updated_at: participant.updated_at,
        _target: id,
        _before: participant,
      };
      const result = await saveOrQueue({
        kind: "participant_edit",
        label: `Change to ${participant.full_name}`,
        payload,
        queuedId,
      });
      if (result === "queued") {
        setQueuedNotice(true);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["participant-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["participants"] });
      router.back();
    } catch (err) {
      if (err instanceof ApiError) {
        showErrors({ form: err.status === 409 ? err.message : err.problems.join("\n") });
      } else {
        showErrors({ form: "Could not save the changes." });
      }
    } finally {
      setSaving(false);
    }
  }

  if (queuedNotice) return <SavedNotice queued what="change" another={false} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <StepBar steps={STEPS} step={step} onStep={goToStep} />
        <ErrorText>{errors.form}</ErrorText>
        {!locations.loaded ? (
          <Text style={styles.warn}>
            Location and category lists are not on this device yet. Connect once, or use Download for offline on the
            Sync screen.
          </Text>
        ) : null}

        {step === 0 ? (
        <Section title="Identification" icon={IdCard} description="A National ID or a Kebele ID is required.">
          <Field
            label="Full name"
            required
            value={form.full_name}
            onChangeText={(v) => update("full_name", v)}
            autoCapitalize="words"
            onBlur={() => checkField("full_name")}
            error={errors.full_name}
          />
          <Field
            label="National ID (Fayida)"
            value={form.national_id}
            onChangeText={(v) => update("national_id", v.replace(/\s/g, ""))}
            placeholder="12-character number"
            maxLength={12}
            autoCapitalize="characters"
            hint="Changing this is checked again for duplicates, the same as registration."
            onBlur={() => checkField("national_id")}
            error={errors.national_id}
          />
          <Field
            label="Kebele ID"
            value={form.kebele_id}
            onChangeText={(v) => update("kebele_id", v)}
            placeholder="e.g. KB-2023-445"
            autoCapitalize="characters"
            onBlur={() => checkField("kebele_id")}
            error={errors.kebele_id}
          />
        </Section>
        ) : null}

        {step === 1 ? (
        <Section title="Personal details" icon={User}>
          <DateField
            label="Date of birth"
            required
            value={form.date_of_birth}
            onChange={(v) => update("date_of_birth", v, true)}
            min={yearsAgo(settings.participant_max_age)}
            max={yearsAgo(settings.participant_min_age)}
            initialYear={new Date().getFullYear() - 22}
            error={errors.date_of_birth}
            hint={age !== null && !errors.date_of_birth ? `Age ${age}` : undefined}
          />
          {age !== null && !errors.date_of_birth ? (
            <View style={styles.badgeRow}>
              <Badge
                text={isYouth ? `Youth (${youthBand})` : `Outside the youth band (${youthBand})`}
                tone={isYouth ? "success" : "warning"}
              />
            </View>
          ) : null}
          <ChoiceRow
            label="Sex"
            required
            value={form.sex}
            options={[
              { label: "Female", value: "female" },
              { label: "Male", value: "male" },
            ]}
            onChange={(v) => update("sex", v, true)}
            error={errors.sex}
          />
          <Field
            label="Phone"
            required
            value={form.phone}
            onChangeText={(v) => update("phone", v)}
            keyboardType="phone-pad"
            onBlur={() => checkField("phone")}
            error={errors.phone}
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(v) => update("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            onBlur={() => checkField("email")}
            error={errors.email}
          />
          <Select
            label="Education level"
            value={form.education_level}
            options={education}
            onChange={(v) => update("education_level", v)}
            placeholder="Select education level"
          />
          <Select
            label="Marital status"
            value={form.marital_status}
            options={marital}
            onChange={(v) => update("marital_status", v)}
            placeholder="Select marital status"
          />
          <Field
            label="Family size"
            value={form.family_size}
            onChangeText={(v) => update("family_size", v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={2}
            onBlur={() => checkField("family_size")}
            error={errors.family_size}
          />
        </Section>
        ) : null}

        {step === 2 ? (
        <Section title="Location" icon={MapPin}>
          <Select
            label="Region"
            required
            value={form.region}
            options={regionChoices.regions}
            onChange={(v) => {
              setForm((p) => ({ ...p, region: v, zone: "", woreda: "", woreda_other: "" }));
              checkField("region", { ...form, region: v, zone: "", woreda: "", woreda_other: "" });
            }}
            placeholder="Select region"
            error={errors.region}
          />
          {zones.length > 0 ? (
            <Select
              label="Zone"
              required
              value={form.zone}
              options={zones}
              onChange={(v) => {
                setForm((p) => ({ ...p, zone: v, woreda: "", woreda_other: "" }));
                checkField("zone", { ...form, zone: v, woreda: "", woreda_other: "" });
              }}
              placeholder={form.region ? "Select zone" : "Select the region first"}
              disabled={!form.region}
              error={errors.zone}
            />
          ) : (
            <Field
              label="Zone"
              required
              value={form.zone}
              onChangeText={(v) => update("zone", v)}
              autoCapitalize="words"
              error={errors.zone}
            />
          )}
          <Select
            label="Woreda"
            required
            value={form.woreda}
            options={woredaOptions}
            onChange={(v) => update("woreda", v, true)}
            placeholder={form.zone ? "Select woreda" : "Select the zone first"}
            disabled={!form.zone}
            error={form.woreda === OTHER ? undefined : errors.woreda}
          />
          {form.woreda === OTHER ? (
            <Field
              label="Woreda name"
              required
              value={form.woreda_other}
              onChangeText={(v) => update("woreda_other", v)}
              onBlur={() => checkField("woreda")}
              autoCapitalize="words"
              error={errors.woreda}
            />
          ) : null}
          <Field label="Kebele" value={form.kebele} onChangeText={(v) => update("kebele", v)} autoCapitalize="words" />
        </Section>
        ) : null}

        {step === 3 ? (
        <Section title="Inclusion" icon={Heart}>
          <Select
            label="Vulnerability category"
            value={form.vulnerability_category}
            options={vulnerability}
            onChange={(v) => update("vulnerability_category", v)}
            placeholder="Select category"
          />
          {form.vulnerability_category === OTHER ? (
            <Field
              label="Other vulnerability category"
              required
              value={form.vulnerability_other}
              onChangeText={(v) => update("vulnerability_other", v)}
              onBlur={() => checkField("vulnerability_other")}
              error={errors.vulnerability_other}
            />
          ) : null}
          <Toggle
            label="Disability"
            value={form.disability}
            onChange={(v) => update("disability", v)}
          />
          {form.disability ? (
            <>
              <Select
                label="Disability type"
                required
                value={form.disability_type}
                options={disability}
                onChange={(v) => update("disability_type", v, true)}
                placeholder="Select type"
                error={errors.disability_type}
              />
              {form.disability_type === OTHER ? (
                <Field
                  label="Other disability"
                  required
                  value={form.disability_other}
                  onChangeText={(v) => update("disability_other", v)}
                  onBlur={() => checkField("disability_other")}
                  error={errors.disability_other}
                />
              ) : null}
            </>
          ) : null}
        </Section>
        ) : null}

        {step === 4 ? (
        <Section title="Consent and notes" icon={ShieldCheck}>
          <Text style={styles.consentNote}>
            {"Personal data is collected under Ethiopia's Personal Data Protection Proclamation No. 1321/2024. " +
              "Before ticking, explain the purpose of the programme, how the data will be used and kept, and that " +
              "the participant can withdraw consent at any time without losing services."}
          </Text>
          <Toggle
            label="Consent given *"
            value={form.consent_given}
            onChange={(v) => update("consent_given", v, true)}
          />
          {errors.consent_given ? <Text style={styles.fieldError}>{errors.consent_given}</Text> : null}
          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(v) => update("notes", v)}
            placeholder="Additional notes"
            multiline
          />
        </Section>
        ) : null}
      </ScrollView>
      <StickyFooter>
        <View style={styles.footerRow}>
          {step > 0 ? (
            <View style={styles.grow}>
              <Button title="Back" variant="outline" onPress={() => goToStep(step - 1)} />
            </View>
          ) : null}
          <View style={styles.grow}>
            {step < STEPS.length - 1 ? (
              <Button title="Next step" onPress={goNext} />
            ) : (
              <Button title="Save changes" onPress={handleSave} loading={saving} />
            )}
          </View>
        </View>
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  footerRow: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  consentNote: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  fieldError: { fontSize: 12, color: colors.danger, fontWeight: "500" },
  warn: { fontSize: 12, color: colors.warning, lineHeight: 18 },
  badgeRow: { flexDirection: "row", marginTop: -spacing.xs },
});
