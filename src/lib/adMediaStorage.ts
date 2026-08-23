import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { supabase, isSupabaseConfigured } from './supabase';
import type { AdBannerConfig, AdCreative } from '../types';

const BUCKET = 'ad-media';

/**
 * A picked file the admin has not shared yet. persistAdMedia copies picks into
 * documentDirectory/ads/, which is a path only this phone can open — anything
 * still pointing there has to be uploaded before the banner means anything on
 * another device. An https URL is already shared and is left alone.
 */
function needsUpload(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  return !/^https?:\/\//i.test(uri);
}

function contentTypeFor(uri: string, mediaType: 'image' | 'video' | null): string {
  const ext = uri.split('?')[0].toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
}

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload one local file and hand back the URL every phone can read. */
async function uploadOne(
  localUri: string,
  mediaType: 'image' | 'video' | null,
  name: string,
): Promise<{ url: string | null; error: string | null }> {
  const ext = localUri.split('?')[0].toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || 'jpg';
  const path = `${name}.${ext}`;
  const contentType = contentTypeFor(localUri, mediaType);

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { url: null, error: 'Sign in again to share ad media.' };

  // Streamed from disk rather than read into memory first: a 30-second video is
  // far past the size where base64 in a string is reasonable.
  const result = await FileSystem.uploadAsync(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    localUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
    },
  );
  if (result.status === 200 || result.status === 201) {
    return { url: publicUrlFor(path), error: null };
  }
  let message = `Upload failed (${result.status})`;
  try {
    const body = JSON.parse(result.body) as { message?: string; error?: string };
    message = body.message || body.error || message;
  } catch {
    if (result.body) message = String(result.body).slice(0, 200);
  }
  return { url: null, error: message };
}

/**
 * Swap every local file in the banner for a shared URL.
 *
 * Returns the banner unchanged when there is nothing local left, so a save that
 * only renamed a creative does not re-upload its video. On failure the local
 * URI is kept: the admin's own phone still plays the creative, and the error
 * says why nobody else will.
 */
export async function uploadAdBannerMedia(
  banner: AdBannerConfig,
): Promise<{ banner: AdBannerConfig; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { banner, error: 'Cloud is not configured.' };
  }
  const local = banner.items.filter(
    (item) => needsUpload(item.mediaUri) || needsUpload(item.endImageUri),
  );
  if (!local.length) return { banner, error: null };

  let firstError: string | null = null;
  const items: AdCreative[] = [];
  for (const item of banner.items) {
    const next = { ...item };
    if (needsUpload(item.mediaUri)) {
      const up = await uploadOne(item.mediaUri, item.mediaType, `${item.id}-media`);
      if (up.url) next.mediaUri = up.url;
      else firstError = firstError || up.error;
    }
    if (needsUpload(item.endImageUri)) {
      const up = await uploadOne(item.endImageUri, 'image', `${item.id}-end`);
      if (up.url) next.endImageUri = up.url;
      else firstError = firstError || up.error;
    }
    items.push(next);
  }
  return { banner: { ...banner, items }, error: firstError };
}
