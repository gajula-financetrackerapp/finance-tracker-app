import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PACKAGE_NAME = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') || 'com.gajula.moneylit';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
type Grant = {
  purchase_token: string;
  product_id: string;
  user_id: string;
  expiry_time: string | null;
};
type PlaySubscription = {
  subscriptionState?: string;
  latestOrderId?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemBytes(pem: string): Uint8Array {
  const raw = pem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '');
  return Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
}

async function googleAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned =
    `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.` +
    base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const tokenResponse = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  const payload = await tokenResponse.json();
  if (!tokenResponse.ok || typeof payload.access_token !== 'string') {
    throw new Error(`Google authentication failed (${tokenResponse.status})`);
  }
  return payload.access_token;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceAccountRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!supabaseUrl || !serviceRoleKey || !serviceAccountRaw) {
    return json({ error: 'Missing server configuration' }, 503);
  }
  const jwt = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let callerRole = '';
  try {
    const payload = jwt.split('.')[1] || '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    callerRole = String(JSON.parse(decoded)?.role || '');
  } catch {
    callerRole = '';
  }
  // JWT validation is performed by the Supabase Edge gateway. Only its
  // service-role JWT may invoke this scheduled administrative function.
  if (callerRole !== 'service_role') {
    return json({ error: 'Not authorized' }, 401);
  }

  try {
    const account = JSON.parse(serviceAccountRaw) as ServiceAccount;
    if (!account.client_email || !account.private_key) throw new Error('Invalid service account');
    const accessToken = await googleAccessToken(account);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin
      .from('play_subscription_grants')
      .select('purchase_token, product_id, user_id, expiry_time')
      .order('last_seen_at', { ascending: true })
      .limit(1000);
    if (error) return json({ error: error.message }, 500);

    let synced = 0;
    let inactive = 0;
    let failed = 0;
    for (const grant of (data || []) as Grant[]) {
      try {
        const endpoint =
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
          `${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/` +
          encodeURIComponent(grant.purchase_token);
        const playResponse = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        let state = 'SUBSCRIPTION_STATE_EXPIRED';
        let expiryTime = grant.expiry_time || new Date().toISOString();
        let latestOrderId: string | null = null;
        let accountId: string | null = null;
        let autoRenewing = false;

        if (playResponse.ok) {
          const purchase = (await playResponse.json()) as PlaySubscription;
          const item = (purchase.lineItems || []).find(
            (line) => String(line.productId || '').toLowerCase() === grant.product_id,
          );
          if (!item?.expiryTime) throw new Error('Verified product line item is missing');
          state = String(purchase.subscriptionState || '');
          expiryTime = item.expiryTime;
          latestOrderId = item.latestSuccessfulOrderId || purchase.latestOrderId || null;
          accountId =
            purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || null;
          autoRenewing = item.autoRenewingPlan?.autoRenewEnabled ?? false;
        } else if (playResponse.status !== 404 && playResponse.status !== 410) {
          throw new Error(`Google verification failed (${playResponse.status})`);
        }

        const { error: syncError } = await admin.rpc('sync_verified_play_subscription', {
          p_user_id: grant.user_id,
          p_purchase_token: grant.purchase_token,
          p_product_id: grant.product_id,
          p_latest_order_id: latestOrderId,
          p_expiry_time: expiryTime,
          p_subscription_state: state,
          p_obfuscated_account_id: accountId,
          p_auto_renewing: autoRenewing,
        });
        if (syncError) throw new Error(syncError.message);
        if (
          state === 'SUBSCRIPTION_STATE_ACTIVE' ||
          state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ||
          (state === 'SUBSCRIPTION_STATE_CANCELED' &&
            Date.parse(expiryTime) > Date.now())
        ) {
          synced += 1;
        } else {
          inactive += 1;
        }
      } catch (error) {
        failed += 1;
        console.error('[sync-play-subscriptions]', grant.user_id, error);
      }
    }
    return json({ checked: (data || []).length, synced, inactive, failed });
  } catch (error) {
    console.error('[sync-play-subscriptions]', error);
    return json({ error: 'Subscription synchronization failed' }, 500);
  }
});
