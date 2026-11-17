/* eslint-disable no-console */
const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SECURITY_TEST_USER_A_EMAIL',
  'SECURITY_TEST_USER_A_PASSWORD',
  'SECURITY_TEST_USER_B_EMAIL',
  'SECURITY_TEST_USER_B_PASSWORD',
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing live-test environment: ${missing.join(', ')}`);
  console.error('Use disposable accounts only. Never use real MoneyLit user credentials.');
  process.exit(2);
}

const url = process.env.SUPABASE_URL.replace(/\/+$/, '');
const anon = process.env.SUPABASE_ANON_KEY;
const headers = (token) => ({
  apikey: anon,
  Authorization: `Bearer ${token || anon}`,
  'Content-Type': 'application/json',
});

async function waitForEnter(message) {
  const readline = require('node:readline/promises');
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await prompt.question(`${message}\nPress Enter to continue...`);
  } finally {
    prompt.close();
  }
}

async function signIn(email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token || !body.user?.id) {
    throw new Error(`Could not sign in disposable account (${response.status})`);
  }
  return { token: body.access_token, id: body.user.id };
}

async function get(path, token) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: headers(token) });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep text response for diagnostics.
  }
  return { response, body };
}

async function patch(path, token, body) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...headers(token), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep text response for diagnostics.
  }
  return { response, body: parsed };
}

async function post(path, token, body, prefer = 'return=representation') {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: prefer },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep text response for diagnostics.
  }
  return { response, body: parsed };
}

function assert(name, condition, detail) {
  console.log(`${condition ? 'ok ' : 'BAD'}  ${name}`);
  if (!condition) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

async function main() {
  const [a, b] = await Promise.all([
    signIn(process.env.SECURITY_TEST_USER_A_EMAIL, process.env.SECURITY_TEST_USER_A_PASSWORD),
    signIn(process.env.SECURITY_TEST_USER_B_EMAIL, process.env.SECURITY_TEST_USER_B_PASSWORD),
  ]);

  const fixtureBudget = 10101;
  const [fixtureA, fixtureB] = await Promise.all([
    post(
      'user_finance?on_conflict=user_id',
      a.token,
      { user_id: a.id, budget: fixtureBudget },
      'resolution=merge-duplicates,return=representation',
    ),
    post(
      'user_finance?on_conflict=user_id',
      b.token,
      { user_id: b.id, budget: fixtureBudget },
      'resolution=merge-duplicates,return=representation',
    ),
  ]);
  assert('User A can create its disposable finance fixture', fixtureA.response.ok, fixtureA);
  assert('User B can create its disposable finance fixture', fixtureB.response.ok, fixtureB);

  const anonFinance = await get(`user_finance?select=user_id&user_id=eq.${a.id}`, null);
  assert(
    'anonymous cannot read finance',
    anonFinance.response.status === 401 ||
      (Array.isArray(anonFinance.body) && anonFinance.body.length === 0),
    anonFinance,
  );

  const crossFinance = await get(`user_finance?select=user_id&user_id=eq.${b.id}`, a.token);
  assert(
    'User A cannot read User B finance',
    crossFinance.response.ok && Array.isArray(crossFinance.body) && crossFinance.body.length === 0,
    crossFinance,
  );

  const crossWrite = await patch(`user_finance?user_id=eq.${b.id}`, a.token, {
    budget: 20202,
  });
  assert(
    'User A cannot change User B finance',
    crossWrite.response.status === 401 ||
      crossWrite.response.status === 403 ||
      (Array.isArray(crossWrite.body) && crossWrite.body.length === 0),
    crossWrite,
  );
  const unchangedFinance = await get(
    `user_finance?select=budget&user_id=eq.${b.id}`,
    b.token,
  );
  assert(
    'User B finance remains unchanged after User A mutation attempt',
    unchangedFinance.response.ok &&
      Array.isArray(unchangedFinance.body) &&
      Number(unchangedFinance.body[0]?.budget) === fixtureBudget,
    unchangedFinance,
  );

  const crossReminders = await get(`user_reminders?select=user_id&user_id=eq.${b.id}`, a.token);
  assert(
    'User A cannot read User B reminders',
    crossReminders.response.ok &&
      Array.isArray(crossReminders.body) &&
      crossReminders.body.length === 0,
    crossReminders,
  );

  const crossCategories = await get(`user_categories?select=user_id&user_id=eq.${b.id}`, a.token);
  assert(
    'User A cannot read User B categories',
    crossCategories.response.ok &&
      Array.isArray(crossCategories.body) &&
      crossCategories.body.length === 0,
    crossCategories,
  );

  const grants = await get('play_subscription_grants?select=user_id&limit=1', a.token);
  assert(
    'ordinary users cannot read subscription grants',
    grants.response.status === 401 ||
      grants.response.status === 403 ||
      (Array.isArray(grants.body) && grants.body.length === 0),
    grants,
  );

  const lookup = await fetch(`${url}/rest/v1/rpc/split_lookup_invitee`, {
    method: 'POST',
    headers: headers(a.token),
    body: JSON.stringify({ p_email: process.env.SECURITY_TEST_USER_B_EMAIL }),
  });
  assert('direct invitee lookup is revoked', lookup.status === 401 || lookup.status === 403, {
    status: lookup.status,
  });

  const storage = await fetch(`${url}/storage/v1/object/list/bill-images`, {
    method: 'POST',
    headers: headers(a.token),
    body: JSON.stringify({ prefix: `${b.id}/`, limit: 10 }),
  });
  const storageBody = await storage.json().catch(() => null);
  assert(
    'User A cannot list User B receipts',
    !storage.ok || (Array.isArray(storageBody) && storageBody.length === 0),
    { status: storage.status, body: storageBody },
  );

  const forgedReward = await fetch(`${url}/functions/v1/admob-reward-callback`);
  assert('unsigned rewarded callback is rejected', forgedReward.status === 400, {
    status: forgedReward.status,
  });

  const directReward = await fetch(`${url}/rest/v1/rpc/apply_verified_admob_reward`, {
    method: 'POST',
    headers: headers(a.token),
    body: JSON.stringify({
      p_claim_id: '00000000-0000-4000-8000-000000000001',
      p_user_id: a.id,
      p_transaction_id: 'forged-security-test',
    }),
  });
  assert(
    'ordinary user cannot invoke private reward grant',
    directReward.status === 401 || directReward.status === 403 || directReward.status === 404,
    { status: directReward.status },
  );

  let inviteLimited = false;
  for (let index = 0; index < 6; index += 1) {
    const response = await fetch(`${url}/rest/v1/rpc/split_invite_friend`, {
      method: 'POST',
      headers: headers(a.token),
      body: JSON.stringify({ p_email: `missing-${Date.now()}-${index}@example.invalid` }),
    });
    if (response.status >= 400 && index === 5) inviteLimited = true;
  }
  assert('sixth rapid invitation is rate limited', inviteLimited, null);

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole && process.env.SECURITY_TEST_ALLOW_DISABLE === 'true') {
    const adminHeaders = {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    try {
      const disable = await fetch(`${url}/rest/v1/profiles?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ disabled_at: new Date().toISOString() }),
      });
      assert('disposable User A can be disabled for stale-JWT test', disable.ok, {
        status: disable.status,
        body: await disable.text(),
      });
      const stale = await get('user_finance?select=user_id&limit=1', a.token);
      assert(
        'already-issued token is blocked after disable',
        stale.response.status === 401 || stale.response.status === 403,
        stale,
      );
    } finally {
      await fetch(`${url}/rest/v1/profiles?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ disabled_at: null }),
      });
    }
  } else if (process.env.SECURITY_TEST_MANUAL_DISABLE === 'true') {
    console.log(`\nDisposable User A id: ${a.id}`);
    await waitForEnter(
      'In Supabase Table Editor → profiles, set this user disabled_at to the current date/time.',
    );
    try {
      const stale = await get('user_finance?select=user_id&limit=1', a.token);
      assert(
        'already-issued token is blocked from REST after disable',
        stale.response.status === 401 ||
          stale.response.status === 403 ||
          (stale.response.ok && Array.isArray(stale.body) && stale.body.length === 0),
        stale,
      );
      const disabledWrite = await patch(`user_finance?user_id=eq.${a.id}`, a.token, {
        budget: 30303,
      });
      assert(
        'disabled token cannot change its finance data',
        disabledWrite.response.status === 401 ||
          disabledWrite.response.status === 403 ||
          (disabledWrite.response.ok &&
            Array.isArray(disabledWrite.body) &&
            disabledWrite.body.length === 0),
        disabledWrite,
      );

      const disabledRpc = await fetch(`${url}/rest/v1/rpc/split_invite_friend`, {
        method: 'POST',
        headers: headers(a.token),
        body: JSON.stringify({ p_email: process.env.SECURITY_TEST_USER_B_EMAIL }),
      });
      assert('disabled token is blocked from RPC and split paths', disabledRpc.status === 403, {
        status: disabledRpc.status,
      });

      const disabledReward = await fetch(`${url}/rest/v1/rpc/create_rewarded_ad_claim`, {
        method: 'POST',
        headers: headers(a.token),
        body: JSON.stringify({ p_purpose: 'standard' }),
      });
      assert('disabled token is blocked from reward claims', disabledReward.status === 403, {
        status: disabledReward.status,
      });

      const disabledPurchase = await fetch(
        `${url}/functions/v1/verify-play-subscription`,
        {
          method: 'POST',
          headers: headers(a.token),
          body: JSON.stringify({
            purchaseToken: 'disabled-security-test-token',
            productId: 'moneylit_premium_monthly',
          }),
        },
      );
      assert('disabled token is blocked from purchase verification', disabledPurchase.status === 403, {
        status: disabledPurchase.status,
      });

      const disabledStorage = await fetch(
        `${url}/storage/v1/object/bill-images/${a.id}/disabled-security-test.jpg`,
        {
          method: 'POST',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${a.token}`,
            'Content-Type': 'image/jpeg',
          },
          body: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        },
      );
      const disabledStorageBody = await disabledStorage.text();
      assert(
        'disabled token is blocked from receipt uploads',
        disabledStorage.status === 403 ||
          (disabledStorage.status === 400 &&
            /"statusCode":"403"|row-level security policy|AccessDenied/i.test(
              disabledStorageBody,
            )),
        {
          status: disabledStorage.status,
          body: disabledStorageBody,
        },
      );
    } finally {
      await waitForEnter(
        'IMPORTANT: Clear disabled_at for disposable User A in profiles now.',
      );
    }
    const restoredFinance = await get(
      `user_finance?select=budget&user_id=eq.${a.id}`,
      a.token,
    );
    assert(
      'disabled write attempt did not change User A finance',
      restoredFinance.response.ok &&
        Array.isArray(restoredFinance.body) &&
        Number(restoredFinance.body[0]?.budget) === fixtureBudget,
      restoredFinance,
    );
  } else {
    console.log('skip disabled stale-JWT test (service role opt-in not provided)');
  }

  console.log('\nall live cross-account checks passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
