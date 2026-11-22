import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getParticipantDetail, type ParticipantInput } from "@/lib/data";
import type { ParticipantRow } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { type Targeted } from "@/lib/queue";
import { saveOrQueue, useQueuedPayload } from "@/lib/field-form";
import { SavedNotice } from "@/components/field-form";
import {
  fromRecord,
  STEP_FIELDS,
  STEPS,
  stepOf,
  toInput,
  validate,
  type FormErrors,
  type FormState,
} from "@/lib/participant-form";
import { useLocations, useSettings } from "@/lib/reference";
import { Button, EmptyState, ErrorText, ListSkeleton, StepBar, StickyFooter, Text } from "@/components/ui";
import { ParticipantFields } from "@/components/participant-fields";
import { colors, spacing } from "@/lib/theme";

/**
 * Editing a participant: the same DMIS F01 fields and rules as registration
 * (@/lib/participant-form), checked in "edit" mode so a record from before F01
 * can still have one field corrected without filling in every new one. A
 * stored woreda not in the reference list for its zone stays editable as text.
 */

/**
 * A change made with no connection waits on the phone as only the fields that
 * changed, so it does not undo what the office changed meanwhile in the others.
 * It keeps the record as it was (`_before`, never sent) so it can be opened
 * again from Sync without a connection. `expected_updated_at`: when the record
 * was last changed as this form saw it, so a change made since is not
 * overwritten (409).
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
    // Not edited here: the server keeps consent and builds full_name from the three names.
    if (key === "client_ref" || key === "consent_given") continue;
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
    return <EditForm id={id} participant={data?.participant ?? _before} pending={participant} queuedId={queued.queuedId} />;
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
 * the real data in one pass, with no effect needed to fill it in after the fact.
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
  const settings = useSettings();
  const original = () => fromRecord(participant as unknown as Record<string, unknown>, locations.woredasOf);
  const [form, setForm] = useState<FormState>(() =>
    fromRecord({ ...participant, ...(pending as Record<string, unknown>) } as Record<string, unknown>, locations.woredasOf),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [queuedNotice, setQueuedNotice] = useState(false);
  const woredaListed = (zone: string) => locations.woredasOf(zone).length > 0;

  /** The web's rules for one field, shown when it is left or picked (not only on Save). */
  function checkField(key: keyof FormState, next: FormState = form) {
    const found = validate(next, woredaListed(next.zone), settings, "edit");
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
    const found = validate(form, woredaListed(form.zone), settings, "edit") as Record<string, string>;
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
    const found = validate(form, woredaListed(form.zone), settings, "edit");
    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      showErrors({ ...found, form: `${count} thing${count === 1 ? "" : "s"} to fix before saving. Check the fields marked in red.` });
      const bad = stepOf(found);
      if (bad >= 0) setStep(bad);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const changes = changedFields(toInput(original()), toInput(form));
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
        <ParticipantFields
          step={step}
          form={form}
          setForm={setForm}
          update={update}
          checkField={checkField}
          errors={errors}
          consentLocked
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
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  warn: { fontSize: 12, color: colors.warning, lineHeight: 18 },
});
