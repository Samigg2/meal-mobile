import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { CircleCheck, Heart, IdCard, MapPin, ShieldCheck, User } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  checkParticipantDuplicate,
  createParticipant,
  type ParticipantInput,
} from "@/lib/data";
import { ApiError } from "@/lib/api";
import { enqueue, shouldQueue } from "@/lib/queue";
import { useLocations, useLookupOptions, type Option } from "@/lib/reference";
import {
  Badge,
  Button,
  Card,
  ChoiceRow,
  ErrorText,
  Field,
  Section,
  Select,
  StickyFooter,
  Text,
  Toggle,
} from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";

/**
 * Participant registration. The same rules as the web form and the API
 * (participants.schemas.ts), checked here first so a field officer can fix
 * everything before submitting — including offline, where the server cannot be
 * asked. Every list comes from reference data cached on the device.
 */

interface FormState {
  full_name: string;
  national_id: string;
  kebele_id: string;
  date_of_birth: string;
  sex: "male" | "female" | undefined;
  region: string;
  zone: string;
  woreda: string;
  /** Typed when the woreda is not in the reference list yet. */
  woreda_other: string;
  kebele: string;
  phone: string;
  email: string;
  education_level: string;
  marital_status: string;
  family_size: string;
  vulnerability_category: string;
  /** Free text, used when the category is "other". */
  vulnerability_other: string;
  disability: boolean;
  disability_type: string;
  disability_other: string;
  consent_given: boolean;
  notes: string;
}

const EMPTY: FormState = {
  full_name: "",
  national_id: "",
  kebele_id: "",
  date_of_birth: "",
  sex: undefined,
  region: "",
  zone: "",
  woreda: "",
  woreda_other: "",
  kebele: "",
  phone: "",
  email: "",
  education_level: "",
  marital_status: "",
  family_size: "",
  vulnerability_category: "",
  vulnerability_other: "",
  disability: false,
  disability_type: "",
  disability_other: "",
  consent_given: false,
  notes: "",
};

const OTHER = "other";
const PHONE = /^(?:\+251|0)[79]\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Plausible ages (data quality, not eligibility) — the API applies the same bounds. */
const MIN_AGE = 10;
const MAX_AGE = 100;
/** The programme's youth band, shown as a hint; the database sets is_youth itself. */
const YOUTH_MAX = 35;

const todayISO = () => new Date().toISOString().slice(0, 10);

function newRef(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Types digits and inserts the dashes, so a date is always YYYY-MM-DD. */
function maskDate(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function ageOn(dob: string, on = todayISO()): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = on.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

type Errors = Partial<Record<keyof FormState | "form", string>>;

/** The rules the API applies, so the field officer sees them before submitting. */
function validate(form: FormState, woredaListed: boolean): Errors {
  const errors: Errors = {};
  if (!form.full_name.trim()) errors.full_name = "Full name is required.";
  else if (form.full_name.trim().split(/\s+/).length < 2) {
    errors.full_name = "Enter the full name (given name and father's name).";
  }

  if (!form.national_id.trim() && !form.kebele_id.trim()) {
    errors.national_id = "Enter a National ID or a Kebele ID.";
    errors.kebele_id = "Enter a National ID or a Kebele ID.";
  } else if (form.national_id.trim() && form.national_id.trim().length !== 12) {
    errors.national_id = "A National ID has 12 characters.";
  }

  if (!form.date_of_birth) errors.date_of_birth = "Date of birth is required.";
  else if (!isRealDate(form.date_of_birth)) errors.date_of_birth = "Enter a real date as YYYY-MM-DD.";
  else if (form.date_of_birth > todayISO()) errors.date_of_birth = "Date of birth cannot be in the future.";
  else {
    const age = ageOn(form.date_of_birth);
    if (age < MIN_AGE || age > MAX_AGE) {
      errors.date_of_birth = `An age of ${age} is outside ${MIN_AGE} to ${MAX_AGE}. Check the date.`;
    }
  }

  if (!form.sex) errors.sex = "Select the participant's sex.";

  if (!form.region) errors.region = "Region is required.";
  if (!form.zone.trim()) errors.zone = "Zone is required.";
  if (!form.woreda || (form.woreda === OTHER && !form.woreda_other.trim())) {
    errors.woreda = woredaListed ? "Woreda is required." : "Type the woreda.";
  }

  if (!form.phone.trim()) errors.phone = "Phone is required.";
  else if (!PHONE.test(form.phone.replace(/[\s-]/g, ""))) errors.phone = "Use 0912345678 or +251912345678.";

  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = "Enter a valid email address.";

  if (form.family_size.trim()) {
    const n = Number(form.family_size);
    if (!Number.isInteger(n) || n < 1 || n > 50) errors.family_size = "Enter a whole number from 1 to 50.";
  }

  if (form.vulnerability_category === OTHER && !form.vulnerability_other.trim()) {
    errors.vulnerability_other = "Describe the category.";
  }
  if (form.disability && !form.disability_type) errors.disability_type = "Select the type of disability.";
  if (form.disability && form.disability_type === OTHER && !form.disability_other.trim()) {
    errors.disability_other = "Describe the disability.";
  }

  if (!form.consent_given) {
    errors.consent_given = "Informed consent is required before registering anyone.";
  }
  return errors;
}

/** Builds the API body: empty optional fields are left out rather than sent as "". */
function toInput(form: FormState, clientRef: string): ParticipantInput {
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  const vulnerability =
    form.vulnerability_category === OTHER
      ? text(form.vulnerability_other)
      : form.vulnerability_category === "none"
        ? undefined
        : text(form.vulnerability_category);
  const disabilityType = !form.disability
    ? undefined
    : form.disability_type === OTHER
      ? text(form.disability_other)
      : text(form.disability_type);

  return {
    client_ref: clientRef,
    full_name: form.full_name.trim().replace(/\s+/g, " "),
    status: "active",
    national_id: text(form.national_id),
    kebele_id: text(form.kebele_id),
    date_of_birth: form.date_of_birth,
    sex: form.sex as "male" | "female",
    region: form.region,
    zone: form.zone.trim(),
    woreda: form.woreda === OTHER ? form.woreda_other.trim() : form.woreda,
    kebele: text(form.kebele),
    phone: form.phone.replace(/[\s-]/g, ""),
    email: text(form.email),
    disability: form.disability,
    disability_type: disabilityType,
    education_level: text(form.education_level),
    marital_status: text(form.marital_status),
    family_size: form.family_size.trim() ? Number(form.family_size) : undefined,
    vulnerability_category: vulnerability,
    consent_given: form.consent_given,
    consent_version: form.consent_given ? "v1" : undefined,
    notes: text(form.notes),
  };
}

export default function NewParticipant() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  // One reference per registration, kept across retries, so a replayed offline
  // submission is recognised by the server instead of creating the person twice.
  const [clientRef, setClientRef] = useState(newRef);
  const [errors, setErrors] = useState<Errors>({});
  const [existing, setExisting] = useState<{ id: string; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const education = useLookupOptions("participants.education_level");
  const marital = useLookupOptions("participants.marital_status");
  const vulnerability = useLookupOptions("participants.vulnerability_category");
  const disability = useLookupOptions("participants.disability_type");
  const locations = useLocations();
  const zones = locations.zonesOf(form.region);
  const woredas = locations.woredasOf(form.zone);
  // Woreda coverage in reference data is partial, so "Other" lets a woreda that
  // is not listed yet be typed rather than blocking the registration.
  const woredaOptions: Option[] = [...woredas, { label: "Other (type it)", value: OTHER }];

  const age = isRealDate(form.date_of_birth) && form.date_of_birth <= todayISO() ? ageOn(form.date_of_birth) : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev));
    setExisting(null);
  }

  function showErrors(found: Errors) {
    setErrors(found);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function startAnother() {
    setNotice(null);
    setForm(EMPTY);
    setErrors({});
    setExisting(null);
    setClientRef(newRef());
  }

  async function handleSave() {
    const found = validate(form, woredas.length > 0);
    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      showErrors({ ...found, form: `${count} thing${count === 1 ? "" : "s"} to fix before saving. Check the fields marked in red.` });
      return;
    }

    const input = toInput(form, clientRef);
    setSaving(true);
    setErrors({});
    try {
      // A failed check must not block registration; only a lost connection
      // sends the record to the offline queue. The server checks again anyway.
      try {
        const dup = await checkParticipantDuplicate({
          national_id: input.national_id,
          kebele_id: input.kebele_id,
          phone: input.phone,
          full_name: input.full_name,
          date_of_birth: input.date_of_birth,
        });
        if (dup.isDuplicate && dup.match) {
          setExisting({ id: dup.match.id, label: `${dup.match.full_name} · ${dup.match.participant_id}` });
          showErrors({ form: "This person appears to be registered already." });
          return;
        }
      } catch (err) {
        if (shouldQueue(err)) throw err;
      }

      await createParticipant(input);
      await queryClient.invalidateQueries({ queryKey: ["participants"] });
      router.back();
    } catch (err) {
      if (shouldQueue(err)) {
        await enqueue({ kind: "participant", label: `Participant — ${input.full_name}`, payload: input });
        setNotice(
          "You are offline: this registration is saved on the device and uploads when you sync. The server checks it for duplicates on upload.",
        );
      } else if (err instanceof ApiError && err.status === 409) {
        const match = (err.details as { match?: { id: string; full_name: string; participant_id: string } })?.match;
        if (match) setExisting({ id: match.id, label: `${match.full_name} · ${match.participant_id}` });
        showErrors({ form: err.message });
      } else {
        showErrors({ form: err instanceof ApiError ? err.problems.join("\n") : "Could not save the participant" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (notice) {
    return (
      <View style={styles.noticeWrap}>
        <Card style={styles.notice}>
          <View style={styles.noticeIcon}>
            <CircleCheck size={30} color={colors.success} strokeWidth={2.4} />
          </View>
          <Text style={styles.noticeTitle}>Saved on this device</Text>
          <Text style={styles.noticeText}>{notice}</Text>
          <Button title="Done" onPress={() => router.back()} />
          <Button title="Register another" variant="outline" onPress={startAnother} />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ErrorText>{errors.form}</ErrorText>
        {existing ? (
          <Card style={styles.existing}>
            <Text style={styles.existingText}>Already on the register: {existing.label}</Text>
            <Button
              title="Open the existing record"
              variant="outline"
              onPress={() => router.replace({ pathname: "/participants/[id]", params: { id: existing.id } })}
            />
          </Card>
        ) : null}
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
            placeholder="Given name, father's name, grandfather's name"
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
            error={errors.national_id}
          />
          <Field
            label="Kebele ID"
            value={form.kebele_id}
            onChangeText={(v) => update("kebele_id", v)}
            placeholder="e.g. KB-2023-445"
            autoCapitalize="characters"
            hint="Required if there is no National ID. Attach a scan later from the participant's record."
            error={errors.kebele_id}
          />
        </Section>

        <Section title="Personal details" icon={User}>
          <Field
            label="Date of birth"
            required
            value={form.date_of_birth}
            onChangeText={(v) => update("date_of_birth", maskDate(v))}
            placeholder="YYYY-MM-DD"
            keyboardType="number-pad"
            maxLength={10}
            error={errors.date_of_birth}
            hint={age !== null && !errors.date_of_birth ? `Age ${age}` : undefined}
          />
          {age !== null && !errors.date_of_birth ? (
            <View style={styles.badgeRow}>
              <Badge
                text={age <= YOUTH_MAX && age >= 15 ? `Youth (15–${YOUTH_MAX})` : `Outside the youth band (15–${YOUTH_MAX})`}
                tone={age <= YOUTH_MAX && age >= 15 ? "success" : "warning"}
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
            placeholder="e.g. 0912345678"
            keyboardType="phone-pad"
            error={errors.phone}
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(v) => update("email", v)}
            placeholder="Email address"
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
            placeholder="e.g. 5"
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
              hint={form.region ? "No zones listed for this region yet: type it." : undefined}
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
          <Text style={styles.consentNote}>
            {"Personal data is collected under Ethiopia's Personal Data Protection Proclamation No. 1321/2024. " +
              "Before ticking, explain the purpose of the programme, how the data will be used and kept, and that " +
              "the participant can withdraw consent at any time without losing services. A seven-year retention " +
              "date is set automatically."}
          </Text>
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
        <Button title="Register participant" onPress={handleSave} loading={saving} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  consentNote: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  fieldError: { fontSize: 12, color: colors.danger, fontWeight: "500" },
  warn: { fontSize: 12, color: colors.warning, lineHeight: 18 },
  badgeRow: { flexDirection: "row", marginTop: -spacing.xs },
  existing: { gap: spacing.sm, borderColor: colors.warning, borderWidth: 1 },
  existingText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  noticeWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background },
  notice: { gap: spacing.md, alignItems: "stretch" },
  noticeIcon: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeTitle: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" },
  noticeText: { fontSize: 13, color: colors.muted, lineHeight: 19, textAlign: "center" },
});
