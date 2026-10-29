import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { api } from "./api";

/**
 * A document photo that waits on the phone (12Beforeend): its bytes travel in
 * the queue's payload, which device-store seals (AES-GCM) like every other
 * waiting form, so an ID scan or receipt is never left readable on the phone.
 * It is written to a file only for the moment it is uploaded.
 */
export type WaitingPhoto = {
  module: "participants" | "finance" | "employment";
  /** Empty while the record it belongs to is itself still waiting. */
  recordId: string;
  document_type: string;
  /** The JPEG, base64. */
  data: string;
  mime: string;
};

/** A photo taken with the camera or chosen from the gallery, as base64; null when cancelled. */
export async function pickPhoto(from: "camera" | "library"): Promise<{ data: string; mime: string } | "denied" | null> {
  const permission =
    from === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return "denied";
  // A smaller JPEG: a document stays readable and uploads faster on a weak signal.
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.4, base64: true };
  const picked =
    from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const data =
    asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
  return { data, mime: asset.mimeType ?? "image/jpeg" };
}

/** Sends one photo to /attachments/upload through a short-lived file, removed afterwards. */
export async function uploadPhoto(photo: WaitingPhoto): Promise<void> {
  if (!photo.recordId) throw new Error("The record this photo belongs to has not been sent yet");
  const uri = `${FileSystem.cacheDirectory}upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.writeAsStringAsync(uri, photo.data, { encoding: FileSystem.EncodingType.Base64 });
  try {
    await api.uploadFile(
      "/attachments/upload",
      { uri, mimeType: photo.mime },
      { module: photo.module, recordId: photo.recordId, document_type: photo.document_type },
    );
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
