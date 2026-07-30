import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import {
  initializeGoogleAds,
  isExpoGo,
  isGoogleAdsNativeAvailable,
  resolveNativeUnitId,
  shouldShowGoogleAds,
} from '../lib/googleAds';
import type { ThemeTokens } from '../types';

type NativeAdHandle = {
  headline?: string | null;
  body?: string | null;
  callToAction?: string | null;
  advertiser?: string | null;
  icon?: { url: string } | null;
  destroy: () => void;
};

type Props = {
  /** Show a compact placeholder while loading / in Expo Go. */
  reserved?: boolean;
  onDismiss?: () => void;
};

/**
 * AdMob Native Advanced card (icon + title + body + CTA).
 * Free users only when Google Ads are enabled. Needs a native build — not Expo Go.
 */
export function GoogleNativeAdCard({ reserved = true, onDismiss }: Props) {
  const { theme, config, isPremiumMember } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const show = shouldShowGoogleAds({
    config: config.googleAds,
    isPremiumMember,
    format: 'native',
  });
  const nativeOk = isGoogleAdsNativeAvailable();
  const unitId = useMemo(
    () => resolveNativeUnitId(config.googleAds),
    [config.googleAds],
  );

  const [sdkReady, setSdkReady] = useState(false);
  const [nativeAd, setNativeAd] = useState<NativeAdHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!show || !nativeOk) return;
    let alive = true;
    void initializeGoogleAds().then((ok) => {
      if (alive) setSdkReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [show, nativeOk]);

  useEffect(() => {
    if (!show || !nativeOk || !sdkReady || dismissed) return;
    let alive = true;
    let loaded: NativeAdHandle | null = null;

    // Lazy require so Expo Go / web bundles don’t crash on import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads') as {
      NativeAd: {
        createForAdRequest: (
          id: string,
          opts?: { requestNonPersonalizedAdsOnly?: boolean; startVideoMuted?: boolean },
        ) => Promise<NativeAdHandle>;
      };
    };

    void ads.NativeAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: false,
      startVideoMuted: true,
    })
      .then((ad) => {
        if (!alive) {
          ad.destroy();
          return;
        }
        loaded = ad;
        setNativeAd(ad);
        setFailed(false);
      })
      .catch((err) => {
        console.warn('[ads] native failed', err);
        if (alive) {
          setFailed(true);
          setNativeAd(null);
        }
      });

    return () => {
      alive = false;
      loaded?.destroy();
      setNativeAd(null);
    };
  }, [show, nativeOk, sdkReady, unitId, dismissed]);

  if (!show || dismissed) return null;

  if (!nativeOk) {
    if (__DEV__ && isExpoGo() && reserved) {
      return (
        <View style={[styles.card, styles.devHint, { backgroundColor: theme.track }]}>
          <Text style={[styles.devText, { color: theme.muted }]} numberOfLines={3}>
            Google Native ads need a development build (not Expo Go). Native test unit IDs are
            configured.
          </Text>
        </View>
      );
    }
    return null;
  }

  if (failed) return null;

  if (!nativeAd) {
    return reserved ? (
      <View style={[styles.card, styles.placeholder, { borderColor: theme.line }]} />
    ) : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ads = require('react-native-google-mobile-ads') as {
    NativeAdView: React.ComponentType<{
      nativeAd: NativeAdHandle;
      style?: object;
      children?: React.ReactNode;
    }>;
    NativeAsset: React.ComponentType<{
      assetType: string;
      children?: React.ReactNode;
    }>;
    NativeAssetType: {
      HEADLINE: string;
      BODY: string;
      CALL_TO_ACTION: string;
      ICON: string;
      ADVERTISER: string;
    };
  };

  const cta = (nativeAd.callToAction || 'Open').trim() || 'Open';
  const headline = (nativeAd.headline || nativeAd.advertiser || 'Sponsored').trim();
  const body = (nativeAd.body || '').trim();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <ads.NativeAdView nativeAd={nativeAd} style={styles.adView}>
        <View style={styles.topRow}>
          <Text style={[styles.adBadge, { color: theme.muted, backgroundColor: theme.track }]}>
            AD
          </Text>
          <View style={styles.topActions}>
            {onDismiss ? (
              <Pressable
                onPress={() => {
                  setDismissed(true);
                  nativeAd.destroy();
                  setNativeAd(null);
                  onDismiss();
                }}
                hitSlop={8}
                accessibilityLabel="Dismiss ad"
              >
                <Text style={[styles.dismiss, { color: theme.muted }]}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.contentRow}>
          {nativeAd.icon?.url ? (
            <ads.NativeAsset assetType={ads.NativeAssetType.ICON}>
              <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
            </ads.NativeAsset>
          ) : (
            <View style={[styles.icon, styles.iconFallback, { backgroundColor: theme.track }]}>
              <Text style={{ fontSize: 22 }}>📣</Text>
            </View>
          )}
          <View style={styles.textCol}>
            <ads.NativeAsset assetType={ads.NativeAssetType.HEADLINE}>
              <Text style={[styles.headline, { color: theme.ink }]} numberOfLines={1}>
                {headline}
              </Text>
            </ads.NativeAsset>
            {body ? (
              <ads.NativeAsset assetType={ads.NativeAssetType.BODY}>
                <Text style={[styles.body, { color: theme.muted }]} numberOfLines={2}>
                  {body}
                </Text>
              </ads.NativeAsset>
            ) : nativeAd.advertiser ? (
              <ads.NativeAsset assetType={ads.NativeAssetType.ADVERTISER}>
                <Text style={[styles.body, { color: theme.muted }]} numberOfLines={1}>
                  {nativeAd.advertiser}
                </Text>
              </ads.NativeAsset>
            ) : null}
          </View>
        </View>

        <ads.NativeAsset assetType={ads.NativeAssetType.CALL_TO_ACTION}>
          <Text style={[styles.cta, { backgroundColor: theme.header }]}>{cta}</Text>
        </ads.NativeAsset>
      </ads.NativeAdView>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      overflow: 'hidden',
    },
    placeholder: {
      minHeight: 148,
      backgroundColor: theme.card,
    },
    adView: {
      padding: 14,
      gap: 12,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    adBadge: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dismiss: { fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    icon: {
      width: 52,
      height: 52,
      borderRadius: 12,
    },
    iconFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    textCol: { flex: 1, gap: 2 },
    headline: { fontWeight: '800', fontSize: 16 },
    body: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
    cta: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 15,
      textAlign: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      overflow: 'hidden',
    },
    devHint: {
      minHeight: 88,
      paddingHorizontal: 14,
      paddingVertical: 16,
      justifyContent: 'center',
    },
    devText: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 17,
    },
  });
}
