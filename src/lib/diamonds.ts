import { supabase, isSupabaseConfigured } from './supabase';
import { showRewardedAd, type RewardedAdResult } from './googleAds';
import type { GoogleAdsConfig } from '../types';

/**
 * A redeemable Premium pass: `days` of access for `cost` diamonds. `listCost`
 * is the struck-through "was" price and is display-only; 0 hides it.
 */
export type DiamondPass = {
  days: number;
  cost: number;
  listCost: number;
};

/** What a diamond buys. Avatars and themes are sold one at a time. */
export type DiamondStoreKind = 'avatar' | 'theme' | 'feature';

/**
 * A priced entry in the diamond store. `cost` is charged; `listCost` is the
 * struck-through "was" price shown beside it, and 0 hides that. `days` is the
 * length of a feature unlock and is unused for per-item entries.
 */
export type DiamondStoreItem = {
  key: string;
  enabled: boolean;
  perItem: boolean;
  cost: number;
  listCost: number;
  days: number;
};

export type DiamondStore = Record<string, DiamondStoreItem>;

export type DiamondUnlock = {
  kind: DiamondStoreKind;
  itemId: string;
  /** Null for avatars and themes, which are kept for good. */
  expiresAt: string | null;
};

export type DiamondState = {
  balance: number;
  earnedToday: number;
  dailyAdCap: number;
  perAd: number;
  enabled: boolean;
  passes: DiamondPass[];
  store: DiamondStore;
  unlocks: DiamondUnlock[];
  passUntil: string | null;
  passActive: boolean;
};

export type DiamondEarnReason = 'cap' | 'disabled' | 'signedOut' | 'adUnavailable' | 'adSkipped' | 'error';
export type DiamondRedeemReason = 'insufficient' | 'signedOut' | 'unknownPass' | 'error';
export type DiamondPurchaseReason =
  | 'insufficient'
  | 'owned'
  | 'unavailable'
  | 'disabled'
  | 'signedOut'
  | 'error';

/** Store key holding the price for a purchase kind. */
export const AVATAR_STORE_KEY = 'avatars';
export const THEME_STORE_KEY = 'themes';

export const EMPTY_DIAMOND_STATE: DiamondState = {
  balance: 0,
  earnedToday: 0,
  dailyAdCap: 0,
  perAd: 0,
  enabled: false,
  passes: [],
  store: {},
  unlocks: [],
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
      const row = (p || {}) as { days?: unknown; cost?: unknown; listCost?: unknown };
      return {
        days: Math.trunc(num(row.days)),
        cost: Math.trunc(num(row.cost)),
        listCost: Math.max(0, Math.trunc(num(row.listCost))),
      };
    })
    .filter((p) => p.days > 0 && p.cost > 0)
    .sort((a, b) => a.days - b.days);
}

export function normalizeStoreItem(key: string, raw: unknown): DiamondStoreItem {
  const row = (raw || {}) as Record<string, unknown>;
  const perItem = row.perItem === true;
  return {
    key,
    enabled: row.enabled === true,
    perItem,
    cost: Math.max(0, Math.trunc(num(row.cost))),
    listCost: Math.max(0, Math.trunc(num(row.listCost))),
    days: perItem ? 0 : Math.max(0, Math.trunc(num(row.days))),
  };
}

function normalizeStore(raw: unknown): DiamondStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: DiamondStore = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = normalizeStoreItem(key, value);
  }
  return out;
}

const UNLOCK_KINDS: DiamondStoreKind[] = ['avatar', 'theme', 'feature'];

function normalizeUnlocks(raw: unknown): DiamondUnlock[] {
  if (!Array.isArray(raw)) return [];
  const out: DiamondUnlock[] = [];
  for (const entry of raw) {
    const row = (entry || {}) as Record<string, unknown>;
    const kind = row.kind as DiamondStoreKind;
    const itemId = typeof row.itemId === 'string' ? row.itemId : '';
    if (!UNLOCK_KINDS.includes(kind) || !itemId) continue;
    out.push({
      kind,
      itemId,
      expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : null,
    });
  }
  return out;
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
    store: normalizeStore(row.store),
    unlocks: normalizeUnlocks(row.unlocks),
    passUntil,
    passActive: row.passActive === true,
  };
}

/** Priced store entry, or null when admins have not enabled that unlock. */
export function storeItemFor(
  state: DiamondState,
  key: string,
): DiamondStoreItem | null {
  const entry = state.store[key];
  return entry && entry.enabled ? entry : null;
}

export function avatarStoreItem(state: DiamondState): DiamondStoreItem | null {
  const entry = storeItemFor(state, AVATAR_STORE_KEY);
  return entry?.perItem ? entry : null;
}

export function themeStoreItem(state: DiamondState): DiamondStoreItem | null {
  const entry = storeItemFor(state, THEME_STORE_KEY);
  return entry?.perItem ? entry : null;
}

function unlockFor(
  state: DiamondState,
  kind: DiamondStoreKind,
  itemId: string,
): DiamondUnlock | null {
  return (
    state.unlocks.find((u) => u.kind === kind && u.itemId === itemId) || null
  );
}

/**
 * True when the user owns this unlock. The server already drops expired rows,
 * but the expiry is re-checked here so a long-open screen cannot keep granting
 * access after the pass runs out.
 */
export function ownsDiamondUnlock(
  state: DiamondState,
  kind: DiamondStoreKind,
  itemId: string,
): boolean {
  const row = unlockFor(state, kind, itemId);
  if (!row) return false;
  return row.expiresAt === null || isPassActive(row.expiresAt);
}

/** Expiry of a timed feature unlock, or null when absent or permanent. */
export function diamondUnlockExpiry(
  state: DiamondState,
  kind: DiamondStoreKind,
  itemId: string,
): string | null {
  const row = unlockFor(state, kind, itemId);
  return row?.expiresAt ?? null;
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

/**
 * Whole economy object, for the admin editor. The store prices live here rather
 * than in local config so every device charges the same, server-checked price.
 */
export async function fetchDiamondEconomy(): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('diamond_economy');
  if (error) {
    console.warn('[diamonds] diamond_economy failed', error.message);
    return null;
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

export async function saveDiamondEconomy(
  econ: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Cloud is not configured.' };
  const { error } = await supabase.rpc('set_diamond_economy', { econ });
  if (error) {
    console.warn('[diamonds] set_diamond_economy failed', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
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

const PURCHASE_REASONS: DiamondPurchaseReason[] = [
  'insufficient',
  'owned',
  'unavailable',
  'disabled',
];

/**
 * Spend diamonds on one avatar / theme, or on timed access to a feature. The
 * price is read from the server economy, never sent from here.
 */
export async function purchaseDiamondItem(
  kind: DiamondStoreKind,
  itemId: string,
): Promise<{
  ok: boolean;
  reason?: DiamondPurchaseReason;
  spent: number;
  state: DiamondState | null;
}> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'signedOut', spent: 0, state: null };
  const { data, error } = await supabase.rpc('purchase_diamond_item', {
    p_kind: kind,
    p_item_id: itemId,
  });
  if (error) {
    console.warn('[diamonds] purchase_diamond_item failed', error.message);
    const reason: DiamondPurchaseReason = /not authenticated/i.test(error.message)
      ? 'signedOut'
      : 'error';
    return { ok: false, reason, spent: 0, state: null };
  }
  const row = (data || {}) as { ok?: unknown; spent?: unknown };
  if (row.ok !== true) {
    const reason = rpcReason(data) as DiamondPurchaseReason;
    return {
      ok: false,
      reason: PURCHASE_REASONS.includes(reason) ? reason : 'error',
      spent: 0,
      state: rpcState(data),
    };
  }
  return { ok: true, spent: Math.trunc(num(row.spent)), state: rpcState(data) };
}
