import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { useAutoSync } from "@/lib/auto-sync";
import { StartScreen } from "@/components/brand-splash";
import { colors, fontFamilies } from "@/theme";

/** Sends the offline queue on its own while someone is signed in (lib/auto-sync.ts). */
function AutoSync() {
  useAutoSync();
  return null;
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
            <Stack.Screen name="training/index" options={{ title: "Training attendance" }} />
            <Stack.Screen name="training/[id]" options={{ title: "Take attendance" }} />
            <Stack.Screen name="safeguarding/new" options={{ title: "Report a concern" }} />
            <Stack.Screen name="feedback/new" options={{ title: "Record feedback" }} />
            <Stack.Screen name="finance/index" options={{ title: "Loans" }} />
            <Stack.Screen name="employment/index" options={{ title: "Jobs" }} />
            <Stack.Screen name="profile" options={{ title: "My profile" }} />
            <Stack.Screen name="enterprises/new" options={{ title: "New enterprise" }} />
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
            {/* mealmis://fayida: back from Fayida's page; steps aside at once. */}
            <Stack.Screen name="fayida" options={{ headerShown: false, animation: "none" }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
