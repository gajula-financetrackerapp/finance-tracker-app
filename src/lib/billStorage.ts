import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { supabase, isSupabaseConfigured } from './supabase';
import { prepareBillImageForStorage } from '../utils/billImage';

export type BillUploadResult = {
  path: string | null;
  error: string | null;
};

/**
 * Ensure supabase-js has a fresh user JWT.
 * Storage RLS uses auth.uid() from this token — expired/missing JWT → RLS error.
 */
async function ensureAccessToken(): Promise<{ token: string; userId: string } | null> {
  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.data.session?.access_token && refreshed.data.session.user?.id) {
    return {
      token: refreshed.data.session.access_token,
      userId: refreshed.data.session.user.id,
    };
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token && data.session.user?.id) {
    return { token: data.session.access_token, userId: data.session.user.id };
  }

  return null;
}

function storageHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'image/jpeg',
    'x-upsert': 'true',
  };
}

async function uploadViaExpoFileSystem(
  path: string,
  fileUri: string,
  token: string,
): Promise<string | null> {
  const url = `${SUPABASE_URL}/storage/v1/object/bill-images/${path}`;
  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: storageHeaders(token),
  });
  if (result.status === 200 || result.status === 201) return null;
  let msg = `Upload failed (${result.status})`;
  try {
    const body = JSON.parse(result.body) as { message?: string; error?: string };
    msg = body.message || body.error || msg;
  } catch {
    if (result.body) msg = String(result.body).slice(0, 200);
  }
  return msg;
}

async function uploadViaArrayBuffer(
  path: string,
  fileUri: string,
  token: string,
): Promise<string | null> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  if (!base64) return 'Could not read bill image file.';
  const bytes = new Uint8Array(decode(base64));
  const url = `${SUPABASE_URL}/storage/v1/object/bill-images/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: storageHeaders(token),
    body: bytes,
  });
  if (res.ok) return null;
  let msg = `Upload failed (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    msg = body.message || body.error || msg;
  } catch {
    /* ignore */
  }
  return msg;
}

async function uploadViaSupabaseClient(path: string, fileUri: string): Promise<string | null> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  if (!base64) return 'Could not read bill image file.';
  const { error } = await supabase.storage.from('bill-images').upload(path, decode(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  return error?.message || null;
}

/** Upload a local bill image for Premium sync. Returns storage path or null. */
export async function uploadBillImage(
  userId: string,
  txnId: string,
  localUri: string,
): Promise<string | null> {
  const res = await uploadBillImageDetailed(userId, txnId, localUri);
  return res.path;
}

/** Same as uploadBillImage but returns the error message for UI / logs. */
export async function uploadBillImageDetailed(
  _userId: string,
  txnId: string,
  localUri: string,
): Promise<BillUploadResult> {
  if (!isSupabaseConfigured || !txnId || !localUri) {
    return { path: null, error: 'Missing transaction or image.' };
  }
  try {
    const auth = await ensureAccessToken();
    if (!auth?.token || !auth.userId) {
      const msg = 'Not signed in to cloud — sign out and sign in again, then retry.';
      console.warn('[billStorage]', msg);
      return { path: null, error: msg };
    }

    // Path MUST use JWT user id — RLS checks auth.uid() against the folder name.
    const path = `${auth.userId}/${txnId}.jpg`;
    const uploadUri = await prepareBillImageForStorage(localUri);

    let err =
      (await uploadViaExpoFileSystem(path, uploadUri, auth.token).catch((e) =>
        e instanceof Error ? e.message : String(e),
      )) || null;

    if (err) {
      console.warn('[billStorage] expo upload failed, trying fetch', err);
      err =
        (await uploadViaArrayBuffer(path, uploadUri, auth.token).catch((e) =>
          e instanceof Error ? e.message : String(e),
        )) || null;
    }

    if (err) {
      console.warn('[billStorage] fetch upload failed, trying supabase-js', err);
      err =
        (await uploadViaSupabaseClient(path, uploadUri).catch((e) =>
          e instanceof Error ? e.message : String(e),
        )) || null;
    }

    if (err) {
      console.warn('[billStorage] upload failed', err);
      if (/row-level security|violates/i.test(err)) {
        return {
          path: null,
          error:
            'Cloud blocked the upload (storage policy). Re-run supabase/bill_images_bucket.sql in the Supabase SQL Editor, then sign out/in and try again.',
        };
      }
      return { path: null, error: err };
    }

    console.log('[billStorage] uploaded', path);
    return { path, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[billStorage] upload error', msg);
    return { path: null, error: msg };
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
