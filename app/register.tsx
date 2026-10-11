import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IdCard, MapPin, Phone, Send, ShieldCheck, User } from "lucide-react-native";
import {
  getRegistrationOptions,
  savedRegistration,
  sendIdCode,
  sendPhoneCode,
  submitRegistration,
  verifyIdCode,
  verifyPhoneCode,
} from "@/lib/public-registration";
import { ApiError } from "@/lib/api";
import { PHONE_RE, yearsAgo } from "@/lib/participant-form";
import {
  Badge,
  Button,
  ChoiceRow,
  ErrorText,
  Field,
  Loading,
  Section,
  Select,
  StickyFooter,
  Text,
  Toggle,
} from "@/components/ui";
import { DateField } from "@/components/date-picker";
import { colors, spacing } from "@/lib/theme";

/**
 * A young person registering herself, without an account. The same steps and
 * rules as the web form: prove the phone number with an SMS code, optionally
 * check the National ID, give her details and consent. The registration waits
 * for a programme officer's review and counts in nothing until approved; the
 * private status token is kept on the phone so she can check it later.
 */

/** The same words as the web form (meal-mis-frontend/src/routes/register.tsx). */
const CONSENT_TEXT =
  "I agree that RAYEE II may collect and store my personal information to run the programme. I understand that staff will review my registration, and that I can withdraw my consent at any time.";

const message = (e: unknown) =>
  e instanceof ApiError ? (e.isNetworkError ? "No connection. Registration needs internet." : e.message) : String(e);

export default function Register() {
  const router = useRouter();
  const options = useQuery({ queryKey: ["public-registration-options"], queryFn: getRegistrationOptions, retry: 1 });

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneToken, setPhoneToken] = useState("");

  const [nationalId, setNationalId] = useState("");
  const [kebeleId, setKebeleId] = useState("");
  const [idCode, setIdCode] = useState("");
  const [idToken, setIdToken] = useState("");
  const [idMock, setIdMock] = useState(false);

  const [fullName, setFullName] = useState("");
  const [sex, setSex] = useState<"male" | "female" | undefined>();
  const [dob, setDob] = useState("");
  const [region, setRegion] = useState("");
  const [cluster, setCluster] = useState("");
  const [zone, setZone] = useState("");
  const [woreda, setWoreda] = useState("");
  const [kebele, setKebele] = useState("");
  const [disability, setDisability] = useState(false);
  const [consent, setConsent] = useState(false);

  const sendPhone = useMutation({ mutationFn: () => sendPhoneCode(phone.trim()) });
  const verifyPhone = useMutation({
    mutationFn: () => verifyPhoneCode(phone.trim(), phoneCode),
    onSuccess: (r) => setPhoneToken(r.verification_token),
  });
  const sendId = useMutation({ mutationFn: () => sendIdCode(nationalId.trim()) });
  const verifyId = useMutation({
    mutationFn: () => verifyIdCode(nationalId.trim(), idCode),
    onSuccess: (r) => {
      setIdToken(r.fayida_token);
      setIdMock(r.source === "mock");
      // Fill in what is still empty from the ID record.
      const d = r.data;
      if (d.full_name && !fullName.trim()) setFullName(d.full_name);
      if (d.date_of_birth && !dob) setDob(d.date_of_birth);
      if (d.sex && !sex) setSex(d.sex);
      if (d.region && !region) setRegion(d.region);
      if (d.zone && !zone.trim()) setZone(d.zone);
      if (d.woreda && !woreda.trim()) setWoreda(d.woreda);
      if (d.kebele && !kebele.trim()) setKebele(d.kebele);
    },
  });

  // A region covered by several clusters asks which one is hers.
  const regionClusters = (options.data?.clusters ?? []).filter(
    (c) => c.region.toLowerCase() === region.toLowerCase(),
  );
  const needsCluster = regionClusters.length > 1;

  const submit = useMutation({
    mutationFn: () =>
      submitRegistration({
        full_name: fullName.trim(),
        sex: sex as "male" | "female",
        date_of_birth: dob,
        phone: phone.trim(),
        national_id: nationalId.trim() || undefined,
        kebele_id: kebeleId.trim() || undefined,
        region,
        zone: zone.trim(),
        woreda: woreda.trim(),
        kebele: kebele.trim() || undefined,
        disability,
        organization_id: needsCluster ? cluster : undefined,
        consent_given: true,
        verification_token: phoneToken,
        fayida_token: idToken && nationalId.trim() ? idToken : undefined,
      }),
    onSuccess: async (r) => {
      await savedRegistration.set(r.status_token);
      router.replace("/registration-status");
    },
  });

  if (options.isLoading) return <Loading label="Opening registration…" />;
  if (options.error) {
    return (
      <View style={styles.closed}>
        <ErrorText>{message(options.error)}</ErrorText>
        <Button title="Try again" variant="outline" onPress={() => void options.refetch()} />
      </View>
    );
  }
  // Production without an SMS gateway offers no registration, as on the web.
  if (options.data && !options.data.verification.phone) {
    return (
      <View style={styles.closed}>
        <Text style={styles.closedText}>
          Self-registration is not open yet. Please ask a RAYEE field officer to register you.
        </Text>
      </View>
    );
  }

  const phoneOk = PHONE_RE.test(phone.trim());
  const canSubmit =
    !!phoneToken &&
    !!fullName.trim() &&
    !!sex &&
    !!dob &&
    (!!nationalId.trim() || !!kebeleId.trim()) &&
    !!region &&
    (!needsCluster || !!cluster) &&
    !!zone.trim() &&
    !!woreda.trim() &&
    consent;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Register for the RAYEE II programme. A programme officer checks every registration before it is
          accepted; you can follow it from this phone.
        </Text>

        <Section title="1. Your phone number" icon={Phone} description="We send a 6-digit code to prove it is yours.">
          <Field
            label="Phone number"
            required
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setPhoneToken("");
              setPhoneCode("");
              sendPhone.reset();
              verifyPhone.reset();
            }}
            keyboardType="phone-pad"
            placeholder="09… or +2519…"
            editable={!phoneToken}
            error={phone && !phoneOk ? "Use an Ethiopian mobile number, e.g. 0912345678" : null}
          />
          {phoneToken ? (
            <Badge text="Phone number confirmed" tone="success" />
          ) : sendPhone.isSuccess ? (
            <>
              <Text style={styles.note}>
                We sent a code to {phone.trim()}.
                {sendPhone.data?.test_code ? ` Test mode, no SMS sent: your code is ${sendPhone.data.test_code}.` : ""}
              </Text>
              <Field
                label="Code"
                value={phoneCode}
                onChangeText={(v) => setPhoneCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                placeholder="6 digits"
              />
              <ErrorText>{verifyPhone.error ? message(verifyPhone.error) : null}</ErrorText>
              <Button
                title="Confirm code"
                onPress={() => verifyPhone.mutate()}
                loading={verifyPhone.isPending}
                disabled={phoneCode.length !== 6}
              />
            </>
          ) : (
            <>
              <ErrorText>{sendPhone.error ? message(sendPhone.error) : null}</ErrorText>
              <Button
                title="Send code"
                variant="outline"
                onPress={() => sendPhone.mutate()}
                loading={sendPhone.isPending}
                disabled={!phoneOk}
              />
            </>
          )}
        </Section>

        <Section title="2. Your ID" icon={IdCard} description="A National ID (Fayida) or a Kebele ID is required.">
          <Field
            label="National ID (Fayida)"
            value={nationalId}
            onChangeText={(v) => {
              setNationalId(v);
              setIdToken("");
              setIdCode("");
              sendId.reset();
              verifyId.reset();
            }}
            keyboardType="number-pad"
            editable={!idToken}
          />
          {options.data?.verification.fayida && nationalId.trim() ? (
            idToken ? (
              <Badge text={idMock ? "ID checked (test service)" : "ID confirmed"} tone="success" />
            ) : sendId.isSuccess ? (
              <>
                {sendId.data?.message ? <Text style={styles.note}>{sendId.data.message}</Text> : null}
                <Field
                  label="ID service code"
                  value={idCode}
                  onChangeText={(v) => setIdCode(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                />
                <ErrorText>{verifyId.error ? message(verifyId.error) : null}</ErrorText>
                <Button
                  title="Check my ID"
                  onPress={() => verifyId.mutate()}
                  loading={verifyId.isPending}
                  disabled={idCode.length < 4}
                />
              </>
            ) : (
              <>
                <ErrorText>{sendId.error ? message(sendId.error) : null}</ErrorText>
                <Button
                  title="Check my ID (optional)"
                  variant="outline"
                  onPress={() => sendId.mutate()}
                  loading={sendId.isPending}
                />
              </>
            )
          ) : null}
          <Field label="Kebele ID" value={kebeleId} onChangeText={setKebeleId} hint="If you have no National ID" />
        </Section>

        <Section title="3. About you" icon={User}>
          <Field label="Full name" required value={fullName} onChangeText={setFullName} autoCapitalize="words" />
          <ChoiceRow
            label="Sex"
            required
            value={sex}
            options={[
              { label: "Female", value: "female" },
              { label: "Male", value: "male" },
            ]}
            onChange={setSex}
          />
          <DateField
            label="Date of birth"
            required
            value={dob}
            onChange={setDob}
            max={yearsAgo(10)}
            initialYear={new Date().getFullYear() - 20}
          />
          <Toggle label="I live with a disability" value={disability} onChange={setDisability} />
        </Section>

        <Section title="4. Where you live" icon={MapPin}>
          <Select
            label="Region"
            required
            value={region || undefined}
            options={(options.data?.regions ?? []).map((r) => ({ label: r.label, value: r.code }))}
            onChange={(v) => {
              setRegion(v);
              setCluster("");
            }}
          />
          {needsCluster ? (
            <Select
              label="Your RAYEE cluster"
              required
              value={cluster || undefined}
              options={regionClusters.map((c) => ({ label: c.name, value: c.id }))}
              onChange={setCluster}
              hint="Your region has more than one; ask an officer if unsure."
            />
          ) : null}
          <Field label="Zone" required value={zone} onChangeText={setZone} />
          <Field label="Woreda" required value={woreda} onChangeText={setWoreda} />
          <Field label="Kebele" value={kebele} onChangeText={setKebele} />
        </Section>

        <Section title="5. Consent" icon={ShieldCheck}>
          <Text style={styles.note}>{CONSENT_TEXT}</Text>
          <Toggle label="I agree" value={consent} onChange={setConsent} />
        </Section>

        <ErrorText>{submit.error ? message(submit.error) : null}</ErrorText>
      </ScrollView>
      <StickyFooter>
        <Button
          title="Send my registration"
          icon={Send}
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!canSubmit}
        />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  intro: { fontSize: 14, color: colors.secondary, lineHeight: 20 },
  note: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  closed: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", backgroundColor: colors.background },
  closedText: { fontSize: 15, color: colors.text, textAlign: "center", lineHeight: 22 },
});

