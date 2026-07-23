import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { CashBooksState } from '../types';
import { buildExportContent, countExportTransactions, type ExportFormat } from './exportSpreadsheet';

export async function shareSpreadsheetExport(
  cashBooks: CashBooksState,
  format: ExportFormat,
): Promise<{ ok: boolean; empty?: boolean; error?: string }> {
  const count = countExportTransactions(cashBooks);
  if (format === 'csv' && count === 0) {
    return { ok: false, empty: true };
  }

  const { content, filename, mimeType, uti } = buildExportContent(cashBooks, format);
  const dir = FileSystem.cacheDirectory;
  if (!dir) return { ok: false, error: 'Storage unavailable' };

  const path = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType,
        dialogTitle: 'Export Pulse Wallet data',
        UTI: uti,
      });
      return { ok: true };
    }
  } catch (e) {
    // Fall through to RN Share.
    console.warn('[export]', e);
  }

  try {
    if (Platform.OS === 'ios') {
      await Share.share({ url: path, title: filename });
    } else {
      await Share.share({
        title: filename,
        message: `Pulse Wallet export: ${filename}`,
        url: path,
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Share failed' };
  }
}
