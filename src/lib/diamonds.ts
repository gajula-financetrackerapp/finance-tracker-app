import { supabase, isSupabaseConfigured } from './supabase';
import { showRewardedAd, type RewardedAdResult } from './googleAds';
import type { GoogleAdsConfig } from '../types';

/** A redeemable Premium pass: `days` of access for `cost` diamonds. */
export type DiamondPass = {
  days: number;
  cost: number;
};

export type DiamondState = {
  balance: number;
  earnedToday: number;
  dailyAdCap: number;
  perAd: number;
  enabled: boolean;
  passes: DiamondPass[];
  passUntil: string | null;
  passActive: boolean;
};

export type DiamondEarnReason = 'cap' | 'disabled' | 'signedOut' | 'adUnavailable' | 'adSkipped' | 'error';
export type DiamondRedeemReason = 'insufficient' | 'signedOut' | 'unknownPass' | 'error';

export const EMPTY_DIAMOND_STATE: DiamondState = {
  balance: 0,
  earnedToday: 0,
  dailyAdCap: 0,
  perAd: 0,
  enabled: false,
  passes: [],
  passUntil: null,
  passActive: false,
};

function num(raw: unknown, fallback = 0): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePasses(raw: unknown): DiamondPass[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const row = (p || {}) as { days?: unknown; cost?: unknown };
      return { days: Math.trunc(num(row.days)), cost: Math.trunc(num(row.cost)) };
    })
    .filter((p) => p.days > 0 && p.cost > 0)
    .sort((a, b) => a.days - b.days);
}

export function normalizeDiamondState(raw: unknown): DiamondState {
  const row = (raw || {}) as Record<string, unknown>;
  const passUntil = typeof row.passUntil === 'string' ? row.passUntil : null;
  return {
    balance: Math.max(0, Math.trunc(num(row.balance))),
    earnedToday: Math.max(0, Math.trunc(num(row.earnedToday))),
    dailyAdCap: Math.max(0, Math.trunc(num(row.dailyAdCap))),
    perAd: Math.max(0, Math.trunc(num(row.perAd))),
    enabled: row.enabled !== false,
    passes: normalizePasses(row.passes),
    passUntil,
    passActive: row.passActive === true,
  };
}

/** Diamonds still earnable today, from the server-counted total. */
export function diamondsLeftToday(state: DiamondState): number {
  return Math.max(0, state.dailyAdCap - state.earnedToday);
}

/** True while a diamond-funded Premium pass has not expired. */
export function isPassActive(passUntil: string | null | undefined): boolean {
  if (!passUntil) return false;
  const end = Date.parse(passUntil);
  return Number.isFinite(end) && end > Date.now();
}

/** Whole days left on the pass, rounded up so the last partial day still reads as 1. */
export function passDaysLeft(passUntil: string | null | undefined): number {
  if (!passUntil) return 0;
  const end = Date.parse(passUntil);
  if (!Number.isFinite(end)) return 0;
  const ms = end - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export async function fetchDiamondState(): Promise<DiamondState | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('get_diamond_state');
  if (error) {
    console.warn('[diamonds] get_diamond_state failed', error.message);
    return null;
  }
  return normalizeDiamondState(data);
}

function rpcReason(raw: unknown): string {
  const row = (raw || {}) as { reason?: unknown };
  return typeof row.reason === 'string' ? row.reason : '';
}

function rpcState(raw: unknown): DiamondState | null {
  const row = (raw || {}) as { state?: unknown };
  return row.state ? normalizeDiamondState(row.state) : null;
}

/**
 * Credit diamonds for a completed rewarded ad. The daily cap is enforced by the
 * server, so this can fail with 'cap' even when the client thought there was room.
 */
export async function grantDiamondsForAd(): Promise<{
  ok: boolean;
  reason?: DiamondEarnReason;
  awarded: number;
  state: DiamondState | null;
}> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'signedOut', awarded: 0, state: null };
  const { data, error } = await supabase.rpc('earn_diamonds_for_ad');
  if (error) {
    console.warn('[diamonds] earn_diamonds_for_ad failed', error.message);
    const reason: DiamondEarnReason = /not authenticated/i.test(error.message)
      ? 'signedOut'
      : 'error';
    return { ok: false, reason, awarded: 0, state: null };
  }
  const row = (data || {}) as { ok?: unknown; awarded?: unknown };
  if (row.ok !== true) {
    const reason = rpcReason(data);
    return {
      ok: false,
      reason: reason === 'cap' || reason === 'disabled' ? reason : 'error',
      awarded: 0,
      state: rpcState(data),
    };
  }
  return { ok: true, awarded: Math.trunc(num(row.awarded)), state: rpcState(data) };
}

const AD_FAILURE_REASON: Record<Exclude<RewardedAdResult, 'rewarded'>, DiamondEarnReason> = {
  dismissed: 'adSkipped',
  failed: 'adUnavailable',
  unavailable: 'adUnavailable',
};

/**
 * Full earn flow: play the rewarded ad, then credit only if the user actually
 * earned the reward. Dismissing early or an ad failure never grants diamonds.
 */
export async function watchAdForDiamonds(cfg: GoogleAdsConfig): Promise<{
  ok: boolean;
  reason?: DiamondEarnReason;
  awarded: number;
  state: DiamondState | null;
}> {
  const result = await showRewardedAd(cfg);
  if (result !== 'rewarded') {
    return { ok: false, reason: AD_FAILURE_REASON[result], awarded: 0, state: null };
  }
  return grantDiamondsForAd();
}

export async function redeemPremiumPass(days: number): Promise<{
  ok: boolean;
  reason?: DiamondRedeemReason;
  spent: number;
  state: DiamondState | null;
}> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'signedOut', spent: 0, state: null };
  const { data, error } = await supabase.rpc('redeem_premium_pass', { pass_days: days });
  if (error) {
    console.warn('[diamonds] redeem_premium_pass failed', error.message);
    let reason: DiamondRedeemReason = 'error';
    if (/not authenticated/i.test(error.message)) reason = 'signedOut';
    else if (/unknown pass|invalid pass/i.test(error.message)) reason = 'unknownPass';
    return { ok: false, reason, spent: 0, state: null };
  }
  const row = (data || {}) as { ok?: unknown; spent?: unknown };
  if (row.ok !== true) {
    const reason = rpcReason(data);
    return {
      ok: false,
      reason: reason === 'insufficient' ? 'insufficient' : 'error',
      spent: 0,
      state: rpcState(data),
    };
  }
  return { ok: true, spent: Math.trunc(num(row.spent)), state: rpcState(data) };
}
