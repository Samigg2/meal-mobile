import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CircleAlert, CircleCheck, ImageUp } from "lucide-react-native";
import { api, ApiError } from "@/lib/api";
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

type AttachmentRow = { id: string; file_name: string; document_type: string | null; created_at: string };

/**
 * A photo goes straight to the server. With no connection it is not kept on
 * the phone (an ID scan is personal data and the photo would sit unencrypted
 * in the phone's files): the document is added from this page once online.
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
  const onFile = new Set((files.data ?? []).map((f) => f.document_type).filter(Boolean));

  async function add(type: DocumentType, from: "camera" | "library") {
    setError(null);
    const permission =
      from === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(from === "camera" ? "Allow the camera to take the photo." : "Allow access to photos to choose one.");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6 };
    const picked =
      from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;

    const form = new FormData();
    // React Native's FormData takes a file as { uri, name, type }.
    form.append("file", {
      uri: asset.uri,
      name: asset.fileName ?? `${type}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
    form.append("module", module);
    form.append("recordId", recordId);
    form.append("document_type", type);
    setBusy(type);
    try {
      await api.upload("/attachments/upload", form);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setError(
        err instanceof ApiError && err.isNetworkError
          ? "No connection: the photo was not kept. Add it here once you are online."
          : err instanceof Error
            ? err.message
            : "The photo did not upload",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Documents</Text>
      <ErrorText>{error}</ErrorText>
      {types.map((t, i) => {
        const done = onFile.has(t);
        return (
          <View key={t} style={[styles.row, i > 0 && styles.divider]}>
            <View style={styles.head}>
              {done ? (
                <CircleCheck size={18} color={colors.success} />
              ) : (
                <CircleAlert size={18} color={colors.warning} />
              )}
              <Text style={styles.label}>{DOCUMENT_TYPES[t]}</Text>
              <Text style={[styles.state, { color: done ? colors.success : colors.warning }]}>
                {done ? "On file" : "Missing"}
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
