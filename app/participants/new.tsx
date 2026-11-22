import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { BadgeCheck, CircleCheck, ExternalLink } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { checkParticipantDuplicate, createParticipant, type ParticipantInput } from "@/lib/data";
import { checkWithFayida, type FayidaDemographics } from "@/lib/fayida";
import { ApiError } from "@/lib/api";
import { enqueue, removeFromQueue, shouldQueue, updateQueued } from "@/lib/queue";
import { useQueuedPayload } from "@/lib/field-form";
import {
  EMPTY,
  fromRecord,
  newRef,
  splitName,
  STEP_FIELDS,
  STEPS,
  stepOf,
  toInput,
  validate,
  type FormState,
} from "@/lib/participant-form";
import { useLocations, useSettings } from "@/lib/reference";
import { Button, Card, ErrorText, ListSkeleton, StepBar, StickyFooter, Text } from "@/components/ui";
import { ParticipantFields } from "@/components/participant-fields";
import { colors, radius, spacing } from "@/lib/theme";

/**
 * Participant registration (DMIS F01). The same rules as the web form and the
 * API (participants.schemas.ts: a staff registration needs the F01 mandatory
 * fields), checked here first so a field officer can fix everything before
 * submitting, including offline, where the server cannot be asked.
 */

type Errors = Partial<Record<keyof FormState | "form", string>>;

/** A waiting registration keeps the form as it was filled (`_form`, never sent), to open it again from Sync. */
type QueuedRegistration = ParticipantInput & { _form?: FormState };

export default function NewParticipant() {
  const queued = useQueuedPayload<QueuedRegistration>();
  const locations = useLocations();
  if (!queued.ready) return <ListSkeleton rows={3} />;
  const waiting = queued.payload;
  // A registration queued before this form (no `_form`, or one without the F01
  // fields) opens with what it had; the rest is asked before it can be sent.
  const initial = waiting
    ? waiting._form && "first_name" in waiting._form
      ? waiting._form
      : fromRecord(waiting as unknown as Record<string, unknown>, locations.woredasOf)
    : EMPTY;
  return <RegistrationForm initial={initial} initialRef={waiting?.client_ref} queuedId={waiting ? queued.queuedId : undefined} />;
}

function RegistrationForm({ initial, initialRef, queuedId }: { initial: FormState; initialRef?: string; queuedId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const [form, setForm] = useState<FormState>(initial);
  // One reference per registration, kept across retries (and a corrected waiting
  // copy), so a replayed offline submission is recognised by the server instead
  // of creating the person twice.
  const [clientRef, setClientRef] = useState(() => initialRef ?? newRef());
  const [errors, setErrors] = useState<Errors>({});
  const [existing, setExisting] = useState<{ id: string; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Fayida: the phone's browser opens Fayida's page; the result comes back here.
  const [checking, setChecking] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [verifiedId, setVerifiedId] = useState<{ id: string; mock: boolean; token: string } | null>(null);

  const locations = useLocations();
  const settings = useSettings();
  const woredaListed = () => locations.woredasOf(form.zone).length > 0;

  /** The web's rules for one field, shown when it is left or picked (not only on Save). */
  function checkField(key: keyof FormState, next: FormState = form) {
    const found = validate(next, locations.woredasOf(next.zone).length > 0, settings);
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
    setExisting(null);
  }

  async function handleCheckId() {
    setIdError(null);
    setChecking(true);
    try {
      const res = await checkWithFayida("staff", form.national_id || undefined);
      const proved = res.data.national_id;
      if (proved && proved !== form.national_id) {
        setIdError(`Fayida checked a different National ID (${proved}). Check the number and verify again.`);
        return;
      }
      applyFayida(res.data);
      setVerifiedId({ id: form.national_id, mock: res.source === "mock", token: res.fayida_token });
    } catch (err) {
      setIdError(
        shouldQueue(err)
          ? "No connection. National ID verification needs internet; you can still register and verify later."
          : err instanceof Error
            ? err.message
            : "Fayida could not confirm this ID.",
      );
    } finally {
      setChecking(false);
    }
  }

  /** Fills only the empty fields from the ID register; never overwrites what was typed. */
  function applyFayida(data: FayidaDemographics) {
    setForm((prev) => {
      const region = prev.region || data.region || "";
      const zone = prev.zone || (region === (data.region ?? "") ? (data.zone ?? "") : "");
      let woreda = prev.woreda;
      if (!woreda && data.woreda && zone === (data.zone ?? "")) {
        if (locations.woredasOf(zone).some((w) => w.value === data.woreda)) woreda = data.woreda;
      }
      // Fayida gives one name: it fills the three boxes when none is typed yet.
      const named = !prev.first_name && !prev.father_name && data.full_name ? splitName(data.full_name) : {};
      return {
        ...prev,
        ...named,
        has_fayida: "yes",
        nationality: prev.nationality || data.nationality || "",
        date_of_birth: prev.date_of_birth || data.date_of_birth || "",
        sex: prev.sex ?? data.sex,
        region,
        zone,
        woreda,
        kebele: prev.kebele || data.kebele || "",
        phone: prev.phone || data.phone || "",
      };
    });
    setErrors({});
  }

  function goToStep(next: number) {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function goNext() {
    const found = validate(form, woredaListed(), settings) as Record<string, string>;
    const here = Object.fromEntries(Object.entries(found).filter(([k]) => STEP_FIELDS[step].includes(k)));
    if (Object.keys(here).length > 0) {
      showErrors(here as Errors);
      return;
    }
    setErrors({});
    goToStep(step + 1);
  }

  function showErrors(found: Errors) {
    setErrors(found);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function startAnother() {
    setNotice(null);
    setStep(0);
    setForm(EMPTY);
    setErrors({});
    setExisting(null);
    setClientRef(newRef());
    setVerifiedId(null);
    setIdError(null);
  }

  async function handleSave() {
    const found = validate(form, woredaListed(), settings);
    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      showErrors({ ...found, form: `${count} thing${count === 1 ? "" : "s"} to fix before saving. Check the fields marked in red.` });
      const bad = stepOf(found);
      if (bad >= 0) setStep(bad);
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

      // The Fayida proof goes only with a live save: it lasts 30 minutes, so a
      // queued copy goes without it and the ID is verified later from the record.
      const fayidaToken = verifiedId?.id === form.national_id ? verifiedId.token : undefined;
      await createParticipant({ ...input, fayida_token: fayidaToken });
      if (queuedId) await removeFromQueue(queuedId);
      await queryClient.invalidateQueries({ queryKey: ["participants"] });
      router.back();
    } catch (err) {
      if (shouldQueue(err)) {
        const label = `Participant — ${input.full_name}`;
        const payload: QueuedRegistration = { ...input, _form: form };
        if (queuedId) await updateQueued(queuedId, label, payload);
        else await enqueue({ kind: "participant", label, payload });
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

  const identitySlot =
    verifiedId && verifiedId.id === form.national_id ? (
      <View style={styles.verified}>
        <BadgeCheck size={18} color={colors.success} />
        <Text style={styles.verifiedText}>
          {verifiedId.mock
            ? "Checked on the Fayida test page (not a real check). Empty fields were filled in."
            : "Verified by Fayida. Empty fields were filled in from the ID record."}
        </Text>
      </View>
    ) : form.national_id.length === 12 ? (
      <View style={styles.otpBox}>
        <Text style={styles.otpMessage}>
          Verify the ID on Fayida&apos;s page: the participant enters the ID and the code Fayida sends to their phone,
          then the app comes back here with their details filled in.
        </Text>
        {idError ? <Text style={styles.fieldError}>{idError}</Text> : null}
        <Button title="Verify with Fayida" icon={ExternalLink} variant="outline" onPress={handleCheckId} loading={checking} />
      </View>
    ) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <StepBar steps={STEPS} step={step} onStep={goToStep} />
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
        <ParticipantFields
          step={step}
          form={form}
          setForm={setForm}
          update={update}
          checkField={checkField}
          errors={errors}
          identitySlot={identitySlot}
        />
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
              <Button title="Register participant" onPress={handleSave} loading={saving} />
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
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  fieldError: { fontSize: 12, color: colors.danger, fontWeight: "500" },
  otpBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  otpMessage: { fontSize: 12, color: colors.secondary, lineHeight: 18 },
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
