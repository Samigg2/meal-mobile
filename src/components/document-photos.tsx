import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CircleAlert, CircleCheck, ImageUp, RotateCw } from "lucide-react-native";
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

type PickedPhoto = { type: DocumentType; uri: string; mime: string };

type AttachmentRow ={ id: string; file_name: string; document_type: string | null; created_at: string };

/**
 * A photo goes straight to the server. It is not saved to the phone's files
 * (an ID scan is personal data and would sit unencrypted there); a failed
 * upload can be resent with "Try again" while the page is open.
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
  const [failed, setFailed] = useState<PickedPhoto | null>(null);
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
    // A smaller JPEG: a document stays readable and uploads faster on a weak signal.
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.4 };
    const picked =
      from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    await send({
      type,
      uri: asset.uri,
      mime: asset.mimeType ?? "image/jpeg",
    });
  }

  async function send(photo: PickedPhoto) {
    setError(null);
    setBusy(photo.type);
    try {
      await api.uploadFile(
        "/attachments/upload",
        { uri: photo.uri, mimeType: photo.mime },
        { module, recordId, document_type: photo.type },
      );
      setFailed(null);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      // The photo stays in memory only (not saved to the phone's files), so
      // "Try again" can resend it without taking it again.
      setFailed(photo);
      setError(
        err instanceof ApiError && err.isNetworkError
          ? `The photo did not reach the server (${err.message}). Check the connection and press Try again.`
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
      {failed && !busy && (
        <Button title="Try again" icon={RotateCw} variant="outline" onPress={() => void send(failed)} />
      )}
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
