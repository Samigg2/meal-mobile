import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useAutoSync } from "@/lib/auto-sync";
// Defines the background send task at start-up, as the task manager requires.
import "@/lib/background-sync";
import { StartScreen } from "@/components/brand-splash";
import { Button, Text } from "@/components/ui";
import { reportError } from "@/lib/error-report";
import { colors, fontFamilies, spacing } from "@/theme";

/** Sends the offline queue on its own while someone is signed in (lib/auto-sync.ts). */
function AutoSync() {
  useAutoSync();
  return null;
}

/** Screens that need no session (a young person registering herself, sign-in, Fayida's return). */
const PUBLIC_SCREENS = new Set(["", "index", "sign-in", "register", "registration-status", "forgot-password", "fayida"]);

/**
 * Only the tabs used to check for a session, so a screen opened from a link or
 * left open (a participant, Sync) still showed its saved copy after the session
 * ended. Every screen now goes to sign-in once there is no session, and what
 * the session had loaded is dropped from memory.
 */
function SessionGuard() {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const queryClient = useQueryClient();
  const screen = segments[0] ?? "";
  const open = PUBLIC_SCREENS.has(screen);
  useEffect(() => {
    if (!ready || user) return;
    queryClient.clear();
    if (!open) router.replace("/sign-in");
  }, [ready, user, open, queryClient, router]);
  return null;
}

/**
 * A screen that crashed (deep review, 2026-10-31). It used to close the whole
 * app; now it says so, offers Try again, and the crash is sent to the server's log.
 * Waiting forms are not touched: they are saved on the phone, not in the screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, "screen");
  }, [error]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 17, fontFamily: fontFamilies["700"], color: colors.text, textAlign: "center" }}>
        This screen stopped working
      </Text>
      <Text style={{ marginTop: spacing.sm, marginBottom: spacing.lg, color: colors.muted, textAlign: "center" }}>
        Your saved and waiting forms are safe on this phone. Try again, or go back and open it once more.
      </Text>
      <Button title="Try again" onPress={() => void retry()} />
    </View>
  );
}

export default function RootLayout() {
  // Field devices are often on slow or intermittent connections: keep data a
  // little longer and retry once rather than failing the screen.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
      }),
  );

  // Plus Jakarta Sans. If it cannot load, the app carries on in the system font.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return <StartScreen />;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <AutoSync />
          <SessionGuard />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.card },
              headerShadowVisible: false,
              headerTitleStyle: { color: colors.text, fontSize: 17, fontFamily: fontFamilies["700"] },
              headerTintColor: colors.primary,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            {/* No session needed: a young person registering herself. */}
            <Stack.Screen name="register" options={{ title: "Register yourself" }} />
            <Stack.Screen name="registration-status" options={{ title: "My registration" }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="participants/new" options={{ title: "Register participant" }} />
            <Stack.Screen name="participants/[id]" options={{ title: "Participant" }} />
            <Stack.Screen name="participants/edit/[id]" options={{ title: "Edit participant" }} />
            <Stack.Screen name="surveys/[id]" options={{ title: "Collect response" }} />
            <Stack.Screen name="surveys/mine" options={{ title: "My responses" }} />
            <Stack.Screen name="training/index" options={{ title: "Trainings" }} />
            <Stack.Screen name="training/[id]" options={{ title: "Take attendance" }} />
            <Stack.Screen name="safeguarding/new" options={{ title: "Report a concern" }} />
            <Stack.Screen name="feedback/new" options={{ title: "Record feedback" }} />
            <Stack.Screen name="finance/index" options={{ title: "Loans" }} />
            <Stack.Screen name="employment/index" options={{ title: "Jobs" }} />
            <Stack.Screen name="profile" options={{ title: "My profile" }} />
            <Stack.Screen name="enterprises/new" options={{ title: "New enterprise" }} />
            <Stack.Screen name="enterprises/[id]" options={{ title: "Enterprise" }} />
            <Stack.Screen name="training/event" options={{ title: "Training" }} />
            <Stack.Screen name="enterprises/performance" options={{ title: "Enterprise visit" }} />
            <Stack.Screen name="finance/loan" options={{ title: "Record a loan" }} />
            <Stack.Screen name="finance/repayment" options={{ title: "Record a repayment" }} />
            <Stack.Screen name="employment/new" options={{ title: "Record a job" }} />
            <Stack.Screen name="employment/follow-up" options={{ title: "Job follow-up" }} />
            <Stack.Screen name="activities/index" options={{ title: "Work plan" }} />
            <Stack.Screen name="activities/[id]" options={{ title: "Update progress" }} />
            <Stack.Screen name="sync" options={{ title: "Offline queue" }} />
            <Stack.Screen name="search" options={{ title: "Search" }} />
            <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
            <Stack.Screen name="forgot-password" options={{ title: "Forgot password" }} />
            <Stack.Screen name="access" options={{ title: "Your access" }} />
            <Stack.Screen name="documents" options={{ title: "Documents" }} />
            {/* mealmis://fayida: back from Fayida's page; steps aside at once. */}
            <Stack.Screen name="fayida" options={{ headerShown: false, animation: "none" }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
