import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { createParticipant, type ParticipantInput } from "@/lib/data";
import { enqueue, shouldQueue } from "@/lib/queue";
import { Button, Card, ChoiceRow, ErrorText, Field, Toggle } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

/**
 * Participant registration. If the device is offline the record is queued
 * locally and uploaded from the sync screen, so field work is never blocked by
 * connectivity.
 */
export default function NewParticipant() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ParticipantInput>({
    participant_id: "",
    full_name: "",
    date_of_birth: "",
    sex: undefined,
    region: "",
    zone: "",
    woreda: "",
    kebele: "",
    phone: "",
    disability: false,
    disability_type: "",
    status: "active",
    consent_given: false,
    consent_version: "v1",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ParticipantInput>(key: K, value: ParticipantInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  /** Empty optional fields must not be sent as empty strings. */
  function payload(): ParticipantInput {
    const entries = Object.entries(form).filter(([, value]) => value !== "" && value !== undefined);
    return {
      ...(Object.fromEntries(entries) as Partial<ParticipantInput>),
      participant_id: form.participant_id.trim(),
      full_name: form.full_name.trim(),
    };
  }

  async function handleSave() {
    if (!form.participant_id.trim() || !form.full_name.trim()) {
      setError("Participant ID and full name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createParticipant(payload());
      await queryClient.invalidateQueries({ queryKey: ["participants"] });
      router.back();
    } catch (err) {
      if (shouldQueue(err)) {
        await enqueue({
          kind: "participant",
          label: `Participant ${form.participant_id} — ${form.full_name}`,
          payload: payload(),
        });
        setNotice("You are offline: this registration is saved on the device and will upload when you sync.");
      } else {
        setError(err instanceof Error ? err.message : "Could not save the participant");
      }
    } finally {
      setSaving(false);
    }
  }

  if (notice) {
    return (
      <View style={styles.noticeWrap}>
        <Card style={styles.notice}>
          <Text style={styles.noticeTitle}>Saved on this device</Text>
          <Text style={styles.noticeText}>{notice}</Text>
          <Button title="Done" onPress={() => router.back()} />
          <Button
            title="Register another"
            variant="outline"
            onPress={() => {
              setNotice(null);
              setForm((prev) => ({ ...prev, participant_id: "", full_name: "", phone: "", date_of_birth: "" }));
            }}
          />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Identification</Text>
          <Field
            label="Participant ID"
            required
            value={form.participant_id}
            onChangeText={(v) => update("participant_id", v)}
            placeholder="P-0001"
            autoCapitalize="characters"
          />
          <Field
            label="Full name"
            required
            value={form.full_name}
            onChangeText={(v) => update("full_name", v)}
            placeholder="Full name"
            autoCapitalize="words"
          />
          <Field
            label="Date of birth"
            value={form.date_of_birth}
            onChangeText={(v) => update("date_of_birth", v)}
            placeholder="YYYY-MM-DD"
          />
          <ChoiceRow
            label="Sex"
            value={form.sex}
            options={[
              { label: "Male", value: "male" },
              { label: "Female", value: "female" },
            ]}
            onChange={(v) => update("sex", v)}
          />
          <Field label="Phone" value={form.phone} onChangeText={(v) => update("phone", v)} keyboardType="phone-pad" />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Field label="Region" value={form.region} onChangeText={(v) => update("region", v)} autoCapitalize="words" />
          <Field label="Zone" value={form.zone} onChangeText={(v) => update("zone", v)} autoCapitalize="words" />
          <Field label="Woreda" value={form.woreda} onChangeText={(v) => update("woreda", v)} autoCapitalize="words" />
          <Field label="Kebele" value={form.kebele} onChangeText={(v) => update("kebele", v)} autoCapitalize="words" />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Inclusion</Text>
          <Toggle label="Has a disability" value={!!form.disability} onChange={(v) => update("disability", v)} />
          {form.disability ? (
            <Field
              label="Disability type"
              value={form.disability_type}
              onChangeText={(v) => update("disability_type", v)}
            />
          ) : null}
          <ChoiceRow
            label="Status"
            value={form.status}
            options={[
              { label: "Active", value: "active" },
              { label: "Graduated", value: "graduated" },
              { label: "Dropped", value: "dropped" },
              { label: "Inactive", value: "inactive" },
            ]}
            onChange={(v) => update("status", v)}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Consent</Text>
          <Text style={styles.consentNote}>
            {"Personal data is collected under Ethiopia's Personal Data Protection Proclamation No. 1321/2024. " +
              "Record consent only after explaining how the data will be used."}
          </Text>
          <Toggle
            label="Informed consent given"
            value={!!form.consent_given}
            onChange={(v) => update("consent_given", v)}
          />
          <Field label="Notes" value={form.notes} onChangeText={(v) => update("notes", v)} multiline />
        </Card>

        <ErrorText>{error}</ErrorText>
        <Button title="Save participant" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  consentNote: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  noticeWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background },
  notice: { gap: spacing.md },
  noticeTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  noticeText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
});
