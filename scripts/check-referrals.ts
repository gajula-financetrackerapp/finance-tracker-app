import {
  buildInviteMessage,
  EMPTY_REFERRAL_STATE,
  normalizeReferralState,
  type ReferralState,
} from '../src/lib/referralState';

let fail = 0;
function check(label: string, cond: boolean) {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

// ---------- normalizing the RPC payload ----------

const full = normalizeReferralState({
  code: 'ABC2345',
  invited_count: 3,
  diamonds_earned: 30,
  reward_per_invite: 10,
  join_reward: 5,
  has_applied_code: true,
  enabled: true,
});
check('the code is read through', full.code === 'ABC2345');
check('the invite count is read through', full.invitedCount === 3);
check('earned diamonds are read through', full.diamondsEarned === 30);
check('both reward amounts are read through', full.rewardPerInvite === 10 && full.joinReward === 5);
check('the applied flag is read through', full.hasAppliedCode === true);

// A missing or malformed payload must not produce NaN on screen.
const blank = normalizeReferralState(null);
check('a null payload is safe', blank.code === '' && blank.invitedCount === 0);
const junk = normalizeReferralState({
  code: 42,
  invited_count: 'lots',
  diamonds_earned: null,
  reward_per_invite: undefined,
});
check(
  'junk numbers fall back to zero rather than NaN',
  junk.invitedCount === 0 && junk.diamondsEarned === 0 && junk.rewardPerInvite === 0,
);
check('a non-string code is dropped', junk.code === '');

// Negatives and fractions would look broken in the UI.
const messy = normalizeReferralState({ invited_count: -4, diamonds_earned: 7.8 });
check('negative counts clamp to zero', messy.invitedCount === 0);
check('fractional diamonds are truncated', messy.diamondsEarned === 7);

// `enabled` should only be false when the server actually says so.
check('enabled defaults to true when absent', normalizeReferralState({}).enabled === true);
check(
  'enabled is false only when explicitly false',
  normalizeReferralState({ enabled: false }).enabled === false,
);
check('the empty state is disabled', EMPTY_REFERRAL_STATE.enabled === false);

// ---------- invite message ----------

const withCode: ReferralState = {
  ...EMPTY_REFERRAL_STATE,
  code: 'ABC2345',
  joinReward: 5,
};
const msg = buildInviteMessage('Finance Tracker', withCode);
check('the invite names the app', msg.includes('Finance Tracker'));
check('the invite carries the code', msg.includes('ABC2345'));
check('the invite states the joining reward', msg.includes('5 💎'));

// Before the server mints a code the message must still make sense.
const noCode = buildInviteMessage('Finance Tracker', EMPTY_REFERRAL_STATE);
check('a codeless invite still reads well', noCode.includes('Finance Tracker'));
check('a codeless invite promises no code', !noCode.toLowerCase().includes('referral code'));
check('a codeless invite mentions no reward', !noCode.includes('💎'));

// A code with no configured joining reward should not promise diamonds.
const noReward = buildInviteMessage('Finance Tracker', {
  ...EMPTY_REFERRAL_STATE,
  code: 'ABC2345',
});
check('a zero joining reward is not advertised', !noReward.includes('💎'));
check('the code still appears without a reward', noReward.includes('ABC2345'));

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`);
