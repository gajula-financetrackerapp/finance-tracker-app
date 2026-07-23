import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { uid } from '../utils';

export type AdMediaPick = {
  uri: string;
  mediaType: 'image' | 'video';
};

async function ensureAdsDir() {
  const dir = `${FileSystem.documentDirectory}ads/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function extFromUri(uri: string, mediaType: 'image' | 'video') {
  const clean = uri.split('?')[0].toLowerCase();
  const match = clean.match(/\.([a-z0-9]+)$/);
  if (match?.[1]) return match[1];
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

/** Copy picked media into app storage so it survives cache clears. */
export async function persistAdMedia(
  sourceUri: string,
  mediaType: 'image' | 'video',
): Promise<string> {
  const dir = await ensureAdsDir();
  const dest = `${dir}${uid()}.${extFromUri(sourceUri, mediaType)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function clearPersistedAdMedia(uri?: string | null) {
  if (!uri || !uri.includes('/ads/')) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}

async function requestLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Photos', 'Allow photo library access to upload an ad image or video.');
    return false;
  }
  return true;
}

async function pickFromLibrary(
  mediaTypes: Array<'images' | 'videos'>,
  asType: 'image' | 'video',
): Promise<AdMediaPick | null> {
  if (!(await requestLibrary())) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    quality: 0.85,
    allowsEditing: false,
    videoMaxDuration: 30,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const uri = await persistAdMedia(result.assets[0].uri, asType);
  return { uri, mediaType: asType };
}

/** Pick video for the muted intro phase. */
export async function pickAdBannerVideo(): Promise<AdMediaPick | null> {
  return pickFromLibrary(['videos'], 'video');
}

/** Pick image for the post-video end card (or image-only ads). */
export async function pickAdBannerImage(): Promise<AdMediaPick | null> {
  return pickFromLibrary(['images'], 'image');
}

/** @deprecated Prefer pickAdBannerVideo / pickAdBannerImage */
export async function pickAdBannerMedia(): Promise<AdMediaPick | null> {
  if (!(await requestLibrary())) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.85,
    allowsEditing: false,
    videoMaxDuration: 30,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const asset = result.assets[0];
  const mediaType: 'image' | 'video' =
    asset.type === 'video' || (asset.duration != null && asset.duration > 0) ? 'video' : 'image';
  const uri = await persistAdMedia(asset.uri, mediaType);
  return { uri, mediaType };
}
