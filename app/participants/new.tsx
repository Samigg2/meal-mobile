import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  checkParticipantDuplicate,
  createParticipant,
  type ParticipantInput,
} from "@/lib/data";
import { enqueue, shouldQueue } from "@/lib/queue";
import { Button, Card, ChoiceRow, ErrorText, Field, Section, Select, Toggle } from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";

/**
 * Participant registration, matching the web form field for field. If the device
 * is offline the record is queued locally and uploaded from the sync screen, so
 * field work is never blocked by connectivity.
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

const EDUCATION = [
  { label: "None", value: "none" },
  { label: "Primary", value: "primary" },
  { label: "Secondary", value: "secondary" },
  { label: "TVET", value: "tvet" },
  { label: "University", value: "university" },
];
const MARITAL = [
  { label: "Single", value: "single" },
  { label: "Married", value: "married" },
  { label: "Divorced", value: "divorced" },
  { label: "Widowed", value: "widowed" },
];
const VULNERABILITY = [
  { label: "None", value: "none" },
  { label: "Returnee", value: "returnee" },
  { label: "IDP", value: "idp" },
  { label: "Refugee", value: "refugee" },
  { label: "Female-headed household", value: "female_headed_household" },
  { label: "Orphan", value: "orphan" },
  { label: "Other", value: "other" },
];
const DISABILITY = [
  { label: "Visual", value: "visual" },
  { label: "Hearing", value: "hearing" },
  { label: "Physical", value: "physical" },
  { label: "Intellectual", value: "intellectual" },
  { label: "Multiple", value: "multiple" },
  { label: "Other", value: "other" },
];

const PHONE = /^(?:\+251|0)[79]\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const todayISO = () => new Date().toISOString().slice(0, 10);

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

type Errors = Partial<Record<keyof FormState | "form", string>>;

/** The same rules the API applies, so the field officer sees them before submitting. */
function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.full_name.trim()) errors.full_name = "Full name is required.";

  if (!form.national_id.trim() && !form.kebele_id.trim()) {
    errors.national_id = "Enter a National ID or a Kebele ID.";
    errors.kebele_id = "Enter a National ID or a Kebele ID.";
  } else if (form.national_id.trim() && form.national_id.trim().length !== 12) {
    errors.national_id = "A National ID has 12 characters.";
  }

  if (!form.date_of_birth) errors.date_of_birth = "Date of birth is required.";
  else if (!isRealDate(form.date_of_birth)) errors.date_of_birth = "Use the format YYYY-MM-DD.";
  else if (form.date_of_birth > todayISO()) errors.date_of_birth = "Date of birth cannot be in the future.";

  if (!form.sex) errors.sex = "Select the participant's sex.";
  if (!form.woreda.trim()) errors.woreda = "Woreda is required.";

  if (!form.phone.trim()) errors.phone = "Phone is required.";
  else if (!PHONE.test(form.phone.replace(/[\s-]/g, "")))
    errors.phone = "Use 0912345678 or +251912345678.";

  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = "Enter a valid email address.";

  if (form.family_size.trim()) {
    const n = Number(form.family_size);
    if (!Number.isInteger(n) || n < 0 || n > 50) errors.family_size = "Enter a whole number from 0 to 50.";
  }

  if (form.disability && !form.disability_type) errors.disability_type = "Select the type of disability.";
  return errors;
}

/** Builds the API body: empty optional fields are left out rather than sent as "". */
function toInput(form: FormState): ParticipantInput {
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  const vulnerability =
    form.vulnerability_category === "other"
      ? (text(form.vulnerability_other) ?? "other")
      : form.vulnerability_category === "none"
        ? undefined
        : text(form.vulnerability_category);
  const disabilityType = !form.disability
    ? undefined
    : form.disability_type === "other"
      ? (text(form.disability_other) ?? "other")
      : text(form.disability_type);

  return {
    full_name: form.full_name.trim(),
    status: "active",
    national_id: text(form.national_id),
    kebele_id: text(form.kebele_id),
    date_of_birth: form.date_of_birth,
    sex: form.sex as "male" | "female",
    region: text(form.region),
    zone: text(form.zone),
    woreda: form.woreda.trim(),
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
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev));
  }

  async function handleSave() {
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors({ ...found, form: "Some details need attention. Check the fields marked in red." });
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const input = toInput(form);
    setSaving(true);
    setErrors({});
    try {
      // A failed check must not block registration; only a lost connection
      // sends the record to the offline queue.
      try {
        const dup = await checkParticipantDuplicate({
          national_id: input.national_id,
          kebele_id: input.kebele_id,
          phone: input.phone,
          full_name: input.full_name,
          date_of_birth: input.date_of_birth,
        });
        if (dup.isDuplicate) {
          setErrors({
            form: `This participant appears to be registered already (${dup.match?.full_name} · ${dup.match?.participant_id}).`,
          });
          scroll.current?.scrollTo({ y: 0, animated: true });
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
        setNotice("You are offline: this registration is saved on the device and will upload when you sync.");
      } else {
        setErrors({ form: err instanceof Error ? err.message : "Could not save the participant" });
        scroll.current?.scrollTo({ y: 0, animated: true });
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
            <Text style={styles.noticeIconText}>✓</Text>
          </View>
          <Text style={styles.noticeTitle}>Saved on this device</Text>
          <Text style={styles.noticeText}>{notice}</Text>
          <Button title="Done" onPress={() => router.back()} />
          <Button
            title="Register another"
            variant="outline"
            onPress={() => {
              setNotice(null);
              setForm(EMPTY);
            }}
          />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ErrorText>{errors.form}</ErrorText>

        <Section title="Identification" icon="id-card-outline" description="A National ID or a Kebele ID is required.">
          <Field
            label="Full name"
            required
            value={form.full_name}
            onChangeText={(v) => update("full_name", v)}
            placeholder="Full name"
            autoCapitalize="words"
            error={errors.full_name}
          />
          <Field
            label="National ID"
            value={form.national_id}
            onChangeText={(v) => update("national_id", v.replace(/\s/g, ""))}
            placeholder="12-character Fayida number"
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

        <Section title="Personal details" icon="person-outline">
          <Field
            label="Date of birth"
            required
            value={form.date_of_birth}
            onChangeText={(v) => update("date_of_birth", maskDate(v))}
            placeholder="YYYY-MM-DD"
            keyboardType="number-pad"
            maxLength={10}
            error={errors.date_of_birth}
          />
          <ChoiceRow
            label="Sex"
            required
            value={form.sex}
            options={[
              { label: "Male", value: "male" },
              { label: "Female", value: "female" },
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
            error={errors.email}
          />
          <Select
            label="Education level"
            value={form.education_level}
            options={EDUCATION}
            onChange={(v) => update("education_level", v)}
            placeholder="Select education level"
          />
          <Select
            label="Marital status"
            value={form.marital_status}
            options={MARITAL}
            onChange={(v) => update("marital_status", v)}
            placeholder="Select marital status"
          />
          <Field
            label="Family size"
            value={form.family_size}
            onChangeText={(v) => update("family_size", v.replace(/\D/g, ""))}
            placeholder="e.g. 5"
            keyboardType="number-pad"
            maxLength={2}
            error={errors.family_size}
          />
        </Section>

        <Section title="Location" icon="location-outline">
          <Field label="Region" value={form.region} onChangeText={(v) => update("region", v)} autoCapitalize="words" />
          <Field label="Zone" value={form.zone} onChangeText={(v) => update("zone", v)} autoCapitalize="words" />
          <Field
            label="Woreda"
            required
            value={form.woreda}
            onChangeText={(v) => update("woreda", v)}
            autoCapitalize="words"
            error={errors.woreda}
          />
          <Field label="Kebele" value={form.kebele} onChangeText={(v) => update("kebele", v)} autoCapitalize="words" />
        </Section>

        <Section title="Inclusion" icon="heart-outline">
          <Select
            label="Vulnerability category"
            value={form.vulnerability_category}
            options={VULNERABILITY}
            onChange={(v) => update("vulnerability_category", v)}
            placeholder="Select category"
          />
          {form.vulnerability_category === "other" ? (
            <Field
              label="Please specify"
              value={form.vulnerability_other}
              onChangeText={(v) => update("vulnerability_other", v)}
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
                options={DISABILITY}
                onChange={(v) => update("disability_type", v)}
                placeholder="Select type"
                error={errors.disability_type}
              />
              {form.disability_type === "other" ? (
                <Field
                  label="Please specify"
                  value={form.disability_other}
                  onChangeText={(v) => update("disability_other", v)}
                />
              ) : null}
            </>
          ) : null}
        </Section>

        <Section title="Consent and notes" icon="shield-checkmark-outline">
          <Text style={styles.consentNote}>
            {"Personal data is collected under Ethiopia's Personal Data Protection Proclamation No. 1321/2024. " +
              "Record consent only after explaining how the data will be used. A seven-year retention date is set automatically."}
          </Text>
          <Toggle
            label="Informed consent obtained for processing personal data"
            value={form.consent_given}
            onChange={(v) => update("consent_given", v)}
          />
          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(v) => update("notes", v)}
            placeholder="Additional notes"
            multiline
          />
        </Section>

        <Button title="Register participant" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  consentNote: { fontSize: 12, color: colors.muted, lineHeight: 18 },
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
  noticeIconText: { fontSize: 26, color: colors.success, fontWeight: "700" },
  noticeTitle: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" },
  noticeText: { fontSize: 13, color: colors.muted, lineHeight: 19, textAlign: "center" },
});
