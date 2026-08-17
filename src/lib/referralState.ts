/**
 * Referral shapes and pure helpers. Kept apart from `referrals.ts` so this half
 * carries no Supabase (and therefore no React Native) import and stays testable
 * under plain Node.
 */

export type ReferralState = {
  /** This user's own code, shared with friends. Empty until the server mints it. */
  code: string;
  /** Friends who signed up and applied this code. */
  invitedCount: number;
  /** Diamonds credited so far for those sign-ups. */
  diamondsEarned: number;
  /** Reward the sharer gets per accepted invite. */
  rewardPerInvite: number;
  /** Reward the new user gets for entering a code. */
  joinReward: number;
  /** Whether this user has already redeemed someone else's code. */
  hasAppliedCode: boolean;
  enabled: boolean;
};

export const EMPTY_REFERRAL_STATE: ReferralState = {
  code: '',
  invitedCount: 0,
  diamondsEarned: 0,
  rewardPerInvite: 0,
  joinReward: 0,
  hasAppliedCode: false,
  enabled: false,
};

const count = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

export function normalizeReferralState(raw: unknown): ReferralState {
  const row = (raw || {}) as Record<string, unknown>;
  return {
    code: typeof row.code === 'string' ? row.code : '',
    invitedCount: count(row.invited_count),
    diamondsEarned: count(row.diamonds_earned),
    rewardPerInvite: count(row.reward_per_invite),
    joinReward: count(row.join_reward),
    hasAppliedCode: row.has_applied_code === true,
    enabled: row.enabled !== false,
  };
}

/** Invite text for the share sheet. Falls back gracefully before a code exists. */
export function buildInviteMessage(appName: string, state: ReferralState): string {
  const lines = [`Try ${appName} — track spending, bills and reminders in one place.`];
  if (state.code) {
    lines.push('', `Use my code ${state.code} when you sign up.`);
    if (state.joinReward > 0) {
      lines.push(`You start with ${state.joinReward} 💎 to unlock avatars and themes.`);
    }
  }
  return lines.join('\n');
}
