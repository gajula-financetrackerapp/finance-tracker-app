import { supabase, isSupabaseConfigured, type Profile } from './supabase';

export type PremiumProfile = Profile & {
  is_premium: boolean;
  premium_since: string | null;
  premium_ended_at: string | null;
  cloud_purge_at: string | null;
  active_session_id: string | null;
};

const PROFILE_SELECT =
  'id, email, full_name, role, is_premium, premium_since, premium_ended_at, cloud_purge_at, active_session_id';

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
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();
    if (!basic) return null;
    return {
      ...(basic as Profile),
      is_premium: false,
      premium_since: null,
      premium_ended_at: null,
      cloud_purge_at: null,
      active_session_id: null,
    };
  }
  const row = data as PremiumProfile;
  return {
    ...row,
    is_premium: !!row.is_premium,
    premium_since: row.premium_since ?? null,
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
