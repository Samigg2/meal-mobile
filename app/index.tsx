import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/ui";

/** Entry point: waits for the stored session, then routes accordingly. */
export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading label="Starting…" />;
  return <Redirect href={user ? "/(tabs)" : "/sign-in"} />;
}
