import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { clearQueue, removeFromQueue, syncQueue } from "@/lib/queue";
import { useQueue } from "@/lib/net";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { colors, spacing } from "@/lib/theme";

export default function Sync() {
  const items = useQueue();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const { synced, failed } = await syncQueue();
      await queryClient.invalidateQueries();
      setResult(
        synced === 0 && failed === 0
          ? "Nothing to sync."
          : `${synced} uploaded${failed ? `, ${failed} still pending` : ""}.`,
      );
    } finally {
      setSyncing(false);
    }
  }

  function confirmClear() {
    Alert.alert(
      "Discard queued submissions?",
      "The submissions stored on this device will be deleted and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => void clearQueue() },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.title}>
              {items.length} submission{items.length === 1 ? "" : "s"} on this device
            </Text>
            <Text style={styles.meta}>Captured offline and not yet uploaded.</Text>
          </View>
        </View>
        <Button title="Sync now" onPress={handleSync} loading={syncing} disabled={items.length === 0} />
        {items.length > 0 ? <Button title="Discard all" variant="outline" onPress={confirmClear} /> : null}
        {result ? <Text style={styles.result}>{result}</Text> : null}
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing queued"
          message="Registrations and survey responses captured without a connection appear here."
        />
      ) : (
        items.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <Text style={styles.meta}>
              {item.kind === "participant" ? "Participant registration" : "Survey response"} ·{" "}
              {new Date(item.createdAt).toLocaleString()}
            </Text>
            <View style={styles.badgeRow}>
              {item.attempts > 0 ? <Badge text={`${item.attempts} attempt(s)`} tone="warning" /> : null}
              {item.lastError ? <Badge text={item.lastError} tone="danger" /> : null}
            </View>
            <Button title="Discard" variant="outline" onPress={() => void removeFromQueue(item.id)} />
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  card: { gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted },
  itemLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  badgeRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  result: { fontSize: 13, color: colors.success, fontWeight: "500" },
});
