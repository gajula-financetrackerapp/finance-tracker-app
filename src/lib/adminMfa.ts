import { supabase } from './supabase';

export type AdminMfaState = {
  aal: 'aal1' | 'aal2' | null;
  factorId: string | null;
  verified: boolean;
  recent: boolean;
};

export async function getAdminMfaState(): Promise<AdminMfaState> {
  const [{ data: assurance }, { data: factors }, { data: sessionData }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
    supabase.auth.getSession(),
  ]);
  const verified = factors?.totp?.find((factor) => factor.status === 'verified') || null;
  const currentLevel =
    assurance?.currentLevel === 'aal2'
      ? 'aal2'
      : assurance?.currentLevel === 'aal1'
        ? 'aal1'
        : null;
  let recent = false;
  try {
    const payload = sessionData.session?.access_token.split('.')[1] || '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    ) as { amr?: Array<{ method?: string; timestamp?: number }> };
    recent = (decoded.amr || []).some(
      (entry) =>
        (entry.method === 'totp' || entry.method === 'mfa') &&
        Number(entry.timestamp || 0) >= Math.floor(Date.now() / 1000) - 15 * 60,
    );
  } catch {
    recent = false;
  }
  return {
    aal: currentLevel,
    factorId: verified?.id || null,
    verified: !!verified,
    recent,
  };
}

export async function enrollAdminTotp(): Promise<{
  factorId: string;
  secret: string;
  uri: string;
}> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'MoneyLit administrator',
  });
  if (error) throw error;
  return {
    factorId: data.id,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyAdminTotp(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\D/g, ''),
  });
  if (error) throw error;
}

export async function requireRecentAdminMfa(): Promise<void> {
  const state = await getAdminMfaState();
  if (state.aal !== 'aal2' || !state.recent) {
    throw new Error('Verify the administrator authenticator code before this action.');
  }
}
