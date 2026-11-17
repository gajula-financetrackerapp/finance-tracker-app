const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const parser = read('src/lib/importRules/parseImportText.ts');
const fingerprints = read('src/lib/importFingerprint.ts');
const oauth = read('src/lib/oauthSignIn.ts');
const appContext = read('src/context/AppContext.tsx');
const phase3 = read('supabase/security_phase3.sql');
const adminMfa = read('supabase/security_admin_mfa.sql');
const playVerify = read('supabase/functions/verify-play-subscription/index.ts');
const rewardCallback = read('supabase/functions/admob-reward-callback/index.ts');
const backup = read('src/lib/dataEncryption.ts');

check(
  'SMS import keys use a versioned SHA-256 digest',
  parser.includes('importFingerprint(') &&
    fingerprints.includes("IMPORT_FINGERPRINT_PREFIX = 'fp2:'") &&
    fingerprints.includes('sha256(normalized)'),
);
check(
  'production OAuth logs do not include callback URLs or key prefixes',
  !oauth.includes("console.log('[oauth] got callback', url") &&
    !oauth.includes("console.log('[oauth] callback', opened.url") &&
    !oauth.includes('keyPrefix:'),
);
check(
  'PostgREST blocks disabled authenticated accounts',
  phase3.includes("pgrst.db_pre_request = 'public.enforce_active_account_request'") &&
    phase3.includes('not public.account_is_active_for(auth.uid())') &&
    phase3.includes('to authenticator, anon, authenticated, service_role'),
);
check(
  'receipt storage policies require an active account',
  (phase3.match(/public\.account_is_active\(\)/g) || []).length >= 5,
);
check(
  'final migration revokes direct billing, reward, and split writes',
  [
    'play_subscription_grants',
    'rewarded_ad_claims',
    'split_expenses',
    'split_expense_shares',
    'split_settlements',
  ].every((table) =>
    phase3.includes(
      `revoke insert, update, delete on table public.${table}`,
    ),
  ),
);
check(
  'direct invitee lookup is revoked and invitations are rate limited',
  phase3.includes(
    'revoke all on function public.split_lookup_invitee(text) from public, anon, authenticated',
  ) &&
    phase3.includes("'split_invite_minute'") &&
    phase3.includes("'split_invite_day'"),
);
check(
  'callers cannot create arbitrary rate-limit buckets',
  phase3.includes(
    'revoke all on function public.consume_my_security_rate_limit(text, integer, integer)',
  ) &&
    !phase3.includes(
      'grant execute on function public.consume_my_security_rate_limit(text, integer, integer)',
    ),
);
check(
  'reward claims are bounded and disabled rewards are blocked',
  phase3.includes('Too many pending reward requests') &&
    phase3.includes('guard_disabled_profile_reward'),
);
check(
  'purchase verification checks disabled state and rate limit',
  playVerify.includes("select('disabled_at')") &&
    playVerify.includes("'consume_security_rate_limit_for_user'"),
);
check(
  'reward callback rejects disabled profiles',
  rewardCallback.includes("select('disabled_at')") &&
    rewardCallback.includes("return response('Account disabled', 403)"),
);
check(
  'sensitive administrator paths require recent AAL2',
  adminMfa.includes("= 'aal2'") &&
    adminMfa.includes("'totp'") &&
    adminMfa.includes("'/rpc/admin_delete_user'") &&
    adminMfa.includes("'/rpc/set_app_shared_config'") &&
    adminMfa.includes("'/rpc/set_app_google_ads'") &&
    adminMfa.includes("'/rpc/set_app_import_rules'") &&
    adminMfa.includes("'/rpc/set_diamond_economy'") &&
    appContext.includes('await requireRecentAdminMfa()'),
);
check(
  'local and backup encryption are authenticated and versioned',
  backup.includes('xchacha20poly1305') &&
    backup.includes("const DEVICE_PREFIX = 'mlenc1:'") &&
    backup.includes("format: typeof BACKUP_FORMAT"),
);

let failed = 0;
for (const result of checks) {
  console.log(`${result.ok ? 'ok ' : 'BAD'}  ${result.name}`);
  if (!result.ok) failed += 1;
}
if (failed) {
  console.error(`\n${failed} Phase 3 security check(s) failed`);
  process.exit(1);
}
console.log(`\nall ${checks.length} Phase 3 security checks passed`);
