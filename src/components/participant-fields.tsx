import type { Dispatch, ReactNode, SetStateAction } from "react";
import { StyleSheet, View } from "react-native";
import { Heart, Home, IdCard, MapPin, ShieldCheck, Sprout, User } from "lucide-react-native";
import { Badge, ChoiceRow, ErrorText, Field, Section, Select, Text, Toggle } from "@/components/ui";
import { DateField, formatDate } from "@/components/date-picker";
import { GpsField } from "@/components/field-form";
import { useRegionChoices } from "@/lib/region-lock";
import { useLocations, useLookupOptions, useSettings } from "@/lib/reference";
import { useLeadFirms } from "@/lib/lead-firms";
import { useClusters } from "@/lib/clusters";
import { useAuth } from "@/lib/auth";
import {
  EDUCATION_OTHER,
  NO_STUDY_LEVELS,
  OTHER,
  PREFERENCES,
  TARGET_STATUSES,
  YES_NO,
  ageOn,
  isRealDate,
  todayISO,
  yearsAgo,
  type FormErrors,
  type FormState,
  type YesNo,
} from "@/lib/participant-form";
import { colors, spacing } from "@/lib/theme";

/**
 * The DMIS F01 participant fields, one step at a time, shared by registration
 * and editing so the two screens cannot drift apart. Every list comes from
 * reference data cached on the device, as on the web.
 */
export function ParticipantFields({
  step,
  form,
  setForm,
  update,
  checkField,
  errors,
  identitySlot,
  consentLocked = false,
  editing = false,
}: {
  /** 0-based step (STEPS in participant-form). */
  step: number;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  update: <K extends keyof FormState>(key: K, value: FormState[K], check?: boolean) => void;
  checkField: (key: keyof FormState, next?: FormState) => void;
  errors: FormErrors;
  /** Registration: the Fayida verification block, shown under the number. */
  identitySlot?: ReactNode;
  /** Edit: consent is withdrawn from the record's page, not unticked here. */
  consentLocked?: boolean;
  /** Edit: the cluster is shown, not chosen (a reviewer moves a record). */
  editing?: boolean;
}) {
  const education = useLookupOptions("participants.education_level");
  const marital = useLookupOptions("participants.marital_status");
  const study = useLookupOptions("participants.field_of_study");
  const impairments = useLookupOptions("participants.disability_type");
  const residence = useLookupOptions("participants.residence_type");
  const agri = useLookupOptions("participants.agri_experience");
  const sectors = useLookupOptions("participants.priority_sector");
  const locations = useLocations();
  const settings = useSettings();
  const wage = form.employment_preference === "wage";
  const { leadFirms, isLoading: leadFirmsLoading } = useLeadFirms(wage);
  const regionChoices = useRegionChoices(form.region);
  // F01-1 / F01-13 (backend 0137): "No Fayida" is an administrator's answer;
  // a national user chooses the cluster, anyone else's is their own.
  const { can, isGlobalScope, profile } = useAuth();
  const mayAdminister = can("admin", "write");
  const fayidaOptions = mayAdminister || form.has_fayida === "no" ? YES_NO : YES_NO.filter((o) => o.value === "yes");
  const { clusters } = useClusters();
  const chooseCluster = isGlobalScope && !editing;
  const clusterOptions = clusters.filter((c) => !form.region || !c.region || c.region === form.region);
  const shownClusterId = form.organization_id || profile?.organization_id || "";
  const shownCluster = clusters.find((c) => c.value === shownClusterId)?.label ?? "Your cluster";
  // A cluster's own region is filled in for it, as on the web (set while
  // rendering, React's way to adjust state from what was just read).
  if (regionChoices.locked && !form.region) setForm((p) => (p.region ? p : { ...p, region: regionChoices.locked! }));
  const zones = locations.zonesOf(form.region);
  const woredas = locations.woredasOf(form.zone);

  const age = isRealDate(form.date_of_birth) && form.date_of_birth <= todayISO() ? ageOn(form.date_of_birth) : null;
  const youthBand = `${settings.youth_min_age}–${settings.youth_max_age}`;
  const isYouth = age !== null && age >= settings.youth_min_age && age <= settings.youth_max_age;
  const gregorian = form.date_of_birth ? formatDate(form.date_of_birth) : "";
  const studies = form.education_level !== "" && !NO_STUDY_LEVELS.includes(form.education_level);
  const taken = (key: "priority_1" | "priority_2" | "priority_3") =>
    sectors.filter((s) => s.value === form[key] || ![form.priority_1, form.priority_2, form.priority_3].includes(s.value));

  return (
    <>
      {step === 0 ? (
        <Section title="Identification" icon={IdCard} description="Verify the National ID with Fayida: the ID's details fill the form.">
          <ChoiceRow<"yes" | "no">
            label="Has a National ID (Fayida)?"
            required
            value={form.has_fayida || undefined}
            options={fayidaOptions}
            onChange={(v) => update("has_fayida", v as YesNo, true)}
            error={errors.has_fayida}
          />
          {!mayAdminister && form.has_fayida !== "no" ? (
            <Text style={styles.hint}>Without a Fayida ID, an administrator registers the person.</Text>
          ) : null}
          {form.has_fayida !== "no" ? (
            <>
              <Field
                label="National ID (Fayida, FAN)"
                required={form.has_fayida === "yes"}
                value={form.national_id}
                onChangeText={(v) => update("national_id", v.replace(/\D/g, ""))}
                placeholder="12-digit number"
                maxLength={12}
                keyboardType="number-pad"
                onBlur={() => checkField("national_id")}
                error={errors.national_id}
              />
              {identitySlot}
            </>
          ) : null}
          <Field
            label="Kebele ID"
            required={form.has_fayida === "no"}
            value={form.kebele_id}
            onChangeText={(v) => update("kebele_id", v)}
            placeholder="e.g. KB-2023-445"
            autoCapitalize="characters"
            hint={form.has_fayida === "no" ? "Attach a scan later from the participant's record." : "Optional when the person has Fayida."}
            onBlur={() => checkField("kebele_id")}
            error={errors.kebele_id}
          />
          <Field
            label="JCMIS Labour ID"
            value={form.labour_id}
            onChangeText={(v) => update("labour_id", v)}
            autoCapitalize="characters"
            hint="If the person has one."
          />
          <Field
            label="First name"
            required
            value={form.first_name}
            onChangeText={(v) => update("first_name", v.replace(/\s/g, ""))}
            autoCapitalize="words"
            onBlur={() => checkField("first_name")}
            error={errors.first_name}
          />
          <Field
            label="Father's name"
            required
            value={form.father_name}
            onChangeText={(v) => update("father_name", v.replace(/\s/g, ""))}
            autoCapitalize="words"
            onBlur={() => checkField("father_name")}
            error={errors.father_name}
          />
          <Field
            label="Grandfather's name"
            required
            value={form.grandfather_name}
            onChangeText={(v) => update("grandfather_name", v.replace(/\s/g, ""))}
            autoCapitalize="words"
            onBlur={() => checkField("grandfather_name")}
            error={errors.grandfather_name}
          />
        </Section>
      ) : null}

      {step === 1 ? (
        <Section title="Personal details" icon={User}>
          <DateField
            label="Date of birth (EC)"
            calendar="ethiopian"
            required
            value={form.date_of_birth}
            onChange={(v) => update("date_of_birth", v, true)}
            placeholder="Select date of birth"
            min={yearsAgo(settings.participant_max_age)}
            max={yearsAgo(settings.participant_min_age)}
            initialYear={new Date().getFullYear() - 22}
            error={errors.date_of_birth}
            // F01-6 (backend 0137): picked in the Ethiopian calendar; the Gregorian date is what is stored.
            hint={gregorian ? `Gregorian: ${gregorian}${age !== null ? ` · age ${age}` : ""}` : "Ethiopian calendar (EC)"}
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
            label="Nationality"
            value={form.nationality}
            onChangeText={(v) => update("nationality", v)}
            placeholder="e.g. Ethiopian"
            autoCapitalize="words"
          />
          <Select
            label="Marital status"
            required
            value={form.marital_status}
            options={marital}
            onChange={(v) => update("marital_status", v, true)}
            placeholder="Select marital status"
            error={errors.marital_status}
          />
          <Select
            label="Education level"
            required
            value={form.education_level}
            options={education}
            onChange={(v) => {
              const next = { ...form, education_level: v, field_of_study: NO_STUDY_LEVELS.includes(v) ? "" : form.field_of_study };
              setForm(next);
              checkField("education_level", next);
            }}
            placeholder="Select education level"
            error={errors.education_level}
          />
          {form.education_level === EDUCATION_OTHER ? (
            <Field
              label="Other education level"
              required
              value={form.education_level_other}
              onChangeText={(v) => update("education_level_other", v)}
              maxLength={100}
              placeholder="Say which"
              onBlur={() => checkField("education_level_other")}
              error={errors.education_level_other}
            />
          ) : null}
          {studies ? (
            <Select
              label="Field of study"
              value={form.field_of_study}
              options={study}
              onChange={(v) => update("field_of_study", v, true)}
              placeholder="If any"
              error={errors.field_of_study}
            />
          ) : null}
          <ChoiceRow<"yes" | "no">
            label="Disability"
            required
            value={form.disability ? "yes" : "no"}
            options={YES_NO}
            onChange={(v) => {
              const on = v === "yes";
              setForm((p) => ({ ...p, disability: on, disability_types: on ? p.disability_types : [], disability_other: on ? p.disability_other : "" }));
            }}
          />
          {form.disability ? (
            <View style={styles.group}>
              <Text style={styles.label}>
                Impairment type <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.hint}>Tick every one that applies.</Text>
              {impairments
                .filter((o) => o.value !== "multiple")
                .map((o) => (
                  <Toggle
                    key={o.value}
                    label={o.label}
                    value={form.disability_types.includes(o.value)}
                    onChange={(on) =>
                      update(
                        "disability_types",
                        on ? [...form.disability_types, o.value] : form.disability_types.filter((x) => x !== o.value),
                        true,
                      )
                    }
                  />
                ))}
              <ErrorText>{errors.disability_types}</ErrorText>
            </View>
          ) : null}
          {form.disability && form.disability_types.includes(OTHER) ? (
            <Field
              label="Other impairment"
              required
              value={form.disability_other}
              onChangeText={(v) => update("disability_other", v)}
              onBlur={() => checkField("disability_other")}
              error={errors.disability_other}
            />
          ) : null}
        </Section>
      ) : null}

      {step === 2 ? (
        <Section title="Household and inclusion" icon={Heart}>
          <Select
            label="Target status"
            required
            value={form.target_status}
            options={TARGET_STATUSES}
            onChange={(v) => update("target_status", v, true)}
            placeholder="IDP, returnee or neither"
            error={errors.target_status}
          />
          <ChoiceRow<"yes" | "no">
            label="Female-headed household?"
            required
            value={form.female_headed || undefined}
            options={YES_NO}
            onChange={(v) => update("female_headed", v, true)}
            error={errors.female_headed}
          />
          <ChoiceRow<"yes" | "no">
            label="Has dependents?"
            required
            value={form.has_dependents || undefined}
            options={YES_NO}
            onChange={(v) => {
              const next = {
                ...form,
                has_dependents: v,
                dependents_count: v === "yes" ? form.dependents_count : "",
                children_under_5: v === "yes" ? form.children_under_5 : "",
              };
              setForm(next);
              checkField("has_dependents", next);
            }}
            error={errors.has_dependents}
          />
          {form.has_dependents === "yes" ? (
            <>
              <Field
                label="How many dependents"
                required
                value={form.dependents_count}
                onChangeText={(v) => update("dependents_count", v.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={2}
                onBlur={() => checkField("dependents_count")}
                error={errors.dependents_count}
              />
              <Field
                label="Children under 5"
                required
                value={form.children_under_5}
                onChangeText={(v) => update("children_under_5", v.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={2}
                hint="0 if none."
                onBlur={() => checkField("children_under_5")}
                error={errors.children_under_5}
              />
            </>
          ) : null}
        </Section>
      ) : null}

      {step === 3 ? (
        <>
          <Section title="Location" icon={MapPin}>
            <Select
              label="Region"
              required
              value={form.region}
              options={regionChoices.regions}
              onChange={(v) => {
                // A cluster covers one region: one chosen for another region goes.
                const cluster = clusters.find((c) => c.value === form.organization_id);
                const organization_id = cluster?.region && cluster.region !== v ? "" : form.organization_id;
                const next = { ...form, region: v, zone: "", woreda: "", woreda_other: "", organization_id };
                setForm(next);
                checkField("region", next);
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
                  const next = { ...form, zone: v, woreda: "", woreda_other: "" };
                  setForm(next);
                  checkField("zone", next);
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
                hint={form.region ? "No zones listed for this region yet: type it." : undefined}
                onBlur={() => checkField("zone")}
                error={errors.zone}
              />
            )}
            <Select
              label="Woreda"
              required
              value={form.woreda}
              options={woredas}
              onChange={(v) => update("woreda", v, true)}
              placeholder={form.zone ? "Select woreda" : "Select the zone first"}
              disabled={!form.zone}
              error={errors.woreda}
            />
            <Field
              label="Kebele"
              required
              value={form.kebele}
              onChangeText={(v) => update("kebele", v)}
              autoCapitalize="words"
              hint="The official name of the kebele."
              onBlur={() => checkField("kebele")}
              error={errors.kebele}
            />
            {chooseCluster ? (
              <Select
                label="Cluster"
                required
                value={form.organization_id}
                options={clusterOptions}
                onChange={(v) => update("organization_id", v, true)}
                placeholder={form.region ? "Select cluster" : "Select the region first"}
                hint="The RAYEE II cluster for this region."
                error={errors.organization_id}
              />
            ) : (
              <Field label="Cluster" value={shownCluster} editable={false} />
            )}
            <Select
              label="Residence location type"
              required
              value={form.residence_type}
              options={residence}
              onChange={(v) => update("residence_type", v, true)}
              placeholder="Rural, peri-urban or urban"
              error={errors.residence_type}
            />
          </Section>
          <Section title="Contact and registration site" icon={Home}>
            <Field
              label="Phone"
              required
              value={form.phone}
              onChangeText={(v) => update("phone", v.replace(/[^\d+]/g, ""))}
              placeholder="09… or 2519…"
              maxLength={13}
              keyboardType="phone-pad"
              onBlur={() => checkField("phone")}
              error={errors.phone}
            />
            <Field
              label="Alternative contact"
              value={form.alternative_phone}
              onChangeText={(v) => update("alternative_phone", v.replace(/[^\d+]/g, ""))}
              placeholder="Optional"
              maxLength={13}
              keyboardType="phone-pad"
              onBlur={() => checkField("alternative_phone")}
              error={errors.alternative_phone}
            />
            <Field
              label="Email"
              value={form.email}
              onChangeText={(v) => update("email", v)}
              placeholder="Email address"
              keyboardType="email-address"
              autoCapitalize="none"
              onBlur={() => checkField("email")}
              error={errors.email}
            />
            <Field
              label="Registration site"
              value={form.registration_site}
              onChangeText={(v) => update("registration_site", v)}
              placeholder="e.g. Mesho OSC, or At home"
            />
            <View style={styles.group}>
              <Text style={styles.label}>
                GPS point of the registration <Text style={styles.required}>*</Text>
              </Text>
              <GpsField value={form.gps} onChange={(p) => update("gps", p, true)} what="registration" />
              <ErrorText>{errors.gps}</ErrorText>
            </View>
          </Section>
        </>
      ) : null}

      {step === 4 ? (
        <Section title="Livelihood and priorities" icon={Sprout}>
          <Select
            label="Agri-business experience"
            required
            value={form.agri_experience}
            options={agri}
            onChange={(v) => update("agri_experience", v, true)}
            placeholder="New, additional, improved or re-entry"
            error={errors.agri_experience}
          />
          <ChoiceRow
            label="Employment preference"
            required
            value={form.employment_preference || undefined}
            options={PREFERENCES}
            onChange={(v) => {
              const next = { ...form, employment_preference: v, lead_firm_id: v === "wage" ? form.lead_firm_id : "" };
              setForm(next);
              checkField("employment_preference", next);
            }}
            error={errors.employment_preference}
          />
          {wage ? (
            <Select
              label="Lead firm"
              value={form.lead_firm_id}
              options={leadFirms}
              onChange={(v) => update("lead_firm_id", v)}
              placeholder={leadFirmsLoading ? "Loading…" : leadFirms.length ? "Select lead firm" : "No lead firm on this device"}
              disabled={leadFirms.length === 0}
              hint="Optional. Lead firms are registered under Institutions on the web."
            />
          ) : null}
          {(["priority_1", "priority_2", "priority_3"] as const).map((key, i) => (
            <Select
              key={key}
              label={`${["1st", "2nd", "3rd"][i]} priority`}
              required
              value={form[key]}
              options={taken(key)}
              onChange={(v) => update(key, v, true)}
              placeholder="Select sector"
              hint={i === 0 ? "The sector they most want to start in. Each is chosen once." : undefined}
              error={errors[key]}
            />
          ))}
        </Section>
      ) : null}

      {step === 5 ? (
        <Section title="Consent and notes" icon={ShieldCheck}>
          <Text style={styles.consentNote}>
            {"Personal data is collected under Ethiopia's Personal Data Protection Proclamation No. 1321/2024. " +
              "Before ticking, explain the purpose of the programme, how the data will be used and kept, and that " +
              "the participant can withdraw consent at any time without losing services. A seven-year retention " +
              "date is set automatically."}
          </Text>
          {consentLocked ? (
            <Text style={styles.hint}>
              {form.consent_given ? "Consent given." : "No consent on record."} Consent is withdrawn from the
              participant&apos;s page, not here.
            </Text>
          ) : (
            <>
              <Toggle label="Consent given *" value={form.consent_given} onChange={(v) => update("consent_given", v, true)} />
              <ErrorText>{errors.consent_given}</ErrorText>
            </>
          )}
          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(v) => update("notes", v)}
            placeholder="Additional notes"
            multiline
          />
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: "row", marginTop: -spacing.xs },
  group: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  required: { color: colors.danger },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  consentNote: { fontSize: 12, color: colors.muted, lineHeight: 18 },
});
