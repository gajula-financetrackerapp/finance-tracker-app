import { supabase, isSupabaseConfigured, type Profile } from './supabase';

const PROFILE_COLS =
  'id, email, full_name, role, is_premium, premium_since, premium_ended_at, cloud_purge_at, active_session_id';

function asProfile(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' && typeof r.id !== 'number') return null;
  return {
    id: String(r.id),
    email: (r.email as string) || null,
    full_name: (r.full_name as string) || null,
    role: ((r.role as string) || 'user') as Profile['role'],
    is_premium: r.is_premium as boolean | undefined,
    premium_since: (r.premium_since as string) || null,
    premium_ended_at: (r.premium_ended_at as string) || null,
    cloud_purge_at: (r.cloud_purge_at as string) || null,
    active_session_id: (r.active_session_id as string) || null,
  };
}

export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .maybeSingle();
  if (!error && data) return data as Profile;

  if (error) console.warn('[profile] fetch failed', error.message);

  const legacy = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (legacy.error) {
    console.warn('[profile] legacy fetch failed', legacy.error.message);
    return null;
  }
  return asProfile(legacy.data);
}

/** Ensure a profiles row exists (covers signups before the DB trigger ran). */
export async function ensureUserProfile(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
}): Promise<Profile | null> {
  const existing = await fetchUserProfile(input.userId);
  if (existing) return existing;

  const email = input.email || '';
  const fullName = input.fullName?.trim() || email.split('@')[0] || 'User';

  const { error } = await supabase.from('profiles').insert({
    id: input.userId,
    email,
    full_name: fullName,
    role: 'user',
  });
  if (error) {
    console.warn('[profile] ensure insert failed', error.message);
  }
  return fetchUserProfile(input.userId);
}

async function syncAuthFullName(name: string) {
  try {
    await supabase.auth.updateUser({ data: { full_name: name } });
  } catch (err) {
    console.warn('[profile] auth metadata update skipped', err);
  }
}

/** Update display name in `profiles` (+ auth metadata). Email is never changed. */
export async function updateUserFullName(
  userId: string,
  fullName: string,
  email?: string | null,
): Promise<{ error: string | null; profile: Profile | null }> {
  const name = fullName.trim();
  if (!name) return { error: 'Name is required', profile: null };
  if (!isSupabaseConfigured) return { error: 'Supabase is not configured', profile: null };

  // 1) Preferred: security-definer RPC
  const rpc = await supabase.rpc('set_my_full_name', { new_name: name });
  if (!rpc.error) {
    const fromRpc = asProfile(rpc.data);
    if (fromRpc?.full_name) {
      await syncAuthFullName(name);
      return { error: null, profile: fromRpc };
    }
  } else {
    console.warn('[profile] RPC set_my_full_name:', rpc.error.message);
  }

  // 2) Fallback: direct UPDATE (no upsert), then re-fetch
  await ensureUserProfile({ userId, email, fullName: name });

  const upd = await supabase
    .from('profiles')
    .update({
      full_name: name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (upd.error) {
    console.warn('[profile] update failed', upd.error.message);
    const hint =
      upd.error.message.includes('row-level security') || rpc.error
        ? `\n\nIn Supabase SQL Editor, run the full contents of fix_profile_name_rls.sql again, then reload the app.`
        : '';
    return {
      error: (upd.error.message || rpc.error?.message || 'Update failed') + hint,
      profile: null,
    };
  }

  const profile = await fetchUserProfile(userId);
  if (profile && (profile.full_name || '').trim() === name) {
    await syncAuthFullName(name);
    return { error: null, profile };
  }

  // 3) Last resort: auth metadata only (UI can still show the name from session)
  await syncAuthFullName(name);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  if (metaName === name) {
    return {
      error: null,
      profile: {
        id: userId,
        email: email || user?.email || null,
        full_name: name,
        role: (profile?.role as Profile['role']) || 'user',
      },
    };
  }

  return {
    error:
      (rpc.error?.message || 'Could not save name to profiles.') +
      '\n\nOpen Supabase → SQL Editor → paste and run ALL of fix_profile_name_rls.sql → confirm Success → reload the app and try again.',
    profile: null,
  };
}
