import { isSupabaseConfigured, supabase } from './supabase';
import { normalizeReferralState, type ReferralState } from './referralState';

export {
  EMPTY_REFERRAL_STATE,
  buildInviteMessage,
  normalizeReferralState,
  type ReferralState,
} from './referralState';

export async function fetchReferralState(): Promise<ReferralState | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('get_referral_state');
  if (error) {
    console.warn('[referrals] get_referral_state failed', error.message);
    return null;
  }
  return normalizeReferralState(data);
}

export type ApplyReferralResult = {
  ok: boolean;
  /** Diamonds credited to this user, when the code was accepted. */
  granted: number;
  error?: string;
};

const REJECTIONS: Record<string, string> = {
  disabled: 'Referrals are switched off right now.',
  unknown_code: 'That code does not match anyone.',
  self: 'You can’t use your own code.',
  already: 'You have already used a referral code.',
  not_signed_in: 'Sign in first to use a code.',
};

/** Redeem someone else's code. The server rejects self-referral and repeats. */
export async function applyReferralCode(code: string): Promise<ApplyReferralResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, granted: 0, error: 'Enter a referral code.' };
  if (!isSupabaseConfigured) {
    return { ok: false, granted: 0, error: 'Cloud is not configured.' };
  }
  const { data, error } = await supabase.rpc('apply_referral_code', { p_code: trimmed });
  if (error) {
    console.warn('[referrals] apply_referral_code failed', error.message);
    return { ok: false, granted: 0, error: error.message };
  }
  const row = (data || {}) as Record<string, unknown>;
  if (row.ok === true) {
    const granted = Number(row.granted);
    return { ok: true, granted: Number.isFinite(granted) ? Math.max(0, granted) : 0 };
  }
  const reason = typeof row.reason === 'string' ? row.reason : '';
  return { ok: false, granted: 0, error: REJECTIONS[reason] || 'Could not apply that code.' };
}
