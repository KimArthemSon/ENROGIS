import { Directory, File, Paths } from "expo-file-system";
import { Album, Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";

const ALBUM_NAME = "ENROGIS";
const photosDir = () => new Directory(Paths.document, "photos");

/**
 * Copies a freshly taken camera photo (a temporary file) into the app's own
 * storage so it stays available offline, and returns the new uri.
 */
export async function persistPhoto(tempUri: string): Promise<string> {
  const dir = photosDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const source = new File(tempUri);
  const dest = new File(dir, `photo_${Date.now()}.jpg`);
  await source.copy(dest);
  return dest.uri;
}

export type GallerySaveResult = { ok: true } | { ok: false; message: string };

/** Saves a copy to the phone's gallery (Photos / Gallery app) in an "ENROGIS" album. */
export async function saveToGallery(uri: string): Promise<GallerySaveResult> {
  try {
    const perm = await requestPermissionsAsync(true, ["photo"]);
    if (!perm.granted) {
      return { ok: false, message: "Allow ENROGIS to save photos in your phone settings, then try again." };
    }
    const album = await Album.get(ALBUM_NAME);
    if (album) {
      await Asset.create(uri, album);
    } else {
      const asset = await Asset.create(uri);
      await Album.create(ALBUM_NAME, [asset], true);
    }
    return { ok: true };
  } catch (e) {
    console.warn("Could not save photo to gallery:", e);
    return { ok: false, message: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Opens the share sheet so the photo can be sent or saved to Files / Drive. */
export async function sharePhoto(uri: string) {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg", dialogTitle: "Save or share photo" });
  return true;
}

/** Removes the app's private copy. The gallery copy is left for the user. */
export function deleteLocalPhotoFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn("Could not delete photo file:", e);
  }
}

/** EXIF tags that geotag the photo; expo-camera writes the hemisphere refs itself. */
export function gpsExif(latitude: number, longitude: number, altitude?: number | null) {
  const exif: Record<string, number | string> = {
    GPSLatitude: latitude,
    GPSLongitude: longitude,
  };
  if (altitude != null) exif.GPSAltitude = altitude;
  return exif;
}
