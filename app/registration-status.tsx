import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Clock, Save, XCircle } from "lucide-react-native";
import {
  getRegistrationStatus,
  savedRegistration,
  updateRegistration,
  type RegistrationState,
  type RegistrationStatus,
} from "@/lib/public-registration";
import { ApiError } from "@/lib/api";
import { Button, ErrorText, Field, Loading, Section, Text, Toggle } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

/**
 * Where a self-registration stands, read with the private token kept on this
 * phone. While it awaits review the person can still correct her details.
 */

const STATE: Record<RegistrationState, { title: string; body: string; color: string; icon: typeof Clock }> = {
  submitted: {
    title: "Awaiting review",
    body: "A programme officer will check your registration and may call you.",
    color: colors.warning,
    icon: Clock,
  },
  draft: {
    title: "Awaiting review",
    body: "A programme officer will check your registration and may call you.",
    color: colors.warning,
    icon: Clock,
  },
  approved: {
    title: "Accepted",
    body: "You are registered with RAYEE II. Your field officer will contact you about the next steps.",
    color: colors.success,
    icon: CircleCheck,
  },
  rejected: {
    title: "Not accepted",
    body: "Your registration was not accepted. Please contact a RAYEE field officer to find out why.",
    color: colors.danger,
    icon: XCircle,
  },
};

export default function RegistrationStatusScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void savedRegistration.get().then(setToken);
  }, []);

  const status = useQuery({
    queryKey: ["registration-status", token],
    queryFn: () => getRegistrationStatus(token!),
    enabled: !!token,
  });

  const details = status.data?.details;

  if (token === undefined || status.isLoading) return <Loading label="Checking…" />;
  if (!token) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>No registration is saved on this phone.</Text>
        <Button title="Register" onPress={() => router.replace("/register")} />
      </View>
    );
  }
  if (status.error || !status.data) {
    const e = status.error;
    return (
      <View style={styles.center}>
        <ErrorText>
          {e instanceof ApiError && e.isNetworkError
            ? "No connection. Checking needs internet."
            : "This registration could not be found."}
        </ErrorText>
        <Button title="Try again" variant="outline" onPress={() => void status.refetch()} />
        <Button
          title="Forget it on this phone"
          variant="outlineDanger"
          onPress={async () => {
            await savedRegistration.clear();
            setToken(null);
          }}
        />
      </View>
    );
  }

  const state = STATE[status.data.status];
  const Icon = state.icon;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.banner}>
        <Icon size={36} color={state.color} />
        <Text style={[styles.title, { color: state.color }]}>{state.title}</Text>
        <Text style={styles.body}>{state.body}</Text>
        <Text style={styles.note}>Sent on {status.data.submitted_at.slice(0, 10)}</Text>
      </View>

      {status.data.editable && details ? (
        <EditDetails
          details={details}
          onSave={(data) => updateRegistration(token, data)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["registration-status", token] })}
        />
      ) : null}

      <Button title="Back to sign in" variant="outline" onPress={() => router.replace("/sign-in")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.background },
  center: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", backgroundColor: colors.background },
  banner: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  title: { fontSize: 22, fontWeight: "800" },
  body: { fontSize: 15, color: colors.text, textAlign: "center", lineHeight: 22 },
  note: { fontSize: 12, color: colors.muted },
});

type Details = NonNullable<RegistrationStatus["details"]>;
type Changes = { full_name: string; zone: string; woreda: string; kebele: string; disability: boolean };

/** The corrections form, starting from what was sent. */
function EditDetails({
  details,
  onSave,
  onSaved,
}: {
  details: Details;
  onSave: (data: Changes) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(details.full_name);
  const [zone, setZone] = useState(details.zone ?? "");
  const [woreda, setWoreda] = useState(details.woreda ?? "");
  const [kebele, setKebele] = useState(details.kebele ?? "");
  const [disability, setDisability] = useState(details.disability);

  const save = useMutation({
    mutationFn: () =>
      onSave({ full_name: fullName.trim(), zone: zone.trim(), woreda: woreda.trim(), kebele: kebele.trim(), disability }),
    onSuccess: onSaved,
  });

  return (
    <Section title="Correct your details" description="You can change these until an officer reviews them.">
      <Field label="Full name" value={fullName} onChangeText={setFullName} />
      <Field label="Zone" value={zone} onChangeText={setZone} />
      <Field label="Woreda" value={woreda} onChangeText={setWoreda} />
      <Field label="Kebele" value={kebele} onChangeText={setKebele} />
      <Toggle label="I live with a disability" value={disability} onChange={setDisability} />
      <ErrorText>{save.error ? (save.error as Error).message : null}</ErrorText>
      {save.isSuccess ? <Text style={styles.note}>Saved.</Text> : null}
      <Button
        title="Save changes"
        icon={Save}
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={!fullName.trim() || !zone.trim() || !woreda.trim()}
      />
    </Section>
  );
}
