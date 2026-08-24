import * as ImagePicker from "expo-image-picker";

import type { LocalFile } from "@/lib/backend/client";

// Opens the photo library and returns the chosen image as an uploadable file,
// or null when the user backs out. Only images: the backend accepts nothing
// else from the composer.
export async function pickImage(): Promise<LocalFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Photo access is turned off for Vivid.");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    allowsMultipleSelection: false,
  });
  if (result.canceled || !result.assets.length) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("Only images can be attached");
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    type: mime,
  };
}
