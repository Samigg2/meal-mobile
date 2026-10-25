import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Loading } from "@/components/ui";

/**
 * Where mealmis://fayida lands when Fayida hands the phone back to the app.
 * The screen that started the check (lib/fayida.ts) takes the result from the
 * link itself; this one only steps aside so that screen shows again.
 */
export default function FayidaReturn() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
  return <Loading label="Back from Fayida…" />;
}
