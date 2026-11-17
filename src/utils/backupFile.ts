import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { isEncryptedBackupJson } from '../lib/dataEncryption';

/** Share a full JSON backup via the system share sheet (email, Files, Drive, …). */
export async function shareJsonBackup(json: string, appName = 'MoneyLit'): Promise<boolean> {
  let path: string | null = null;
  try {
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) return false;
    const encrypted = isEncryptedBackupJson(json);
    path = `${dir}moneylit-backup-${Date.now()}.${encrypted ? 'mlbackup' : 'json'}`;
    await FileSystem.writeAsStringAsync(path, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return false;
    await Sharing.shareAsync(path, {
      mimeType: encrypted ? 'application/octet-stream' : 'application/json',
      dialogTitle: `${appName} backup`,
      UTI: 'public.json',
    });
    return true;
  } catch (err) {
    console.warn('[backup] share failed', err);
    return false;
  } finally {
    if (path) {
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    }
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
    try {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } finally {
      if (FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory)) {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    }
  } catch (err) {
    console.warn('[backup] pick failed', err);
    return null;
  }
}
