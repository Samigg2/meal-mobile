import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { BadgeCheck, CircleCheck, Heart, IdCard, MapPin, Send, ShieldCheck, User } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  checkParticipantDuplicate,
  createParticipant,
  sendFayidaOtp,
  verifyFayidaOtp,
  type FayidaDemographics,
} from "@/lib/data";
import { ApiError } from "@/lib/api";
import { enqueue, shouldQueue } from "@/lib/queue";
import {
  EMPTY,
  OTHER,
  ageOn,
  isRealDate,
  newRef,
  todayISO,
  toInput,
  validate,
  yearsAgo,
  type FormState,
} from "@/lib/participant-form";
import { useLocations, useLookupOptions, useSettings, type Option } from "@/lib/reference";
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
import { DateField } from "@/components/date-picker";
import { colors, radius, spacing } from "@/lib/theme";

/**
 * Participant registration. The same rules as the web form and the API
 * (participants.schemas.ts), checked here first so a field officer can fix
 * everything before submitting — including offline, where the server cannot be
 * asked. Every list comes from reference data cached on the device.
 */

type Errors = Partial<Record<keyof FormState | "form", string>>;

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
  // Fayida e-KYC: send an OTP to the phone on the National ID, read it back.
  const [otpStage, setOtpStage] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [otp, setOtp] = useState("");
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifiedId, setVerifiedId] = useState<{ id: string; mock: boolean } | null>(null);

  const education = useLookupOptions("participants.education_level");
  const marital = useLookupOptions("participants.marital_status");
  const vulnerability = useLookupOptions("participants.vulnerability_category");
  const disability = useLookupOptions("participants.disability_type");
  const locations = useLocations();
  const settings = useSettings();
  const youthBand = `${settings.youth_min_age}–${settings.youth_max_age}`;
  const zones = locations.zonesOf(form.region);
  const woredas = locations.woredasOf(form.zone);
  // Woreda coverage in reference data is partial, so "Other" lets a woreda that
  // is not listed yet be typed rather than blocking the registration.
  const woredaOptions: Option[] = [...woredas, { label: "Other (type it)", value: OTHER }];

  const age = isRealDate(form.date_of_birth) && form.date_of_birth <= todayISO() ? ageOn(form.date_of_birth) : null;
  const isYouth = age !== null && age >= settings.youth_min_age && age <= settings.youth_max_age;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev));
    setExisting(null);
  }

  function resetOtp() {
    setOtpStage("idle");
    setOtp("");
    setOtpMessage(null);
    setOtpError(null);
  }

  async function handleSendOtp() {
    setOtpError(null);
    setOtpStage("sending");
    try {
      const res = await sendFayidaOtp(form.national_id);
      if (!res.sent) {
        setOtpStage("idle");
        setOtpError(res.message ?? "The OTP could not be sent.");
        return;
      }
      setOtpMessage(res.message ?? "OTP sent to the phone registered with this ID.");
      setOtpStage("sent");
    } catch (err) {
      setOtpStage("idle");
      setOtpError(
        shouldQueue(err)
          ? "No connection. National ID verification needs internet; you can still register and verify later."
          : err instanceof ApiError
            ? err.message
            : "The OTP could not be sent.",
      );
    }
  }

  async function handleVerifyOtp() {
    setOtpError(null);
    setOtpStage("verifying");
    try {
      const res = await verifyFayidaOtp(form.national_id, otp);
      if (!res.valid) {
        setOtpStage("sent");
        setOtpError(res.message ?? "The code did not match.");
        return;
      }
      if (res.data) applyFayida(res.data);
      setVerifiedId({ id: form.national_id, mock: res.source === "mock" });
      resetOtp();
    } catch (err) {
      setOtpStage("sent");
      setOtpError(err instanceof ApiError ? err.message : "Could not verify the code.");
    }
  }

  /** Fills only the empty fields from the ID register; never overwrites what was typed. */
  function applyFayida(data: FayidaDemographics) {
    setForm((prev) => {
      const region = prev.region || data.region || "";
      const zone = prev.zone || (region === (data.region ?? "") ? (data.zone ?? "") : "");
      let woreda = prev.woreda;
      let woredaOther = prev.woreda_other;
      if (!woreda && data.woreda && zone === (data.zone ?? "")) {
        const listed = locations.woredasOf(zone).some((w) => w.value === data.woreda);
        woreda = listed ? data.woreda : OTHER;
        woredaOther = listed ? "" : data.woreda;
      }
      return {
        ...prev,
        full_name: prev.full_name || data.full_name || "",
        date_of_birth: prev.date_of_birth || data.date_of_birth || "",
        sex: prev.sex ?? data.sex,
        region,
        zone,
        woreda,
        woreda_other: woredaOther,
        kebele: prev.kebele || data.kebele || "",
        phone: prev.phone || data.phone || "",
      };
    });
    setErrors({});
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
    setVerifiedId(null);
    resetOtp();
  }

  async function handleSave() {
    const found = validate(form, woredas.length > 0, settings);
    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      showErrors({ ...found, form: `${count} thing${count === 1 ? "" : "s"} to fix before saving. Check the fields marked in red.` });
      return;
    }

    // New registrations are always active; only the edit screen deals with other statuses.
    const input = { ...toInput(form, clientRef), status: "active" as const };
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
            onChangeText={(v) => {
              update("national_id", v.replace(/\s/g, ""));
              if (otpStage !== "idle") resetOtp();
              setOtpError(null);
            }}
            placeholder="12-character number"
            maxLength={12}
            autoCapitalize="characters"
            editable={otpStage === "idle" || otpStage === "sending"}
            error={errors.national_id}
          />
          {verifiedId && verifiedId.id === form.national_id ? (
            <View style={styles.verified}>
              <BadgeCheck size={18} color={colors.success} />
              <Text style={styles.verifiedText}>
                {verifiedId.mock
                  ? "Verified against test data (Fayida not connected yet). Empty fields were filled in."
                  : "Verified with Fayida. Empty fields were filled in from the ID record."}
              </Text>
            </View>
          ) : otpStage === "sent" || otpStage === "verifying" ? (
            <View style={styles.otpBox}>
              <Text style={styles.otpMessage}>{otpMessage}</Text>
              <Field
                label="One-time code"
                value={otp}
                onChangeText={(v) => {
                  setOtp(v.replace(/\D/g, "").slice(0, 6));
                  setOtpError(null);
                }}
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                error={otpError}
              />
              <View style={styles.otpActions}>
                <View style={styles.flexOne}>
                  <Button title="Change ID" variant="outline" onPress={resetOtp} />
                </View>
                <View style={styles.flexOne}>
                  <Button
                    title="Verify"
                    icon={BadgeCheck}
                    onPress={handleVerifyOtp}
                    loading={otpStage === "verifying"}
                    disabled={otp.length !== 6}
                  />
                </View>
              </View>
            </View>
          ) : form.national_id.length === 12 ? (
            <View style={styles.otpBox}>
              <Text style={styles.otpMessage}>
                Verify the ID: a one-time code goes to the phone registered with it, and the participant&apos;s details
                fill in automatically.
              </Text>
              {otpError ? <Text style={styles.fieldError}>{otpError}</Text> : null}
              <Button
                title="Send verification code"
                icon={Send}
                variant="outline"
                onPress={handleSendOtp}
                loading={otpStage === "sending"}
              />
            </View>
          ) : null}
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
          <DateField
            label="Date of birth"
            required
            value={form.date_of_birth}
            onChange={(v) => update("date_of_birth", v)}
            placeholder="Select date of birth"
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
  flexOne: { flex: 1 },
  otpBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  otpMessage: { fontSize: 12, color: colors.secondary, lineHeight: 18 },
  otpActions: { flexDirection: "row", gap: spacing.sm },
  verified: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  verifiedText: { flex: 1, fontSize: 12, color: colors.success, fontWeight: "600", lineHeight: 18 },
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
