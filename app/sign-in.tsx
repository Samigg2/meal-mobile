import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { ArrowRight, Lock, Mail, ShieldCheck, UserPlus } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { Button, ErrorText, Field, Text, Toggle } from "@/components/ui";
import { LogoMark } from "@/components/brand-splash";
import { apiBaseUrl } from "@/lib/api";
import { savedRegistration } from "@/lib/public-registration";
import { colors, radius, shadow, spacing } from "@/theme";

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
  const router = useRouter();
  // A registration sent from this phone can be checked without an account.
  const [hasRegistration, setHasRegistration] = useState(false);
  useEffect(() => {
    void savedRegistration.get().then((token) => setHasRegistration(!!token));
  }, []);

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
        {/* Brand band: navy, logo and name; the sign-in card overlaps its bottom edge */}
        <View style={[styles.brand, { paddingTop: insets.top + 40 }]}>
          <View style={styles.logo}>
            <LogoMark />
          </View>
          <Text style={styles.title}>RAYEE II</Text>
          <Text style={styles.subtitle}>Monitoring, Evaluation, Accountability & Learning</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.welcome}>Sign in</Text>
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
                onPress={() => router.push("/forgot-password")}
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
        </View>

        <View style={[styles.below, { paddingBottom: spacing.xl + insets.bottom }]}>
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

          {/* Young people register themselves here; staff review every registration. */}
          <View style={styles.selfRegister}>
            <Text style={styles.selfRegisterText}>New to RAYEE II and not staff?</Text>
            <Button
              title="Register yourself"
              variant="outline"
              icon={UserPlus}
              onPress={() => router.push("/register")}
            />
            {hasRegistration ? (
              <Text accessibilityRole="link" style={styles.forgot} onPress={() => router.push("/registration-status")}>
                Check my registration
              </Text>
            ) : null}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  container: { flexGrow: 1, backgroundColor: colors.white },

  brand: {
    alignItems: "center",
    backgroundColor: colors.navy,
    paddingBottom: 96,
    paddingHorizontal: spacing.xl,
  },
  logo: { marginBottom: spacing.md },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.onNavyMuted,
    fontWeight: "500",
    textAlign: "center",
  },

  card: {
    marginTop: -64,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow,
    elevation: 6,
  },
  welcome: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  form: { gap: spacing.lg },
  below: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.xl },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: -spacing.xs,
  },
  forgot: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    paddingVertical: 10,
  },
  // Spare height on tall phones goes above Register, so the logos stay up by the form.
  selfRegister: { gap: spacing.sm, alignItems: "stretch", marginTop: "auto" },
  selfRegisterText: { fontSize: 13, color: colors.muted, textAlign: "center" },

  partnersBlock: { gap: spacing.md },
  partnersLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  partnersLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.faint,
    letterSpacing: 1.2,
  },
  partners: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  partner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mcCircles: { flexDirection: "row" },
  mcCircle: { width: 22, height: 22, borderRadius: 11 },
  mcOverlap: { marginLeft: -8, opacity: 0.9 },
  mcName: { fontSize: 12, fontWeight: "700", color: colors.text },
  mcSub: { fontSize: 10, color: colors.muted },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  snv: { width: 64, height: 36, borderRadius: radius.sm },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: -spacing.sm,
  },
  footerText: { fontSize: 11, color: colors.faint },
  server: {
    fontSize: 11,
    color: colors.faint,
    textAlign: "center",
    marginTop: -spacing.md,
  },
});
