import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { showAppDialog, showAppInfo } from '../appDialog';
import { uid } from '../utils';
import { tr } from '../i18n/translations';

/** Longest edge for stored / uploaded bill images (keeps receipts readable). */
const BILL_MAX_EDGE = 1280;
/** Hard cap — 120KB stays readable and is small enough for Free-tier cloud. */
const BILL_MAX_BYTES = 120 * 1024;
/** Starting JPEG quality; lowered if still too large. */
const BILL_JPEG_QUALITY_START = 0.65;

async function ensureBillsDir() {
  const dir = `${FileSystem.documentDirectory}bills/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}

async function fileBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resizeActions(
  width: number,
  height: number,
  maxEdge: number,
): ImageManipulator.Action[] {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= maxEdge) return [];
  if (width >= height) return [{ resize: { width: maxEdge } }];
  return [{ resize: { height: maxEdge } }];
}

/**
 * Resize + JPEG compress, then keep shrinking until under 120KB.
 */
export async function prepareBillImageForStorage(sourceUri: string): Promise<string> {
  if (!sourceUri) return sourceUri;
  try {
    let { width, height } = await imageSize(sourceUri);
    let maxEdge = BILL_MAX_EDGE;
    let quality = BILL_JPEG_QUALITY_START;
    let uri = sourceUri;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await ImageManipulator.manipulateAsync(
        uri === sourceUri ? sourceUri : uri,
        resizeActions(width, height, maxEdge),
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      uri = result.uri;
      width = result.width;
      height = result.height;

      const size = await fileBytes(uri);
      if (size == null || size <= BILL_MAX_BYTES) {
        return uri;
      }

      // Still too big: lower quality, then shrink dimensions.
      if (quality > 0.4) {
        quality = Math.max(0.35, quality - 0.1);
      } else {
        maxEdge = Math.max(640, Math.round(maxEdge * 0.75));
        quality = Math.max(0.28, quality - 0.05);
      }
    }

    return uri;
  } catch (err) {
    console.warn('[billImage] prepare failed, using original', err);
    return sourceUri;
  }
}

/** Copy a picked/captured image into app storage so it survives cache clears. */
export async function persistBillImage(sourceUri: string): Promise<string> {
  const prepared = await prepareBillImageForStorage(sourceUri);
  const dir = await ensureBillsDir();
  const dest = `${dir}${uid()}.jpg`;
  await FileSystem.copyAsync({ from: prepared, to: dest });
  return dest;
}

async function requestCamera() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    showAppInfo(tr('bill.cameraTitle'), tr('bill.cameraBody'), '📷');
    return false;
  }
  return true;
}

async function requestLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showAppInfo(tr('bill.photosTitle'), tr('bill.photosBody'), '🖼');
    return false;
  }
  return true;
}

/** Raw camera capture — crop/save happens in BillImageEditor. */
export async function pickBillFromCamera(): Promise<string | null> {
  if (!(await requestCamera())) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

/** Raw gallery pick — crop/save happens in BillImageEditor. */
export async function pickBillFromLibrary(): Promise<string | null> {
  if (!(await requestLibrary())) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

/**
 * Ask camera/gallery, then caller should open BillImageEditor with the returned URI.
 * Does not persist until the editor Save button is pressed.
 */
export function promptBillImage(onPickedRaw: (uri: string) => void) {
  showAppDialog({
    title: tr('bill.promptTitle'),
    message: tr('bill.promptBody'),
    icon: '🧾',
    buttons: [
      {
        text: tr('bill.takePhoto'),
        style: 'primary',
        onPress: () => {
          void pickBillFromCamera().then((uri) => {
            if (uri) onPickedRaw(uri);
          });
        },
      },
      {
        text: tr('bill.uploadGallery'),
        onPress: () => {
          void pickBillFromLibrary().then((uri) => {
            if (uri) onPickedRaw(uri);
          });
        },
      },
      { text: tr('common.cancel'), style: 'cancel' },
    ],
  });
}
