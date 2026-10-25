import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { CircleCheck, Mail } from "lucide-react-native";
import { api, ApiError } from "@/lib/api";
import { Button, Card, ErrorText, Field, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Asks the server to email a reset link (the same one the web sign-in page sends).
 * The link opens the web reset page in the phone's browser; the new password is
 * chosen there. The answer is the same whether or not the address has an account,
 * so nobody can use this to find out who is registered.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const clean = email.trim();
  const problem = !clean ? "Email is required" : !EMAIL_RE.test(clean) ? "Enter a valid email address" : undefined;

  async function send() {
    setTouched(true);
    if (problem) return;
    setSending(true);
    setError(null);
    try {
      await api.anon.post<{ ok: boolean }>("/auth/forgot-password", { email: clean });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.isNetworkError
          ? "No connection. Connect to the internet and try again."
          : err instanceof Error
            ? err.message
            : "Could not send the link",
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.center}>
        <Card style={styles.card}>
          <View style={styles.icon}>
            <CircleCheck size={28} color={colors.success} strokeWidth={2.2} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.text}>
            If an account exists for {clean}, a link to choose a new password has been sent. Open the link on this phone;
            it works for a short time only.
          </Text>
          <Button title="Back to sign in" onPress={() => router.replace("/sign-in")} />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.text}>
          Type the email of your programme account. We send a link to choose a new password.
        </Text>
        <ErrorText>{error}</ErrorText>
        <Field
          label="Email"
          required
          leftIcon={Mail}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setError(null);
          }}
          onBlur={() => setTouched(true)}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          placeholder="name@organization.org"
          error={touched ? problem : undefined}
        />
        <Button title="Send the link" loading={sending} onPress={() => void send()} />
        <Text accessibilityRole="link" style={styles.back} onPress={() => router.back()}>
          Back to sign in
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, justifyContent: "center", padding: spacing.lg },
  card: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  text: { fontSize: 14, color: colors.muted, lineHeight: 20, textAlign: "left" },
  back: { fontSize: 13, fontWeight: "600", color: colors.primary, textAlign: "center", paddingVertical: spacing.sm },
});
