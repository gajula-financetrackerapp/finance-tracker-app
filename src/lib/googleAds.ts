import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { GoogleAdsConfig, GoogleBannerPlacement } from '../types';

/** Google’s official sample App IDs (safe for debug / until real IDs are set). */
export const ADMOB_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
export const ADMOB_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

/** Google’s official sample unit IDs (Android / iOS). */
export const ADMOB_TEST_UNITS = {
  banner: {
    android: 'ca-app-pub-3940256099942544/6300978111',
    ios: 'ca-app-pub-3940256099942544/2934735716',
  },
  interstitial: {
    android: 'ca-app-pub-3940256099942544/1033173712',
    ios: 'ca-app-pub-3940256099942544/4411468910',
  },
  rewardedInterstitial: {
    android: 'ca-app-pub-3940256099942544/5354046379',
    ios: 'ca-app-pub-3940256099942544/6978759866',
  },
  rewarded: {
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3940256099942544/1712485313',
  },
  native: {
    android: 'ca-app-pub-3940256099942544/2247696110',
    ios: 'ca-app-pub-3940256099942544/3986624511',
  },
  appOpen: {
    android: 'ca-app-pub-3940256099942544/9257395921',
    ios: 'ca-app-pub-3940256099942544/5575463023',
  },
} as const;

/**
 * Extra Google demo banner units so Reminders / Buy list / Split each request
 * a different test creative (fixed, adaptive, collapsible-as-banner).
 */
export const ADMOB_TEST_BANNER_BY_PLACEMENT = {
  home: ADMOB_TEST_UNITS.banner,
  tabs: ADMOB_TEST_UNITS.banner,
  reminders: ADMOB_TEST_UNITS.banner,
  shopping: {
    android: 'ca-app-pub-3940256099942544/9214589741',
    ios: 'ca-app-pub-3940256099942544/2435281174',
  },
  split: {
    android: 'ca-app-pub-3940256099942544/2014213617',
    ios: 'ca-app-pub-3940256099942544/8388050270',
  },
} as const;

export const ADMOB_TEST_BANNER_ANDROID = ADMOB_TEST_UNITS.banner.android;
export const ADMOB_TEST_BANNER_IOS = ADMOB_TEST_UNITS.banner.ios;
export const ADMOB_TEST_REWARDED_ANDROID = ADMOB_TEST_UNITS.rewarded.android;
export const ADMOB_TEST_REWARDED_IOS = ADMOB_TEST_UNITS.rewarded.ios;

export const GOOGLE_AD_BANNER_HEIGHT = 56;

export type RewardedAdResult = 'rewarded' | 'dismissed' | 'failed' | 'unavailable';

export type AdMobUnitKind = keyof typeof ADMOB_TEST_UNITS;

export function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo'
  );
}

/** Native AdMob is not available in Expo Go — needs a dev/production build. */
export function isGoogleAdsNativeAvailable(): boolean {
  if (isExpoGo()) return false;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-google-mobile-ads');
    return true;
  } catch {
    return false;
  }
}

function configuredBannerUnitId(cfg: GoogleAdsConfig, placement: GoogleBannerPlacement): string {
  const ios = Platform.OS === 'ios';
  const pick = (specific: string, fallback: string) =>
    String(specific || '').trim() || String(fallback || '').trim();
  const main = ios ? cfg.iosBannerUnitId : cfg.androidBannerUnitId;
  switch (placement) {
    case 'reminders':
      return pick(ios ? cfg.iosBannerRemindersUnitId : cfg.androidBannerRemindersUnitId, main);
    case 'shopping':
      return pick(ios ? cfg.iosBannerShoppingUnitId : cfg.androidBannerShoppingUnitId, main);
    case 'split':
      return pick(ios ? cfg.iosBannerSplitUnitId : cfg.androidBannerSplitUnitId, main);
    default:
      return String(main || '').trim();
  }
}

function configuredUnitId(cfg: GoogleAdsConfig, kind: AdMobUnitKind): string {
  const ios = Platform.OS === 'ios';
  switch (kind) {
    case 'banner':
      return ios ? cfg.iosBannerUnitId : cfg.androidBannerUnitId;
    case 'interstitial':
      return ios ? cfg.iosInterstitialUnitId : cfg.androidInterstitialUnitId;
    case 'rewardedInterstitial':
      return ios ? cfg.iosRewardedInterstitialUnitId : cfg.androidRewardedInterstitialUnitId;
    case 'rewarded':
      return ios ? cfg.iosRewardedUnitId : cfg.androidRewardedUnitId;
    case 'native':
      return ios ? cfg.iosNativeUnitId : cfg.androidNativeUnitId;
    case 'appOpen':
      return ios ? cfg.iosAppOpenUnitId : cfg.androidAppOpenUnitId;
  }
}

export function resolveAdUnitId(cfg: GoogleAdsConfig, kind: AdMobUnitKind): string {
  const configured = configuredUnitId(cfg, kind);
  const useTest = cfg.useTestIds || !String(configured || '').trim();
  if (useTest) {
    return Platform.OS === 'ios' ? ADMOB_TEST_UNITS[kind].ios : ADMOB_TEST_UNITS[kind].android;
  }
  return String(configured).trim();
}

export function resolveBannerUnitId(
  cfg: GoogleAdsConfig,
  placement: GoogleBannerPlacement = 'tabs',
): string {
  const configured = configuredBannerUnitId(cfg, placement);
  const useTest = cfg.useTestIds || !configured;
  if (useTest) {
    const demo = ADMOB_TEST_BANNER_BY_PLACEMENT[placement] || ADMOB_TEST_UNITS.banner;
    return Platform.OS === 'ios' ? demo.ios : demo.android;
  }
  return configured;
}

export function resolveNativeUnitId(cfg: GoogleAdsConfig): string {
  return resolveAdUnitId(cfg, 'native');
}

export function resolveRewardedUnitId(cfg: GoogleAdsConfig): string {
  return resolveAdUnitId(cfg, 'rewarded');
}

export function shouldShowGoogleAds(opts: {
  config: GoogleAdsConfig;
  /**
   * Paid Premium (or admin). Pass holders who unlocked Premium with diamonds
   * are NOT ad-free — they keep seeing the ads that fund their next pass.
   */
  isAdFreeMember: boolean;
  isAdmin?: boolean;
  /** Which AdMob format to gate (banner, native, rewarded, …). */
  format?: AdMobUnitKind;
}): boolean {
  if (!opts.config.enabled) return false;
  const format = opts.format ?? 'banner';
  const flags = opts.config.formats?.[format];
  if (flags) {
    if (!flags.enabled) return false;
    if (flags.hideForPremium && (opts.isAdFreeMember || opts.isAdmin)) return false;
    return true;
  }
  // Legacy configs without per-format flags
  if (opts.config.hideForPremium && (opts.isAdFreeMember || opts.isAdmin)) return false;
  return true;
}

let initPromise: Promise<boolean> | null = null;

/** Initialize once at app launch. Safe no-op in Expo Go / web. */
export function initializeGoogleAds(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isGoogleAdsNativeAvailable()) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mobileAdsMod = require('react-native-google-mobile-ads') as {
        default: () => { initialize: () => Promise<unknown> };
      };
      await mobileAdsMod.default().initialize();
      return true;
    } catch (e) {
      console.warn('[ads] initialize failed', e);
      return false;
    }
  })();
  return initPromise;
}

/**
 * Load + show a rewarded video. Resolves when the user earns the reward,
 * dismisses without reward, or the ad fails / is unavailable (Expo Go).
 */
export async function showRewardedAd(cfg: GoogleAdsConfig): Promise<RewardedAdResult> {
  if (!isGoogleAdsNativeAvailable()) return 'unavailable';
  const ok = await initializeGoogleAds();
  if (!ok) return 'unavailable';

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads') as {
      RewardedAd: {
        createForAdRequest: (
          unitId: string,
          opts?: { requestNonPersonalizedAdsOnly?: boolean },
        ) => {
          addAdEventListener: (event: string, cb: (payload?: unknown) => void) => () => void;
          load: () => void;
          show: () => Promise<void>;
        };
      };
      RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
      AdEventType: { CLOSED: string; ERROR: string };
    };

    const unitId = resolveRewardedUnitId(cfg);
    const rewarded = ads.RewardedAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: false,
    });

    return await new Promise<RewardedAdResult>((resolve) => {
      let earned = false;
      let settled = false;
      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        unsubLoaded();
        unsubEarned();
        unsubClosed();
        unsubError();
        resolve(result);
      };

      const unsubLoaded = rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
        void rewarded.show().catch(() => finish('failed'));
      });
      const unsubEarned = rewarded.addAdEventListener(
        ads.RewardedAdEventType.EARNED_REWARD,
        () => {
          earned = true;
        },
      );
      const unsubClosed = rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
        finish(earned ? 'rewarded' : 'dismissed');
      });
      const unsubError = rewarded.addAdEventListener(ads.AdEventType.ERROR, () => {
        finish('failed');
      });

      rewarded.load();
      // Safety timeout if load never completes
      setTimeout(() => finish('failed'), 45000);
    });
  } catch (e) {
    console.warn('[ads] rewarded failed', e);
    return 'failed';
  }
}
