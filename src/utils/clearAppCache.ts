import * as FileSystem from 'expo-file-system';

export type ClearCacheResult = {
  ok: boolean;
  filesRemoved: number;
  bytesFreed: number;
  error?: string;
};

function joinPath(dir: string, name: string) {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

async function entrySize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return 0;
    if (info.isDirectory) {
      const names = await FileSystem.readDirectoryAsync(uri);
      let total = 0;
      for (const name of names) {
        total += await entrySize(joinPath(uri, name));
      }
      return total;
    }
    return typeof info.size === 'number' ? info.size : 0;
  } catch {
    return 0;
  }
}

/** Human-readable size for cache-clear feedback. */
export function formatCacheBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Deletes temporary files in the app cache directory (exports, shared backups, etc.).
 * Does not touch document storage (saved bills, ads) or AsyncStorage finance data.
 */
export async function clearAppCache(): Promise<ClearCacheResult> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    return { ok: false, filesRemoved: 0, bytesFreed: 0, error: 'unavailable' };
  }

  try {
    const names = await FileSystem.readDirectoryAsync(dir);
    if (names.length === 0) {
      return { ok: true, filesRemoved: 0, bytesFreed: 0 };
    }

    let bytesFreed = 0;
    let filesRemoved = 0;
    for (const name of names) {
      const uri = joinPath(dir, name);
      bytesFreed += await entrySize(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      filesRemoved += 1;
    }
    return { ok: true, filesRemoved, bytesFreed };
  } catch (err) {
    console.warn('[cache] clear failed', err);
    return {
      ok: false,
      filesRemoved: 0,
      bytesFreed: 0,
      error: err instanceof Error ? err.message : 'failed',
    };
  }
}
