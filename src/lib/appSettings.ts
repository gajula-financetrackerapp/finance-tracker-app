import { supabase, isSupabaseConfigured } from './supabase';
import type { PremiumFeaturesConfig, PremiumPlanConfig } from '../types';
import { mergePremiumPlan } from '../storage';
import { mergePremiumFeatures } from './premiumFeatures';

const SETTINGS_ID = 'global';

export type RemoteAppSettings = {
  premiumPlan: PremiumPlanConfig;
  premiumFeatures: PremiumFeaturesConfig;
};

export async function fetchRemoteAppSettings(): Promise<RemoteAppSettings | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase.rpc('get_app_settings');
    if (!error && data && typeof data === 'object') {
      const row = data as { premium_plan?: unknown; premium_features?: unknown };
      return {
        premiumPlan: mergePremiumPlan(row.premium_plan as Partial<PremiumPlanConfig>),
        premiumFeatures: mergePremiumFeatures(
          row.premium_features as Partial<PremiumFeaturesConfig>,
        ),
      };
    }
    if (error) console.warn('[appSettings] get_app_settings failed', error.message);
  } catch (e) {
    console.warn('[appSettings] get_app_settings error', e);
  }

  // Legacy: plan-only RPC / table
  const plan = await fetchRemotePremiumPlanLegacy();
  if (!plan) return null;
  return { premiumPlan: plan, premiumFeatures: mergePremiumFeatures(null) };
}

async function fetchRemotePremiumPlanLegacy(): Promise<PremiumPlanConfig | null> {
  try {
    const { data, error } = await supabase.rpc('get_app_premium_plan');
    if (!error && data) return mergePremiumPlan(data as Partial<PremiumPlanConfig>);
  } catch {
    /* ignore */
  }
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('premium_plan, premium_features')
      .eq('id', SETTINGS_ID)
      .maybeSingle();
    if (error || !data) return null;
    return mergePremiumPlan(data.premium_plan as Partial<PremiumPlanConfig>);
  } catch {
    return null;
  }
}

/** @deprecated use fetchRemoteAppSettings */
export async function fetchRemotePremiumPlan(): Promise<PremiumPlanConfig | null> {
  const all = await fetchRemoteAppSettings();
  return all?.premiumPlan ?? null;
}

export async function pushRemoteAppSettings(input: {
  premiumPlan?: PremiumPlanConfig;
  premiumFeatures?: PremiumFeaturesConfig;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Cloud is not configured.' };
  }
  const plan = input.premiumPlan ? mergePremiumPlan(input.premiumPlan) : null;
  const features = input.premiumFeatures
    ? mergePremiumFeatures(input.premiumFeatures)
    : null;

  try {
    const { error } = await supabase.rpc('set_app_settings', {
      plan,
      features,
    });
    if (!error) return { ok: true };
    console.warn('[appSettings] set_app_settings failed', error.message);
    if (
      !error.message.includes('Could not find') &&
      !error.message.includes('schema cache') &&
      !error.message.includes('function')
    ) {
      return { ok: false, error: error.message };
    }
  } catch (e) {
    console.warn('[appSettings] set_app_settings error', e);
  }

  // Legacy plan-only push
  if (plan) {
    const legacy = await pushRemotePremiumPlanLegacy(plan);
    if (!legacy.ok) return legacy;
  }
  if (features) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('app_settings').upsert(
      {
        id: SETTINGS_ID,
        premium_features: features,
        updated_at: new Date().toISOString(),
        updated_by: auth.user?.id ?? null,
      },
      { onConflict: 'id' },
    );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** @deprecated use pushRemoteAppSettings */
export async function pushRemotePremiumPlan(
  plan: PremiumPlanConfig,
): Promise<{ ok: boolean; error?: string }> {
  return pushRemoteAppSettings({ premiumPlan: plan });
}

async function pushRemotePremiumPlanLegacy(
  plan: PremiumPlanConfig,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = mergePremiumPlan(plan);
  try {
    const { error } = await supabase.rpc('set_app_premium_plan', { plan: normalized });
    if (!error) return { ok: true };
  } catch {
    /* fall through */
  }
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('app_settings').upsert(
    {
      id: SETTINGS_ID,
      premium_plan: normalized,
      updated_at: new Date().toISOString(),
      updated_by: auth.user?.id ?? null,
    },
    { onConflict: 'id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
