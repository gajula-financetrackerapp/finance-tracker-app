import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { uid } from '../utils';

async function ensureBillsDir() {
  const dir = `${FileSystem.documentDirectory}bills/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

/** Copy a picked/captured image into app storage so it survives cache clears. */
export async function persistBillImage(sourceUri: string): Promise<string> {
  const dir = await ensureBillsDir();
  const ext = sourceUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const dest = `${dir}${uid()}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

async function requestCamera() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Camera', 'Allow camera access to snap a bill.');
    return false;
  }
  return true;
}

async function requestLibrary() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Photos', 'Allow photo library access to upload a bill.');
    return false;
  }
  return true;
}

/** Raw camera capture — crop/save happens in BillImageEditor. */
export async function pickBillFromCamera(): Promise<string | null> {
  if (!(await requestCamera())) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
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
    quality: 0.9,
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
  Alert.alert('Bill / receipt', 'Snap or upload a bill image, then crop and tap Save.', [
    {
      text: 'Take photo',
      onPress: () => {
        void pickBillFromCamera().then((uri) => {
          if (uri) onPickedRaw(uri);
        });
      },
    },
    {
      text: 'Upload from gallery',
      onPress: () => {
        void pickBillFromLibrary().then((uri) => {
          if (uri) onPickedRaw(uri);
        });
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
