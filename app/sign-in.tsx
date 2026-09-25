import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowRight, Lock, Mail } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { Button, ErrorText, Field, Text, Toggle } from "@/components/ui";
import { apiBaseUrl } from "@/lib/api";
import { colors, radius, spacing } from "@/theme";

export default function SignIn() {
  const { signIn, user, ready } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Presentational for now: the session length is not split by this choice yet.
  const [keepSignedIn, setKeepSignedIn] = useState(true);
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
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* Navy brand area */}
        <View style={[styles.brand, { paddingTop: insets.top + 40 }]}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>R</Text>
          </View>
          <Text style={styles.title}>RAYEE II</Text>
          <Text style={styles.subtitle}>Digital MEAL Programme</Text>
        </View>

        {/* White sheet with rounded top corners */}
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.welcomeBlock}>
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.welcomeHint}>Sign in to access your programme workspace.</Text>
          </View>

          <Field
            label="Email"
            required
            leftIcon={Mail}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="name@organization.org"
          />
          <Field
            label="Password"
            required
            leftIcon={Lock}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="Enter your password"
          />

          <View style={styles.optionsRow}>
            <View style={styles.flex}>
              <Toggle label="Keep me signed in" value={keepSignedIn} onChange={setKeepSignedIn} />
            </View>
            <Text
              accessibilityRole="link"
              style={styles.forgot}
              onPress={() =>
                Alert.alert(
                  "Forgot password?",
                  "Ask an administrator to reset your password, or use “Forgot password?” on the web sign-in page.",
                )
              }
            >
              Forgot password?
            </Text>
          </View>

          <ErrorText>{error}</ErrorText>
          <Button title="Sign in" icon={ArrowRight} onPress={handleSignIn} loading={loading} disabled={!email || !password} />

          <Text style={styles.hint}>
            Data you capture offline is stored on this device and uploaded when you are back online.
          </Text>

          {/* Partners */}
          <View style={styles.partners}>
            <View style={styles.partner}>
              <View style={styles.mcCircles}>
                <View style={[styles.mcCircle, { backgroundColor: "#EB001B" }]} />
                <View style={[styles.mcCircle, styles.mcOverlap, { backgroundColor: "#F79E1B" }]} />
              </View>
              <View>
                <Text style={styles.mcName}>Mastercard</Text>
                <Text style={styles.mcSub}>Foundation</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Image source={require("../assets/partners/snv.jpeg")} style={styles.snv} resizeMode="contain" />
          </View>

          {/* Developers only: never shown in a release build. */}
          {__DEV__ ? <Text style={styles.server}>{apiBaseUrl}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  flex: { flex: 1 },
  container: { flexGrow: 1, backgroundColor: colors.navy },
  brand: { alignItems: "center", gap: 4, paddingBottom: 56 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#2F7CF6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    shadowColor: "#2F7CF6",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoText: { fontSize: 32, fontWeight: "700", color: colors.white },
  title: { fontSize: 24, fontWeight: "700", color: colors.white, letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: colors.onNavyMuted, fontWeight: "600" },
  sheet: {
    flexGrow: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  welcomeBlock: { alignItems: "center", gap: 4 },
  welcome: { fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  welcomeHint: { fontSize: 13, color: colors.muted, textAlign: "center" },
  optionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  forgot: { fontSize: 13, fontWeight: "600", color: colors.primary, paddingVertical: 10 },
  hint: { fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 18 },
  partners: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  partner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mcCircles: { flexDirection: "row" },
  mcCircle: { width: 22, height: 22, borderRadius: 11 },
  mcOverlap: { marginLeft: -8, opacity: 0.9 },
  mcName: { fontSize: 12, fontWeight: "700", color: colors.text },
  mcSub: { fontSize: 10, color: colors.muted },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  snv: { width: 64, height: 36, borderRadius: radius.sm },
  server: { fontSize: 11, color: colors.faint, textAlign: "center" },
});
