import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { Button, Card, ErrorText, Field } from "@/components/ui";
import { apiBaseUrl } from "@/lib/api";
import { colors, spacing } from "@/lib/theme";

export default function SignIn() {
  const { signIn, user, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (ready && user) return <Redirect href="/(tabs)" />;

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image source={require("../assets/icon.png")} style={styles.logo} />
          <Text style={styles.title}>RAYEE II MEAL MIS</Text>
          <Text style={styles.subtitle}>Field data collection</Text>
        </View>

        <Card style={styles.card}>
          <Field
            label="Email"
            required
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="name@organization.org"
          />
          <Field
            label="Password"
            required
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Sign in" onPress={handleSignIn} loading={loading} disabled={!email || !password} />
          <Text style={styles.hint}>
            Data you capture offline is stored on this device and uploaded when you are back online.
          </Text>
        </Card>

        <Text style={styles.server}>{apiBaseUrl}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.xl },
  brand: { alignItems: "center", gap: spacing.xs },
  logo: { width: 56, height: 56, borderRadius: 14 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  subtitle: { fontSize: 13, color: colors.muted },
  card: { gap: spacing.lg },
  hint: { fontSize: 12, color: colors.muted, textAlign: "center" },
  server: { fontSize: 11, color: colors.muted, textAlign: "center" },
});
