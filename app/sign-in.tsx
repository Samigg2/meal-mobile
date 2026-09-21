import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/lib/auth";
import { Button, Card, ErrorText, Field } from "@/components/ui";
import { apiBaseUrl } from "@/lib/api";
import { colors, radius, spacing } from "@/lib/theme";

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
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={styles.brand}>
          <View style={styles.logoWrap}>
            <Image source={require("../assets/icon.png")} style={styles.logo} />
          </View>
          <Text style={styles.title}>RAYEE II MEAL MIS</Text>
          <Text style={styles.subtitle}>Field data collection</Text>
        </View>

        <View style={styles.body}>
          <Card style={styles.card}>
            <View>
              <Text style={styles.welcome}>Welcome back</Text>
              <Text style={styles.welcomeHint}>Sign in with your organization account.</Text>
            </View>
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
          </Card>

          <Text style={styles.hint}>
            Data you capture offline is stored on this device and uploaded when you are back online.
          </Text>
          <Text style={styles.server}>{apiBaseUrl}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1 },
  brand: {
    backgroundColor: colors.primary,
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: 88,
    paddingBottom: 72,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logo: { width: 60, height: 60, borderRadius: radius.lg },
  title: { fontSize: 22, fontWeight: "800", color: colors.white, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: "#bfdbfe" },
  body: { paddingHorizontal: spacing.lg, marginTop: -40, gap: spacing.lg, paddingBottom: spacing.xl },
  card: { gap: spacing.lg, padding: spacing.xl },
  welcome: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  welcomeHint: { fontSize: 13, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 18 },
  server: { fontSize: 11, color: "#94a3b8", textAlign: "center" },
});
