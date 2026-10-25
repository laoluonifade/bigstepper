import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { api } from './api';
import { confirm } from './dialog';

export type PickedPhoto = { uri: string; width: number; height: number };

/**
 * Pick a photo from the library (or take one), scaled down to `maxSide` as JPEG like the web's
 * `prepare`, so uploads stay small on mobile data. Resolves null when the runner cancels.
 */
export async function pickPhoto({ camera = false, maxSide = 800, square = false }: { camera?: boolean; maxSide?: number; square?: boolean } = {}): Promise<PickedPhoto | null> {
  const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    void confirm({ title: camera ? 'Camera access is off' : 'Photo access is off', message: `Allow Jump to use your ${camera ? 'camera' : 'photos'} in Settings to add a picture.`, cancelLabel: 'Not now', confirmLabel: 'Open Settings' })
      .then((ok) => { if (ok) void Linking.openSettings(); });
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: square, ...(square ? { aspect: [1, 1] as [number, number] } : {}) };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const scale = Math.min(1, maxSide / Math.max(asset.width, asset.height));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize(asset.width >= asset.height ? { width: Math.round(asset.width * scale) } : { height: Math.round(asset.height * scale) });
  const image = await (await context.renderAsync()).saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
  return { uri: image.uri, width: image.width, height: image.height };
}

/** Uploads a picked photo as multipart `file` to an API path. */
export function uploadPhoto<T>(path: string, photo: PickedPhoto, { field = 'file', name = 'photo.jpg', extra }: { field?: string; name?: string; extra?: Record<string, string> } = {}) {
  const form = new FormData();
  // React Native's FormData takes a file descriptor object in place of a Blob.
  form.append(field, { uri: photo.uri, name, type: 'image/jpeg' } as unknown as Blob);
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  return api<T>(path, { method: 'POST', body: form });
}
