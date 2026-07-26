import { supabase, isSupabaseConfigured, type Profile } from './supabase';

export type PremiumBilling = 'month' | 'year';

export type PremiumProfile = Profile & {
  is_premium: boolean;
  premium_since: string | null;
  premium_until?: string | null;
  premium_billing?: PremiumBilling | null;
  premium_ended_at: string | null;
  cloud_purge_at: string | null;
  active_session_id: string | null;
};

const PROFILE_SELECT =
  'id, email, full_name, role, is_premium, premium_since, premium_until, premium_billing, premium_ended_at, cloud_purge_at, active_session_id';

function normalizeBilling(raw: unknown): PremiumBilling | null {
  const v = String(raw || '').toLowerCase();
  if (v === 'month' || v === 'year') return v;
  return null;
}

/** Admin Users filter bucket. */
export function userPremiumFilterBucket(profile: {
  is_premium?: boolean | null;
  premium_until?: string | null;
  premium_billing?: string | null;
}): 'free' | 'month' | 'year' {
  if (!isPremiumCurrentlyActive(profile)) return 'free';
  const billing = normalizeBilling(profile.premium_billing);
  if (billing === 'month') return 'month';
  if (billing === 'year') return 'year';
  // Legacy Premium without billing tag — treat as yearly for filters.
  return 'year';
}

/** True when Premium flag is on and not past premium_until. */
export function isPremiumCurrentlyActive(
  profile: {
    is_premium?: boolean | null;
    premium_until?: string | null;
  } | null,
): boolean {
  if (!profile?.is_premium) return false;
  if (!profile.premium_until) return true;
  const end = Date.parse(profile.premium_until);
  if (!Number.isFinite(end)) return true;
  return end > Date.now();
}

export async function fetchPremiumProfile(userId: string): Promise<PremiumProfile | null> {
  if (!isSupabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    // Older DBs may lack premium columns — fall back.
    console.warn('[premium] fetch failed', error.message);
    const { data: basic } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_premium, premium_since, premium_ended_at')
      .eq('id', userId)
      .maybeSingle();
    if (!basic) return null;
    const row = basic as PremiumProfile;
    return {
      ...(row as Profile),
      is_premium: !!row.is_premium,
      premium_since: row.premium_since ?? null,
      premium_until: null,
      premium_billing: null,
      premium_ended_at: row.premium_ended_at ?? null,
      cloud_purge_at: null,
      active_session_id: null,
    };
  }
  const row = data as PremiumProfile;
  return {
    ...row,
    is_premium: !!row.is_premium,
    premium_since: row.premium_since ?? null,
    premium_until: row.premium_until ?? null,
    premium_billing: normalizeBilling(row.premium_billing),
    premium_ended_at: row.premium_ended_at ?? null,
    cloud_purge_at: row.cloud_purge_at ?? null,
    active_session_id: row.active_session_id ?? null,
  };
}

/** Toggle Premium using server time via RPC. */
export async function setPremiumStatusRemote(enable: boolean): Promise<PremiumProfile | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('set_premium_status', { enable });
  if (error) {
    console.warn('[premium] set_premium_status failed', error.message);
    // Fallback: direct update (client clock) if RPC not deployed yet.
    const patch = enable
      ? {
          is_premium: true,
          premium_since: new Date().toISOString(),
          premium_ended_at: null,
          cloud_purge_at: null,
          updated_at: new Date().toISOString(),
        }
      : {
          is_premium: false,
          premium_ended_at: new Date().toISOString(),
          cloud_purge_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        };
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return null;
    const { data: updated, error: upErr } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', uid)
      .select(PROFILE_SELECT)
      .maybeSingle();
    if (upErr) {
      console.warn('[premium] fallback update failed', upErr.message);
      return null;
    }
    return updated as PremiumProfile;
  }
  return data as PremiumProfile;
}

/** YYYY-MM-DD cutoff from premium_since (server timestamptz). */
export function premiumSinceDate(premiumSince: string | null | undefined): string | null {
  if (!premiumSince) return null;
  const d = premiumSince.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Admin: enable/disable Premium for any user (optional since/until + billing). */
export async function adminSetUserPremium(input: {
  userId: string;
  enable: boolean;
  sinceAt?: string | null;
  untilAt?: string | null;
  billing?: PremiumBilling | null;
}): Promise<{ ok: boolean; error?: string; profile?: PremiumProfile | null }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Cloud is not configured.' };
  const { data, error } = await supabase.rpc('admin_set_user_premium', {
    target_id: input.userId,
    enable: input.enable,
    since_at: input.enable ? input.sinceAt || null : null,
    until_at: input.enable ? input.untilAt || null : null,
    billing: input.enable ? input.billing || null : null,
  });
  if (error) {
    const msg = error.message || 'Could not update Premium';
    if (msg.includes('Could not find') || msg.includes('schema cache')) {
      return {
        ok: false,
        error:
          msg +
          '\n\nRun supabase/admin_premium_users.sql in Supabase SQL Editor, then try again.',
      };
    }
    return { ok: false, error: msg };
  }
  const row = data as PremiumProfile;
  return {
    ok: true,
    profile: row
      ? {
          ...row,
          is_premium: !!row.is_premium,
          premium_since: row.premium_since ?? null,
          premium_until: row.premium_until ?? null,
          premium_billing: normalizeBilling(row.premium_billing),
          premium_ended_at: row.premium_ended_at ?? null,
          cloud_purge_at: null,
          active_session_id: null,
        }
      : null,
  };
}
