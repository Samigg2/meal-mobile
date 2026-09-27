import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { Button, ErrorText, Field, Text, Toggle } from "@/components/ui";
import { apiBaseUrl } from "@/lib/api";
import { colors, radius, spacing } from "@/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (!EMAIL.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* Brand header: navy with soft decorative rings */}
        <View style={[styles.brand, { paddingTop: insets.top + 48 }]}>
          <View pointerEvents="none" style={[styles.ring, styles.ringLarge]} />
          <View pointerEvents="none" style={[styles.ring, styles.ringSmall]} />
          <View pointerEvents="none" style={styles.glow} />

          <View style={styles.logoOuter}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>R</Text>
              <View style={styles.logoBadge}>
                <Text style={styles.logoBadgeText}>II</Text>
              </View>
            </View>
          </View>
          <Text style={styles.title}>RAYEE II</Text>
          <Text style={styles.subtitle}>Monitoring, Evaluation, Accountability & Learning</Text>
          <View style={styles.chip}>
            <View style={styles.chipDot} />
            <Text style={styles.chipText}>Field data collection</Text>
          </View>
        </View>

        {/* Sign-in sheet */}
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.welcomeBlock}>
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.welcomeHint}>Sign in with your programme account</Text>
          </View>

          <View style={styles.form}>
            <Field
              label="Email"
              leftIcon={Mail}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError(null);
              }}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              placeholder="name@organization.org"
            />
            <Field
              label="Password"
              leftIcon={Lock}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (email && password && !loading) void handleSignIn();
              }}
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
                    "Ask your administrator to reset it, or use “Forgot password?” on the web sign-in page.",
                  )
                }
              >
                Forgot password?
              </Text>
            </View>

            <ErrorText>{error}</ErrorText>
            <Button
              title="Sign in"
              icon={ArrowRight}
              onPress={handleSignIn}
              loading={loading}
              disabled={!email || !password}
            />
          </View>

          <View style={styles.partnersBlock}>
            <View style={styles.partnersLabelRow}>
              <View style={styles.rule} />
              <Text style={styles.partnersLabel}>IN PARTNERSHIP WITH</Text>
              <View style={styles.rule} />
            </View>
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
          </View>

          <View style={styles.footer}>
            <ShieldCheck size={13} color={colors.faint} />
            <Text style={styles.footerText}>Secure sign-in · Version {version}</Text>
          </View>

          {/* Developers only: never shown in a release build. */}
          {__DEV__ ? <Text style={styles.server}>{apiBaseUrl}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const BRAND_BLUE = "#2F7CF6";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  flex: { flex: 1 },
  container: { flexGrow: 1, backgroundColor: colors.navy },

  brand: { alignItems: "center", paddingBottom: 64, paddingHorizontal: spacing.xl, overflow: "hidden" },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  ringLarge: { width: 420, height: 420, top: -210, right: -160 },
  ringSmall: { width: 240, height: 240, bottom: -120, left: -110, borderColor: "rgba(255,255,255,0.06)" },
  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: 10,
    backgroundColor: BRAND_BLUE,
    opacity: 0.12,
  },

  logoOuter: {
    padding: 6,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: spacing.lg,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: BRAND_BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BRAND_BLUE,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  logoText: { fontSize: 34, fontWeight: "800", color: colors.white, marginTop: -2 },
  logoBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    minWidth: 26,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBadgeText: { fontSize: 11, fontWeight: "800", color: colors.navy },

  title: { fontSize: 28, fontWeight: "800", color: colors.white, letterSpacing: 1 },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.onNavyMuted,
    fontWeight: "500",
    textAlign: "center",
  },
  chip: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.white },

  sheet: {
    flexGrow: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -32,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl + 4,
    gap: spacing.xl,
  },
  welcomeBlock: { gap: 4 },
  welcome: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  welcomeHint: { fontSize: 14, color: colors.muted },
  form: { gap: spacing.lg },
  optionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: -spacing.xs },
  forgot: { fontSize: 13, fontWeight: "600", color: colors.primary, paddingVertical: 10 },

  partnersBlock: { gap: spacing.md, marginTop: "auto" },
  partnersLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  partnersLabel: { fontSize: 10, fontWeight: "700", color: colors.faint, letterSpacing: 1.2 },
  partners: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg },
  partner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mcCircles: { flexDirection: "row" },
  mcCircle: { width: 22, height: 22, borderRadius: 11 },
  mcOverlap: { marginLeft: -8, opacity: 0.9 },
  mcName: { fontSize: 12, fontWeight: "700", color: colors.text },
  mcSub: { fontSize: 10, color: colors.muted },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  snv: { width: 64, height: 36, borderRadius: radius.sm },

  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: -spacing.sm },
  footerText: { fontSize: 11, color: colors.faint },
  server: { fontSize: 11, color: colors.faint, textAlign: "center", marginTop: -spacing.md },
});
