import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const KEY_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VerifierKey = { keyId: number; base64: string };
let keyCache: { keys: Map<string, CryptoKey>; expiresAt: number } | null = null;

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function derEcdsaToRaw(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30) throw new Error('Invalid DER sequence');
  let offset = 1;
  const sequenceLength = signature[offset] & 0x80
    ? signature[offset + 1]
    : signature[offset];
  offset += signature[offset] & 0x80 ? 2 : 1;
  if (sequenceLength <= 0 || signature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature');
  }
  const rLength = signature[offset++];
  const r = signature.slice(offset, offset + rLength);
  offset += rLength;
  if (signature[offset++] !== 0x02) throw new Error('Invalid DER signature');
  const sLength = signature[offset++];
  const s = signature.slice(offset, offset + sLength);

  const raw = new Uint8Array(64);
  const rValue = r[0] === 0 ? r.slice(1) : r;
  const sValue = s[0] === 0 ? s.slice(1) : s;
  if (rValue.length > 32 || sValue.length > 32) throw new Error('Invalid ECDSA size');
  raw.set(rValue, 32 - rValue.length);
  raw.set(sValue, 64 - sValue.length);
  return raw;
}

async function verifierKeys(): Promise<Map<string, CryptoKey>> {
  if (keyCache && keyCache.expiresAt > Date.now()) return keyCache.keys;
  const keyResponse = await fetch(KEY_URL);
  if (!keyResponse.ok) throw new Error(`Could not fetch AdMob keys (${keyResponse.status})`);
  const payload = (await keyResponse.json()) as { keys?: VerifierKey[] };
  const keys = new Map<string, CryptoKey>();
  for (const entry of payload.keys || []) {
    const key = await crypto.subtle.importKey(
      'spki',
      base64UrlBytes(entry.base64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    keys.set(String(entry.keyId), key);
  }
  if (!keys.size) throw new Error('AdMob returned no verifier keys');
  keyCache = { keys, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return keys;
}

function allowedAdUnits(): Set<string> {
  const raw = Deno.env.get('ADMOB_REWARDED_AD_UNIT_IDS') || '';
  const result = new Set<string>();
  for (const value of raw.split(',')) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    result.add(trimmed);
    const suffix = trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed;
    result.add(suffix);
  }
  return result;
}

async function verifyCallback(request: Request): Promise<URLSearchParams> {
  const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?') + 1) : '';
  const signatureMarker = '&signature=';
  const signatureAt = query.lastIndexOf(signatureMarker);
  if (signatureAt < 0) throw new Error('Missing callback signature');
  const signedContent = query.slice(0, signatureAt);
  const params = new URLSearchParams(query);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  if (!signature || !keyId) throw new Error('Missing signature fields');

  const keys = await verifierKeys();
  const key = keys.get(keyId);
  if (!key) throw new Error('Unknown AdMob verifier key');
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    derEcdsaToRaw(base64UrlBytes(signature)),
    new TextEncoder().encode(signedContent),
  );
  if (!valid) throw new Error('Invalid callback signature');
  return params;
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') return response('Method not allowed', 405);

  const units = allowedAdUnits();
  if (!units.size) return response('Reward callback is not configured', 503);

  try {
    const params = await verifyCallback(request);
    const claimId = params.get('custom_data') || '';
    const userId = params.get('user_id') || '';
    const transactionId = params.get('transaction_id') || '';
    const adUnit = params.get('ad_unit') || '';
    // AdMob's setup verification is signed but intentionally omits the optional
    // user ID and custom data, and can use a verification-only ad-unit value.
    // Accept it as a no-op; only callbacks with a real app claim reach awards.
    if (!claimId && !userId) return response('OK');
    if (!units.has(adUnit)) return response('Unexpected ad unit', 403);

    const timestamp = Number(params.get('timestamp'));
    const timestampMs =
      timestamp > 100_000_000_000_000
        ? timestamp / 1000
        : timestamp < 10_000_000_000
          ? timestamp * 1000
          : timestamp;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 24 * 60 * 60 * 1000) {
      return response('Expired reward callback', 400);
    }
    if (!UUID_RE.test(claimId) || !UUID_RE.test(userId) || transactionId.length < 8) {
      return response('Invalid reward callback', 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return response('Missing server configuration', 503);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile } = await admin
      .from('profiles')
      .select('disabled_at')
      .eq('id', userId)
      .maybeSingle();
    if (!profile || profile.disabled_at) return response('Account disabled', 403);
    const { data, error } = await admin.rpc('apply_verified_admob_reward', {
      p_claim_id: claimId,
      p_user_id: userId,
      p_transaction_id: transactionId,
    });
    if (error) {
      console.error('[admob-reward-callback]', error.message);
      return response('Temporary reward failure', 500);
    }
    console.log('[admob-reward-callback]', JSON.stringify(data));
    return response('OK');
  } catch (error) {
    console.error('[admob-reward-callback]', error);
    return response('Invalid reward callback', 400);
  }
});
