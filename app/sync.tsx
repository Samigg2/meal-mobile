import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { CloudCheck, CloudDownload, CloudUpload, Pencil, Trash2 } from "lucide-react-native";
import { clearQueue, formFor, kindLabel, needsAttention, removeFromQueue, syncQueue, type QueuedItem } from "@/lib/queue";
import { useAuth } from "@/lib/auth";
import { downloadForOffline } from "@/lib/data";
import { cachedAt } from "@/lib/offline-cache";
import { LOOKUPS_CACHE_KEY } from "@/lib/reference";
import { useQueue } from "@/lib/net";
import { Badge, Button, Card, EmptyState, IconBox, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

export default function Sync() {
  const items = useQueue();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { can } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<string | null>(null);

  useEffect(() => {
    void cachedAt(LOOKUPS_CACHE_KEY).then(setLastDownload);
  }, []);

  async function handleDownload() {
    setDownloading(true);
    setPercent(0);
    setOfflineStatus(null);
    try {
      const { surveys, trainings } = await downloadForOffline(can, setPercent);
      setOfflineStatus(
        `Reference lists, ${surveys} active survey form${surveys === 1 ? "" : "s"} and ${trainings} training${trainings === 1 ? "" : "s"} near today are on this device.`,
      );
      setLastDownload(await cachedAt(LOOKUPS_CACHE_KEY));
    } catch (err) {
      setOfflineStatus(err instanceof Error ? err.message : "Could not download.");
    } finally {
      setDownloading(false);
    }
  }

  function confirmDiscard(item: QueuedItem) {
    Alert.alert(
      "Discard this submission?",
      `"${item.label}" has not been uploaded. It will be deleted from this device and cannot be recovered.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => void removeFromQueue(item.id) },
      ],
    );
  }

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
          <IconBox icon={CloudDownload} color={colors.primary} tint={colors.primarySoft} size={44} />
          <View style={styles.flex}>
            <Text style={styles.title}>Offline data</Text>
            <Text style={styles.meta}>
              {lastDownload
                ? `Lists and forms last updated ${new Date(lastDownload).toLocaleString()}.`
                : "Not downloaded yet. Do this before going to the field."}
            </Text>
          </View>
        </View>
        <Button
          title={downloading ? `Downloading ${percent}%` : "Download for offline"}
          variant="outline"
          onPress={handleDownload}
          disabled={downloading}
        />
        {offlineStatus ? <Text style={styles.meta}>{offlineStatus}</Text> : null}
      </Card>

      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <IconBox icon={items.length ? CloudUpload : CloudCheck} color={items.length ? colors.warning : colors.success} tint={items.length ? colors.warningSoft : colors.successSoft} size={44} />
          <View style={styles.flex}>
            <Text style={styles.title}>
              {items.length} submission{items.length === 1 ? "" : "s"} on this device
            </Text>
            <Text style={styles.meta}>Captured offline and not yet uploaded.</Text>
          </View>
        </View>
        <Button title="Sync now" onPress={handleSync} loading={syncing} disabled={items.length === 0} />
        {items.length > 0 ? <Button title="Discard all" variant="outlineDanger" icon={Trash2} onPress={confirmClear} /> : null}
        {result ? <Text style={styles.result}>{result}</Text> : null}
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={CloudCheck}
          color={colors.success}
          tint={colors.successSoft}
          title="Nothing queued"
          message="Anything filled in without a connection appears here until it is sent. Tap one to correct it."
        />
      ) : (
        items.map((item) => (
          <Card key={item.id} style={[styles.card, needsAttention(item) && styles.attention]}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <Text style={styles.meta}>
              {kindLabel(item.kind)} ·{" "}
              {new Date(item.createdAt).toLocaleString()}
            </Text>
            <View style={styles.badgeRow}>
              {item.attempts > 0 ? <Badge text={`${item.attempts} attempt(s)`} tone="warning" /> : null}
              {needsAttention(item) ? <Badge text="Needs correcting" tone="danger" /> : null}
            </View>
            {item.lastError ? (
              <Text style={needsAttention(item) ? styles.errorText : styles.meta}>{item.lastError}</Text>
            ) : null}
            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button title="Open and fix" icon={Pencil} onPress={() => router.push(formFor(item) as Href)} />
              </View>
              <View style={styles.flex}>
                <Button title="Discard" variant="outline" onPress={() => confirmDiscard(item)} />
              </View>
            </View>
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
  actions: { flexDirection: "row", gap: spacing.sm },
  badgeRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  result: { fontSize: 13, color: colors.success, fontWeight: "500" },
  attention: { borderColor: colors.danger, borderWidth: 1 },
  errorText: { fontSize: 12, color: colors.danger, lineHeight: 18 },
});
