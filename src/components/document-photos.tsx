import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CircleAlert, CircleCheck, ImageUp } from "lucide-react-native";
import { api } from "@/lib/api";
import { pickPhoto } from "@/lib/photos";
import { sendOrQueuePhoto } from "@/lib/queue";
import { Button, Card, ErrorText, Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

/**
 * Documents a record needs before a second person verifies it (the web's
 * required-documents.ts, 2026-10-25). The server is what refuses; here each
 * shows as on file or missing, with Take photo / Choose photo.
 */
export const DOCUMENT_TYPES = {
  loan_agreement: "Signed loan agreement",
  repayment_receipt: "Repayment receipt",
  placement_evidence: "Placement evidence (contract, letter or payslip)",
  kebele_id_scan: "Kebele ID scan",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

type AttachmentRow ={ id: string; file_name: string; document_type: string | null; created_at: string };

/**
 * A photo goes to the server when there is a connection. With none, it waits
 * on the phone encrypted in the sync queue (12Beforeend; it used to be lost)
 * and is sent on its own when the phone is back online.
 */
export function DocumentPhotos({
  module,
  recordId,
  types,
}: {
  module: "participants" | "finance" | "employment";
  recordId: string;
  types: DocumentType[];
}) {
  const queryClient = useQueryClient();
  const key = ["attachments", module, recordId];
  const files = useQuery({
    queryKey: key,
    queryFn: () => api.get<AttachmentRow[]>("/attachments", { module, recordId }),
  });
  const [busy, setBusy] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Set<DocumentType>>(new Set());
  const onFile = new Set((files.data ?? []).map((f) => f.document_type).filter(Boolean));

  async function add(type: DocumentType, from: "camera" | "library") {
    setError(null);
    const picked = await pickPhoto(from);
    if (picked === "denied") {
      setError(from === "camera" ? "Allow the camera to take the photo." : "Allow access to photos to choose one.");
      return;
    }
    if (!picked) return;
    setBusy(type);
    try {
      const result = await sendOrQueuePhoto(
        { module, recordId, document_type: type, ...picked },
        `Document photo — ${DOCUMENT_TYPES[type]}`,
      );
      if (result === "queued") setWaiting((prev) => new Set(prev).add(type));
      else await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo was not kept");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Documents</Text>
      <ErrorText>{error}</ErrorText>
      {waiting.size > 0 ? (
        <Text style={styles.note}>No connection: kept on this phone, encrypted, and sent on its own once you are online (see Sync).</Text>
      ) : null}
      {types.map((t, i) => {
        const done = onFile.has(t);
        const queued = !done && waiting.has(t);
        return (
          <View key={t} style={[styles.row, i > 0 && styles.divider]}>
            <View style={styles.head}>
              {done || queued ? (
                <CircleCheck size={18} color={done ? colors.success : colors.warning} />
              ) : (
                <CircleAlert size={18} color={colors.warning} />
              )}
              <Text style={styles.label}>{DOCUMENT_TYPES[t]}</Text>
              <Text style={[styles.state, { color: done ? colors.success : colors.warning }]}>
                {done ? "On file" : queued ? "Waiting to send" : "Missing"}
              </Text>
            </View>
            <View style={styles.buttons}>
              <View style={styles.grow}>
                <Button
                  title="Take photo"
                  icon={Camera}
                  variant="outline"
                  loading={busy === t}
                  onPress={() => void add(t, "camera")}
                />
              </View>
              <View style={styles.grow}>
                <Button title="Choose" icon={ImageUp} variant="outline" onPress={() => void add(t, "library")} />
              </View>
            </View>
          </View>
        );
      })}
      <Text style={styles.note}>Needed before a second person verifies it.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  row: { gap: spacing.sm, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  state: { fontSize: 12, fontWeight: "700" },
  buttons: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  note: { fontSize: 12, color: colors.muted },
});
