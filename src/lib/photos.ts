import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { api } from "./api";
import { db, isEncrypted, open, seal } from "./device-store";

/**
 * A document photo that waits on the phone (12Beforeend). Since 2026-10-29 the
 * JPEG is kept in its own row of the `photos` table (device-store.ts), which
 * SQLCipher encrypts natively, and the waiting form or photo carries only its id:
 * the queue no longer seals megabytes in JavaScript, so taking a photo or opening
 * Sync does not freeze the screen. Expo Go has no SQLCipher, so there the photo
 * is still sealed (AES-GCM) before it is stored. An ID scan or receipt is never
 * left readable on the phone, and its row is removed once the server has it.
 */
export type KeptPhoto = {
  mime: string;
  /** The row in `photos`. */
  photoId?: string;
  /** Older waiting items (before 2026-10-29): the JPEG itself, base64. */
  data?: string;
};

export type WaitingPhoto = KeptPhoto & {
  module: "participants" | "finance" | "employment";
  /** Empty while the record it belongs to is itself still waiting. */
  recordId: string;
  document_type: string;
};

/** Marks a photo stored sealed in JavaScript (no SQLCipher). */
const SEALED = "s1:";
/** A photo nothing waits for any more (a form left without saving) is removed after this. */
const ORPHAN_AFTER_MS = 60 * 60 * 1000;

async function keep(base64: string): Promise<string> {
  const id = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const data = (await isEncrypted()) ? base64 : SEALED + (await seal(base64));
  await (await db()).runAsync("INSERT INTO photos (id, data, created_at) VALUES (?, ?, ?)", [
    id,
    data,
    new Date().toISOString(),
  ]);
  return id;
}

async function read(photo: KeptPhoto): Promise<string> {
  if (photo.data) return photo.data;
  const row = photo.photoId
    ? await (await db()).getFirstAsync<{ data: string }>("SELECT data FROM photos WHERE id = ?", [photo.photoId])
    : null;
  if (!row) throw new Error("The photo is no longer on this phone. Take it again.");
  return row.data.startsWith(SEALED) ? open(row.data.slice(SEALED.length)) : row.data;
}

/** A photo taken with the camera or chosen from the gallery, kept on the phone; null when cancelled. */
export async function pickPhoto(from: "camera" | "library"): Promise<KeptPhoto | "denied" | null> {
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
  return { photoId: await keep(data), mime: asset.mimeType ?? "image/jpeg" };
}

/**
 * Sends one photo to /attachments/upload through a short-lived file, removed
 * afterwards. The kept copy is removed only once the server has accepted it.
 */
export async function uploadPhoto(photo: WaitingPhoto): Promise<void> {
  if (!photo.recordId) throw new Error("The record this photo belongs to has not been sent yet");
  const uri = `${FileSystem.cacheDirectory}upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.writeAsStringAsync(uri, await read(photo), { encoding: FileSystem.EncodingType.Base64 });
  try {
    await api.uploadFile(
      "/attachments/upload",
      { uri, mimeType: photo.mime },
      { module: photo.module, recordId: photo.recordId, document_type: photo.document_type },
    );
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  if (photo.photoId) await (await db()).runAsync("DELETE FROM photos WHERE id = ?", [photo.photoId]);
}

/**
 * Removes kept photos no waiting item refers to (`inUse`), older than an hour so
 * a form still being filled keeps its photo. `all`: every photo (sign-out, clear).
 */
export async function dropUnusedPhotos(inUse: Set<string>, all = false): Promise<void> {
  try {
    const database = await db();
    if (all) {
      await database.runAsync("DELETE FROM photos");
      return;
    }
    const before = new Date(Date.now() - ORPHAN_AFTER_MS).toISOString();
    const old = await database.getAllAsync<{ id: string }>("SELECT id FROM photos WHERE created_at < ?", [before]);
    for (const { id } of old) if (!inUse.has(id)) await database.runAsync("DELETE FROM photos WHERE id = ?", [id]);
  } catch {
    /* nothing kept */
  }
}
