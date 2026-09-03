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
  if (!isSupabaseConfigured || !input.userId) return null;

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user?.id) {
    console.warn('[profile] skip ensure — not authenticated');
    return null;
  }
  if (auth.user.id !== input.userId) {
    console.warn('[profile] skip ensure — user mismatch');
    return null;
  }

  const email = (input.email || auth.user.email || '').trim();
  const meta = auth.user.user_metadata || {};
  const metaName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';
  const nextName =
    input.fullName?.trim() ||
    metaName.trim() ||
    email.split('@')[0] ||
    'User';

  // Preferred path: security-definer RPC (bypasses brittle insert RLS races).
  // Email is taken from the JWT on the server — never from this argument.
  const rpc = await supabase.rpc('ensure_my_profile', {
    full_name: nextName,
    email: null,
  });
  if (!rpc.error && rpc.data) {
    return asProfile(rpc.data) || (await fetchUserProfile(input.userId));
  }
  if (rpc.error && !/Could not find the function|PGRST202|404/i.test(rpc.error.message)) {
    console.warn('[profile] ensure_my_profile RPC', rpc.error.message);
  }

  const existing = await fetchUserProfile(input.userId);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (nextName && !(existing.full_name || '').trim()) patch.full_name = nextName;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error } = await supabase.from('profiles').update(patch).eq('id', input.userId);
      if (error) console.warn('[profile] ensure update failed', error.message);
      return fetchUserProfile(input.userId);
    }
    return existing;
  }

  // Role is left out on purpose: admin comes from Supabase, never the client.
  const { error } = await supabase.from('profiles').upsert(
    {
      id: input.userId,
      full_name: nextName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.warn('[profile] ensure upsert failed', error.message);
  }
  return fetchUserProfile(input.userId);
}

export type SignedInUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at?: string | null;
  is_premium?: boolean;
  premium_since?: string | null;
  premium_until?: string | null;
  /** month | year when Premium is (or was) tagged by admin */
  premium_billing?: 'month' | 'year' | null;
};

/** Admin-only: list profiles (name + email). Requires admin_list_users.sql. */
export async function listSignedInProfiles(): Promise<{
  users: SignedInUserRow[];
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { users: [], error: 'Cloud is not configured.' };
  }

  const rpc = await supabase.rpc('list_signed_in_profiles');
  if (!rpc.error && Array.isArray(rpc.data)) {
    const users: SignedInUserRow[] = (
      rpc.data as Array<SignedInUserRow & Record<string, unknown>>
    ).map((row) => {
      const premFlag = row.is_premium ?? row.user_is_premium;
      const billingRaw = String(
        row.premium_billing ?? row.user_premium_billing ?? '',
      ).toLowerCase();
      let premium_billing: 'month' | 'year' | null = null;
      if (billingRaw === 'month') premium_billing = 'month';
      else if (billingRaw === 'year') premium_billing = 'year';
      return {
        id: String(row.id),
        email: row.email || null,
        full_name: row.full_name || null,
        role: row.role || 'user',
        created_at: row.created_at || null,
        is_premium: !!premFlag,
        premium_since:
          (row.premium_since as string | null | undefined) ||
          (row.user_premium_since as string | null | undefined) ||
          null,
        premium_until:
          (row.premium_until as string | null | undefined) ||
          (row.user_premium_until as string | null | undefined) ||
          null,
        premium_billing,
      };
    });
    return { users, error: null };
  }

  const rpcMsg = rpc.error?.message || '';
  console.warn('[profile] list_signed_in_profiles RPC:', rpcMsg);

  const sqlMissing =
    rpcMsg.includes('Could not find') ||
    rpcMsg.includes('schema cache') ||
    rpcMsg.includes('does not exist');

  if (sqlMissing) {
    return {
      users: [],
      error:
        'User list is not set up on the server yet.\n\nOpen Supabase → SQL Editor → run the full file supabase/admin_list_users.sql → tap Refresh users.',
    };
  }

  if (rpcMsg.includes('not authorized') || rpcMsg.includes('not authenticated')) {
    return {
      users: [],
      error:
        "Your account can't list users yet. In Supabase SQL Editor run:\nupdate public.profiles set role = 'admin' where email = 'your@email.com';\nThen re-run admin_list_users.sql and refresh.",
    };
  }

  // Fallback select (only works after Admins can view all profiles policy exists).
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, created_at, is_premium, premium_since, premium_until, premium_billing',
    )
    .order('created_at', { ascending: false });

  if (error) {
    return {
      users: [],
      error:
        (error.message || 'Could not load users') +
        "\n\nIn Supabase SQL Editor, run supabase/admin_list_users.sql, then: update profiles set role = 'admin' where email = 'you@email.com';",
    };
  }

  const users: SignedInUserRow[] = (data || []).map((row) => {
    const billingRaw = String(row.premium_billing || '').toLowerCase();
    let premium_billing: 'month' | 'year' | null = null;
    if (billingRaw === 'month') premium_billing = 'month';
    else if (billingRaw === 'year') premium_billing = 'year';
    return {
      id: String(row.id),
      email: row.email || null,
      full_name: row.full_name || null,
      role: row.role || 'user',
      created_at: row.created_at || null,
      is_premium: !!row.is_premium,
      premium_since: row.premium_since || null,
      premium_until: row.premium_until || null,
      premium_billing,
    };
  });

  if (users.length <= 1) {
    return {
      users,
      error:
        users.length === 0
          ? null
          : 'Only your own profile is visible. Run supabase/admin_list_users.sql in Supabase SQL Editor so admins can see every signed-in user, then tap Refresh.',
    };
  }

  return { users, error: null };
}

/** Admin-only: permanently delete a signed-in user (auth + profile). */
export async function deleteSignedInUser(
  userId: string,
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Cloud is not configured.' };
  if (!userId) return { error: 'Missing user id.' };

  const { error } = await supabase.rpc('admin_delete_user', { target_id: userId });
  if (error) {
    const msg = error.message || 'Could not delete user';
    const lower = msg.toLowerCase();
    if (lower.includes('could not find') || lower.includes('schema cache')) {
      return {
        error:
          msg +
          '\n\nIn Supabase SQL Editor, re-run the full file supabase/admin_list_users.sql.',
      };
    }
    if (lower.includes('not authorized') || lower.includes('not authenticated')) {
      return {
        error:
          "Your account isn't recognized as admin yet.\n\nIn Supabase SQL Editor run the full supabase/admin_list_users.sql (it promotes both admin emails), then sign out and sign in again.",
      };
    }
    if (lower.includes('cannot delete your own')) {
      return { error: "You can't delete your own login here." };
    }
    if (lower.includes('cannot delete the last admin')) {
      return {
        error:
          "Can't delete the last admin. Promote or keep at least one other admin first.",
      };
    }
    if (lower.includes('server cannot delete auth') || lower.includes('insufficient')) {
      return {
        error:
          'Server blocked auth delete. Re-run supabase/admin_list_users.sql in SQL Editor, or delete that user under Supabase → Authentication → Users.',
      };
    }
    return { error: msg };
  }
  return { error: null };
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
