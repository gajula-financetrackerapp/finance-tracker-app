import { supabase, isSupabaseConfigured } from './supabase';
import type {
  AdBannerConfig,
  FeatureFlags,
  FeedbackConfig,
  GoogleAdsConfig,
  ImportRulesConfig,
  PremiumFeaturesConfig,
  PremiumPlanConfig,
  ThemeCatalogConfig,
  ThemeKey,
} from '../types';
import { THEMES } from '../constants';
import { mergeAdBanner, mergeFeedback, mergeGoogleAds, mergePremiumPlan } from '../storage';
import { mergeThemeCatalog } from '../utils/themeAccess';
import { mergeImportRules } from './importRules';
import { mergePremiumFeatures } from './premiumFeatures';

const SETTINGS_ID = 'global';

/**
 * The Admin settings that are neither pricing nor ads nor import rules.
 *
 * Every key is optional on purpose: a key that is absent means no admin has
 * ever saved it, and the client keeps its own. That is not the same as an
 * empty object, which for feature flags would read as "every feature off".
 */
export type SharedAdminConfig = {
  appName?: string;
  features?: FeatureFlags;
  themeCatalog?: ThemeCatalogConfig;
  defaultTheme?: ThemeKey;
  feedback?: FeedbackConfig;
  adBanner?: AdBannerConfig;
};

export type RemoteAppSettings = {
  premiumPlan: PremiumPlanConfig;
  premiumFeatures: PremiumFeaturesConfig;
  /**
   * Null when no admin has ever saved ad settings. Callers must leave their own
   * config alone in that case — treating it as an empty config would reset a
   * working setup back to test ads.
   */
  googleAds: GoogleAdsConfig | null;
  /**
   * Null when no admin has ever saved rules. Callers must leave their own
   * config alone in that case — an empty config here would read as "no rules",
   * and a phone with no rules imports nothing at all.
   */
  importRules: ImportRulesConfig | null;
  /** Null when no admin has ever saved any of these. Individual keys may still be absent. */
  sharedConfig: SharedAdminConfig | null;
};

function readGoogleAds(raw: unknown): GoogleAdsConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return mergeGoogleAds(raw as Partial<GoogleAdsConfig>);
}

/**
 * The stored payload holds the admin's rules alone, so merging is what puts
 * this build's built-ins back underneath them.
 */
function readImportRules(raw: unknown): ImportRulesConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return mergeImportRules(raw as Partial<ImportRulesConfig>);
}

function isObject(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw);
}

/**
 * Each key is merged over this build's defaults, so a blob saved by an older
 * app still gains whatever fields the current one added.
 */
function readSharedConfig(raw: unknown): SharedAdminConfig | null {
  if (!isObject(raw)) return null;
  const out: SharedAdminConfig = {};
  if (typeof raw.appName === 'string' && raw.appName.trim()) out.appName = raw.appName.trim();
  if (isObject(raw.features)) out.features = raw.features as unknown as FeatureFlags;
  if (isObject(raw.themeCatalog)) {
    out.themeCatalog = mergeThemeCatalog(raw.themeCatalog as Partial<ThemeCatalogConfig>);
  }
  // A colour this build does not have is dropped rather than carried: an older
  // phone would otherwise be handed a name it cannot draw.
  if (typeof raw.defaultTheme === 'string' && raw.defaultTheme in THEMES) {
    out.defaultTheme = raw.defaultTheme as ThemeKey;
  }
  if (isObject(raw.feedback)) {
    out.feedback = mergeFeedback(raw.feedback as Partial<FeedbackConfig>);
  }
  if (isObject(raw.adBanner)) {
    out.adBanner = mergeAdBanner(raw.adBanner as Partial<AdBannerConfig>);
  }
  return Object.keys(out).length ? out : null;
}

export async function fetchRemoteAppSettings(): Promise<RemoteAppSettings | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase.rpc('get_app_settings');
    if (!error && data && typeof data === 'object') {
      const row = data as {
        premium_plan?: unknown;
        premium_features?: unknown;
        google_ads?: unknown;
        import_rules?: unknown;
        shared_config?: unknown;
      };
      return {
        premiumPlan: mergePremiumPlan(row.premium_plan as Partial<PremiumPlanConfig>),
        premiumFeatures: mergePremiumFeatures(
          row.premium_features as Partial<PremiumFeaturesConfig>,
        ),
        googleAds: readGoogleAds(row.google_ads),
        importRules: readImportRules(row.import_rules),
        sharedConfig: readSharedConfig(row.shared_config),
      };
    }
    if (error) console.warn('[appSettings] get_app_settings failed', error.message);
  } catch (e) {
    console.warn('[appSettings] get_app_settings error', e);
  }

  // Legacy: plan-only RPC / table
  const plan = await fetchRemotePremiumPlanLegacy();
  if (!plan) return null;
  return {
    premiumPlan: plan,
    premiumFeatures: mergePremiumFeatures(null),
    googleAds: null,
    importRules: null,
    sharedConfig: null,
  };
}

/**
 * Send only the blobs the admin actually touched. The RPC merges them over
 * what is stored, so saving the theme catalog cannot wipe the feature switches.
 */
export async function pushRemoteSharedConfig(
  patch: SharedAdminConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Cloud is not configured.' };
  }
  if (!Object.keys(patch).length) return { ok: true };
  try {
    const { error } = await supabase.rpc('set_app_shared_config', { patch });
    if (!error) return { ok: true };
    console.warn('[appSettings] set_app_shared_config failed', error.message);
    return { ok: false, error: error.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.warn('[appSettings] set_app_shared_config error', e);
    return { ok: false, error: message };
  }
}

/**
 * Ads have their own RPC rather than riding along with plan and features —
 * see the note in supabase/google_ads.sql about overloaded signatures.
 */
export async function pushRemoteGoogleAds(
  ads: GoogleAdsConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Cloud is not configured.' };
  }
  try {
    const { error } = await supabase.rpc('set_app_google_ads', {
      ads: mergeGoogleAds(ads),
    });
    if (!error) return { ok: true };
    console.warn('[appSettings] set_app_google_ads failed', error.message);
    return { ok: false, error: error.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.warn('[appSettings] set_app_google_ads error', e);
    return { ok: false, error: message };
  }
}

/**
 * Send the admin's rules as they are. Callers pass importRulesForCloud output,
 * which has already dropped the built-ins this build merged in — normalising
 * again here would only put them back.
 */
export async function pushRemoteImportRules(
  rules: ImportRulesConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Cloud is not configured.' };
  }
  try {
    const { error } = await supabase.rpc('set_app_import_rules', { rules });
    if (!error) return { ok: true };
    console.warn('[appSettings] set_app_import_rules failed', error.message);
    return { ok: false, error: error.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.warn('[appSettings] set_app_import_rules error', e);
    return { ok: false, error: message };
  }
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
