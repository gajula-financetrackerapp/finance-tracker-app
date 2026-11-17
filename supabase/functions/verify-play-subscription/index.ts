import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const PACKAGE_NAME = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') || 'com.gajula.moneylit';
const ALLOWED_PRODUCTS = new Set([
  'moneylit_plus_monthly',
  'moneylit_plus_yearly',
  'moneylit_premium_monthly',
  'moneylit_premium_yearly',
]);
const ENTITLED_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type PlayLineItem = {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: { autoRenewEnabled?: boolean };
};

type PlaySubscription = {
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
  };
  lineItems?: PlayLineItem[];
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

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

function pemToBytes(pem: string): Uint8Array {
  const raw = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(raw);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function serviceAccountAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(`Google authentication failed (${response.status})`);
  }
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000,
  };
  return payload.access_token;
}

async function authenticatedUserId(
  request: Request,
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  const authorization = request.headers.get('Authorization') || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  return error ? null : data.user?.id || null;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceAccountRaw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!supabaseUrl || !serviceRoleKey || !serviceAccountRaw) {
    return json({ error: 'Purchase verification is not configured' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await authenticatedUserId(request, admin);
  if (!userId) return json({ error: 'Not authenticated' }, 401);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('disabled_at')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile || profile.disabled_at) {
    return json({ error: profile?.disabled_at ? 'Account disabled' : 'Profile unavailable' }, 403);
  }
  const { data: withinLimit, error: limitError } = await admin.rpc(
    'consume_security_rate_limit_for_user',
    {
      p_user_id: userId,
      p_action: 'verify_play_subscription',
      p_limit: 10,
      p_window_seconds: 3600,
    },
  );
  if (limitError) {
    console.error('[verify-play-subscription] rate limit unavailable', limitError.message);
    return json({ error: 'Purchase verification temporarily unavailable' }, 503);
  }
  if (!withinLimit) return json({ error: 'Too many verification attempts' }, 429);

  let body: { purchaseToken?: unknown; productId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const purchaseToken = String(body.purchaseToken || '').trim();
  const productId = String(body.productId || '').trim().toLowerCase();
  if (purchaseToken.length < 20 || !ALLOWED_PRODUCTS.has(productId)) {
    return json({ error: 'Invalid Play purchase' }, 400);
  }

  let account: ServiceAccount;
  try {
    account = JSON.parse(serviceAccountRaw) as ServiceAccount;
    if (!account.client_email || !account.private_key) throw new Error('missing fields');
  } catch {
    return json({ error: 'Google Play service account is invalid' }, 503);
  }

  try {
    const accessToken = await serviceAccountAccessToken(account);
    const endpoint =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/` +
      encodeURIComponent(purchaseToken);
    const playResponse = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    const playPayload = (await playResponse.json()) as PlaySubscription & {
      error?: { message?: string };
    };
    if (!playResponse.ok) {
      console.error('[verify-play-subscription] Google rejected token', playResponse.status);
      return json({ error: 'Google Play could not verify this purchase' }, 400);
    }

    const lineItem = (playPayload.lineItems || []).find(
      (item) => String(item.productId || '').toLowerCase() === productId,
    );
    if (!lineItem?.expiryTime) {
      return json({ error: 'Purchase does not contain the selected product' }, 400);
    }

    const expiryMs = Date.parse(lineItem.expiryTime);
    const state = String(playPayload.subscriptionState || '');
    const entitled = ENTITLED_STATES.has(state) && Number.isFinite(expiryMs) && expiryMs > Date.now();
    const accountId =
      playPayload.externalAccountIdentifiers?.obfuscatedExternalAccountId?.trim() || null;
    const expectedAccountId = userId.replace(/-/g, '').slice(0, 64);
    if (accountId && accountId !== expectedAccountId) {
      return json({ error: 'This purchase belongs to a different MoneyLit account' }, 403);
    }
    if (!accountId) {
      const { data: existingGrant, error: grantLookupError } = await admin
        .from('play_subscription_grants')
        .select('user_id')
        .eq('purchase_token', purchaseToken)
        .maybeSingle();
      if (grantLookupError) {
        console.error('[verify-play-subscription] grant lookup failed', grantLookupError.message);
        return json({ error: 'Could not verify purchase ownership' }, 503);
      }
      if (!existingGrant || existingGrant.user_id !== userId) {
        return json(
          { error: 'This purchase is missing its MoneyLit account binding' },
          403,
        );
      }
    }

    if (
      entitled &&
      playPayload.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
    ) {
      const acknowledgeEndpoint =
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
        `${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/` +
        `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
      const acknowledgeResponse = await fetch(acknowledgeEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!acknowledgeResponse.ok) {
        console.error(
          '[verify-play-subscription] acknowledgement failed',
          acknowledgeResponse.status,
        );
        return json({ error: 'Google Play could not acknowledge this purchase' }, 503);
      }
    }

    const { data, error } = await admin.rpc('sync_verified_play_subscription', {
      p_user_id: userId,
      p_purchase_token: purchaseToken,
      p_product_id: productId,
      p_latest_order_id:
        lineItem.latestSuccessfulOrderId || playPayload.latestOrderId || null,
      p_expiry_time: lineItem.expiryTime,
      p_subscription_state: state,
      p_obfuscated_account_id: accountId,
      p_auto_renewing: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    });
    if (error) {
      console.error('[verify-play-subscription] grant sync failed', error.message);
      return json({ error: 'Could not update subscription access' }, 500);
    }
    if (!entitled) {
      return json({ error: 'Subscription is not currently active', profile: data }, 402);
    }
    return json({ ok: true, profile: data });
  } catch (error) {
    console.error('[verify-play-subscription]', error);
    return json({ error: 'Purchase verification temporarily failed' }, 503);
  }
});
