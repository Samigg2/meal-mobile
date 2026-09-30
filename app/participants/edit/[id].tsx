import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Heart, IdCard, MapPin, ShieldCheck, User } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getParticipantDetail, updateParticipant } from "@/lib/data";
import type { ParticipantRow } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { shouldQueue } from "@/lib/queue";
import {
  EMPTY,
  OTHER,
  ageOn,
  isRealDate,
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

export default function EditParticipant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["participant-detail", id],
    queryFn: () => getParticipantDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <ListSkeleton rows={3} />;
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
function EditForm({ id, participant }: { id: string; participant: ParticipantRow }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const locations = useLocations();
  const [form, setForm] = useState<FormState>(() => toForm(participant, locations.woredasOf));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const education = useLookupOptions("participants.education_level");
  const marital = useLookupOptions("participants.marital_status");
  const vulnerability = useLookupOptions("participants.vulnerability_category");
  const disability = useLookupOptions("participants.disability_type");
  const settings = useSettings();
  const youthBand = `${settings.youth_min_age}–${settings.youth_max_age}`;
  const zones = locations.zonesOf(form.region);
  const woredas = locations.woredasOf(form.zone);
  // Woreda coverage in reference data is partial, so "Other" lets a woreda that
  // is not listed yet be typed rather than blocking the save.
  const woredaOptions: Option[] = [...woredas, { label: "Other (type it)", value: OTHER }];

  const age = isRealDate(form.date_of_birth) && form.date_of_birth <= todayISO() ? ageOn(form.date_of_birth) : null;
  const isYouth = age !== null && age >= settings.youth_min_age && age <= settings.youth_max_age;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev));
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
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      await updateParticipant(id, toInput(form));
      await queryClient.invalidateQueries({ queryKey: ["participant-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["participants"] });
      router.back();
    } catch (err) {
      if (shouldQueue(err)) {
        showErrors({ form: "No connection. Editing needs internet — try again once you are back online." });
      } else if (err instanceof ApiError) {
        showErrors({ form: err.status === 409 ? err.message : err.problems.join("\n") });
      } else {
        showErrors({ form: "Could not save the changes." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ErrorText>{errors.form}</ErrorText>
        {!locations.loaded ? (
          <Text style={styles.warn}>
            Location and category lists are not on this device yet. Connect once, or use Download for offline on the
            Sync screen.
          </Text>
        ) : null}

        <Section title="Identification" icon={IdCard} description="A National ID or a Kebele ID is required.">
          <Field
            label="Full name"
            required
            value={form.full_name}
            onChangeText={(v) => update("full_name", v)}
            autoCapitalize="words"
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
            error={errors.national_id}
          />
          <Field
            label="Kebele ID"
            value={form.kebele_id}
            onChangeText={(v) => update("kebele_id", v)}
            placeholder="e.g. KB-2023-445"
            autoCapitalize="characters"
            error={errors.kebele_id}
          />
        </Section>

        <Section title="Personal details" icon={User}>
          <DateField
            label="Date of birth"
            required
            value={form.date_of_birth}
            onChange={(v) => update("date_of_birth", v)}
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
            onChange={(v) => update("sex", v)}
            error={errors.sex}
          />
          <Field
            label="Phone"
            required
            value={form.phone}
            onChangeText={(v) => update("phone", v)}
            keyboardType="phone-pad"
            error={errors.phone}
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(v) => update("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
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
            label="Household size"
            value={form.family_size}
            onChangeText={(v) => update("family_size", v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={2}
            error={errors.family_size}
          />
        </Section>

        <Section title="Location" icon={MapPin} description="Where the participant lives.">
          <Select
            label="Region"
            required
            value={form.region}
            options={locations.regions}
            onChange={(v) => setForm((p) => ({ ...p, region: v, zone: "", woreda: "", woreda_other: "" }))}
            placeholder="Select region"
            error={errors.region}
          />
          {zones.length > 0 ? (
            <Select
              label="Zone"
              required
              value={form.zone}
              options={zones}
              onChange={(v) => setForm((p) => ({ ...p, zone: v, woreda: "", woreda_other: "" }))}
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
            onChange={(v) => update("woreda", v)}
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
              autoCapitalize="words"
              error={errors.woreda}
            />
          ) : null}
          <Field label="Kebele" value={form.kebele} onChangeText={(v) => update("kebele", v)} autoCapitalize="words" />
        </Section>

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
              label="Please specify"
              required
              value={form.vulnerability_other}
              onChangeText={(v) => update("vulnerability_other", v)}
              error={errors.vulnerability_other}
            />
          ) : null}
          <Toggle
            label="Participant lives with a disability"
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
                onChange={(v) => update("disability_type", v)}
                placeholder="Select type"
                error={errors.disability_type}
              />
              {form.disability_type === OTHER ? (
                <Field
                  label="Please specify"
                  required
                  value={form.disability_other}
                  onChangeText={(v) => update("disability_other", v)}
                  error={errors.disability_other}
                />
              ) : null}
            </>
          ) : null}
        </Section>

        <Section title="Consent and notes" icon={ShieldCheck}>
          <Toggle
            label="Informed consent obtained *"
            value={form.consent_given}
            onChange={(v) => update("consent_given", v)}
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
      </ScrollView>
      <StickyFooter>
        <Button title="Save changes" onPress={handleSave} loading={saving} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  fieldError: { fontSize: 12, color: colors.danger, fontWeight: "500" },
  warn: { fontSize: 12, color: colors.warning, lineHeight: 18 },
  badgeRow: { flexDirection: "row", marginTop: -spacing.xs },
});
