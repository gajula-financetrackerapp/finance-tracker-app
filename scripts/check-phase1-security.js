const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];

function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const premium = read('src/lib/premium.ts');
const billing = read('supabase/play_billing.sql');
const playVerifier = read('supabase/functions/verify-play-subscription/index.ts');
const playSync = read('supabase/functions/sync-play-subscriptions/index.ts');
check(
  'purchase client uses the verification Edge Function',
  premium.includes("functions.invoke('verify-play-subscription'"),
);
check(
  'legacy purchase RPC is not executable by authenticated users',
  !billing.includes(
    'grant execute on function public.apply_play_subscription(text, text, text) to authenticated',
  ),
);
check(
  'verified subscription stores Google expiry',
  billing.includes('premium_until = best.expiry_time'),
);
check(
  'server acknowledges Play purchases before granting',
  playVerifier.includes(':acknowledge') &&
    playVerifier.indexOf(':acknowledge') <
      playVerifier.indexOf("admin.rpc('sync_verified_play_subscription'"),
);
check(
  'server periodically reconciles refunds and renewals',
  playSync.includes("admin.rpc('sync_verified_play_subscription'") &&
    playSync.includes('SUBSCRIPTION_STATE_EXPIRED'),
);
check(
  'inactive Play sync preserves non-Play grants',
  billing.includes('and play_entitlement_managed = true'),
);

const diamonds = read('src/lib/diamonds.ts');
const quota = read('supabase/split_expense_free_quota.sql');
const rewards = read('supabase/rewarded_ads_secure.sql');
const callback = read('supabase/functions/admob-reward-callback/index.ts');
check(
  'diamond client creates one-time SSV claims',
  diamonds.includes("'create_rewarded_ad_claim'") &&
    diamonds.includes("'get_rewarded_ad_claim'"),
);
check(
  'diamond client cannot call the legacy grant RPC',
  !diamonds.includes("'earn_diamonds_for_ad'"),
);
check(
  'legacy cap-bypass RPC is revoked',
  quota.includes(
    'revoke all on function public.earn_diamonds_for_ad(boolean) from anon, authenticated',
  ),
);
check(
  'reward callback verifies ECDSA before the private grant',
  callback.includes('crypto.subtle.verify') &&
    callback.indexOf('crypto.subtle.verify') <
      callback.indexOf("admin.rpc('apply_verified_admob_reward'"),
);
check(
  'reward claims enforce transaction idempotency',
  rewards.includes('transaction_id text unique') &&
    rewards.includes("rejection_reason = 'duplicate'"),
);
check(
  'split-save rewards are limited to a currently needed split',
  rewards.includes("claim.purpose = 'split_save'") &&
    rewards.includes("rejection_reason = 'not_needed'"),
);
check(
  'split-save rewards are reserved for split creation',
  rewards.includes('remaining_amount = per_ad') &&
    rewards.includes('create or replace function public.split_consume_create_quota()'),
);
check(
  'reward callbacks serialize awards on the profile row',
  rewards.includes('where p.id = claim_user') &&
    rewards.includes('for update;'),
);

const splitClient = read('src/lib/splitExpense.ts');
const splitSql = read('supabase/split_expense_security.sql');
check(
  'Split client uses constrained invite and settlement RPCs',
  splitClient.includes("'split_respond_invite'") &&
    splitClient.includes("'split_confirm_settlement'") &&
    splitClient.includes("'split_cancel_settlement'"),
);
check(
  'friend requester cannot accept its own invitation',
  splitSql.includes('and addressee_id = auth.uid()') &&
    splitSql.includes("and status = 'pending'"),
);
check(
  'settlement completion is derived from both parties',
  splitSql.includes('next_debtor := row.debtor_confirmed or uid = row.from_user_id') &&
    splitSql.includes('next_creditor := row.creditor_confirmed or uid = row.to_user_id'),
);
check(
  'direct financial updates are revoked',
  splitSql.includes(
    'revoke insert, update on table public.split_expense_shares from authenticated',
  ) &&
    splitSql.includes(
      'revoke update, delete on table public.split_settlements from authenticated',
    ),
);
check(
  'direct expense creation and mutation are revoked',
  splitSql.includes(
    'revoke insert, update on table public.split_expenses from authenticated',
  ),
);
check(
  'closed settlement deletion is removed',
  splitSql.includes('drop function if exists public.split_delete_closed_settlement(uuid)') &&
    splitSql.includes('drop policy if exists "split_settlements_delete_closed"'),
);

for (const item of checks) {
  console.log(`${item.ok ? 'ok ' : 'FAIL'} ${item.name}`);
}
const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} Phase 1 security check(s) failed`);
  process.exit(1);
}
console.log(`\nall ${checks.length} Phase 1 security checks passed`);
