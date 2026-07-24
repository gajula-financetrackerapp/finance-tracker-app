import { supabase, isSupabaseConfigured } from './supabase';

/** Upload a local bill image for Premium sync. Returns storage path or null. */
export async function uploadBillImage(
  userId: string,
  txnId: string,
  localUri: string,
): Promise<string | null> {
  if (!isSupabaseConfigured || !userId || !txnId || !localUri) return null;
  try {
    const path = `${userId}/${txnId}.jpg`;
    const res = await fetch(localUri);
    const blob = await res.blob();
    const { error } = await supabase.storage.from('bill-images').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.warn('[billStorage] upload failed', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.warn('[billStorage] upload error', err);
    return null;
  }
}

export async function deleteBillImage(path: string): Promise<void> {
  if (!isSupabaseConfigured || !path) return;
  const { error } = await supabase.storage.from('bill-images').remove([path]);
  if (error) console.warn('[billStorage] delete failed', error.message);
}

/** Wipe all bill images for a user (Premium delete-cloud). */
export async function deleteAllBillImages(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;
  const { data, error } = await supabase.storage.from('bill-images').list(userId);
  if (error || !data?.length) return;
  const paths = data.map((f) => `${userId}/${f.name}`);
  await supabase.storage.from('bill-images').remove(paths);
}
