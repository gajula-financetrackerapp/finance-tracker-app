import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

/** Share a full JSON backup via the system share sheet (email, Files, Drive, …). */
export async function shareJsonBackup(json: string, appName = 'Pulse Wallet'): Promise<boolean> {
  try {
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) return false;
    const path = `${dir}pulse-wallet-backup-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(path, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: `${appName} backup`,
      UTI: 'public.json',
    });
    return true;
  } catch (err) {
    console.warn('[backup] share failed', err);
    return false;
  }
}

/** Pick a previously saved backup JSON file and return its contents. */
export async function pickBackupJson(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    const uri = result.assets[0].uri;
    return FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('[backup] pick failed', err);
    return null;
  }
}
