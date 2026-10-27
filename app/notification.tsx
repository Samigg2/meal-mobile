import { ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BellRing } from "lucide-react-native";
import { phoneRoute } from "@/lib/notification-route";
import { formatDate } from "@/components/date-picker";
import { DetailCard, DetailHeader, DetailText, detailStyles } from "@/components/detail-card";
import { Button, StatusPill } from "@/components/ui";

/**
 * One notification, read: what is waiting, who or what it is about, and when
 * it arrived, with a button to the record when the phone can open it (the rest
 * are finished on the web).
 */
export default function NotificationDetail() {
  const router = useRouter();
  const { group, title, subtitle, created_at, href, seen } = useLocalSearchParams<{
    group?: string;
    title?: string;
    subtitle?: string;
    created_at?: string;
    href?: string;
    seen?: string;
  }>();
  const route = href ? phoneRoute(href) : null;

  return (
    <ScrollView contentContainerStyle={detailStyles.container}>
      <DetailHeader icon={BellRing} title={title ?? "Notification"} subtitle={group}>
        <StatusPill label={seen === "1" ? "Seen" : "New"} tone={seen === "1" ? "grey" : "blue"} />
      </DetailHeader>
      <DetailCard
        title="Details"
        rows={[
          { label: "Waiting since", value: created_at ? formatDate(created_at.slice(0, 10)) : null },
          { label: "Queue", value: group },
        ]}
      >
        <DetailText label="About" text={subtitle} />
        {route ? (
          <Button title="Open the record" onPress={() => router.push(route)} />
        ) : (
          <DetailText label="Next step" text="Finish this on the web app: it cannot be opened on the phone." />
        )}
      </DetailCard>
    </ScrollView>
  );
}
