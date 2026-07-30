import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import {
  GOOGLE_AD_BANNER_HEIGHT,
  initializeGoogleAds,
  isExpoGo,
  isGoogleAdsNativeAvailable,
  resolveBannerUnitId,
  shouldShowGoogleAds,
} from '../lib/googleAds';

type Props = {
  /** Compact reserved height when the ad is loading / failed. */
  reserved?: boolean;
};

/**
 * AdMob banner for Free users. Hidden for Premium when configured.
 * Requires a native build (EAS / expo run) — Expo Go shows a small dev hint.
 */
export function GoogleAdBanner({ reserved = true }: Props) {
  const { theme, config, isPremiumMember } = useApp();
  const show = shouldShowGoogleAds({
    config: config.googleAds,
    isPremiumMember,
    format: 'banner',
  });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const nativeOk = isGoogleAdsNativeAvailable();

  useEffect(() => {
    if (!show || !nativeOk) return;
    let alive = true;
    void initializeGoogleAds().then((ok) => {
      if (alive) setReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [show, nativeOk]);

  const unitId = useMemo(
    () => resolveBannerUnitId(config.googleAds),
    [config.googleAds],
  );

  if (!show) return null;

  if (!nativeOk) {
    if (__DEV__ && isExpoGo() && reserved) {
      return (
        <View style={[styles.wrap, styles.devHint, { backgroundColor: theme.track }]}>
          <Text style={[styles.devText, { color: theme.muted }]} numberOfLines={2}>
            Google Ads need a development build (not Expo Go). Test IDs are configured.
          </Text>
        </View>
      );
    }
    return null;
  }

  if (!ready || failed) {
    return reserved ? <View style={{ height: GOOGLE_AD_BANNER_HEIGHT }} /> : null;
  }

  // Lazy require so Expo Go / web bundles don’t crash on import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ads = require('react-native-google-mobile-ads') as {
    BannerAd: React.ComponentType<{
      unitId: string;
      size: string;
      requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
      onAdFailedToLoad?: (e: unknown) => void;
    }>;
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string; BANNER: string };
  };
  const size =
    ads.BannerAdSize?.ANCHORED_ADAPTIVE_BANNER || ads.BannerAdSize?.BANNER || 'BANNER';

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.card,
          borderTopColor: theme.line,
          minHeight: GOOGLE_AD_BANNER_HEIGHT,
        },
      ]}
    >
      <ads.BannerAd
        unitId={unitId}
        size={size}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdFailedToLoad={(err) => {
          console.warn('[ads] banner failed', err);
          setFailed(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  devHint: {
    minHeight: GOOGLE_AD_BANNER_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  devText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
});

/** Height to reserve above the tab bar when ads may show. */
export function useGoogleAdBannerOffset(): number {
  const { config, isPremiumMember } = useApp();
  const show = shouldShowGoogleAds({
    config: config.googleAds,
    isPremiumMember,
    format: 'banner',
  });
  if (!show) return 0;
  if (!isGoogleAdsNativeAvailable() && !(__DEV__ && isExpoGo())) return 0;
  return GOOGLE_AD_BANNER_HEIGHT;
}
