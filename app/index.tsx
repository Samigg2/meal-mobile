import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { StartScreen } from "@/components/brand-splash";

/** Entry point: waits for the stored session, then routes accordingly. */
export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) return <StartScreen />;
  return <Redirect href={user ? "/(tabs)" : "/sign-in"} />;
}
