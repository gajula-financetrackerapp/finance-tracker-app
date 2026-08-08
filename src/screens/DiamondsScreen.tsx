import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { DiamondPrice } from '../components/DiamondPrice';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  AVATAR_STORE_KEY,
  THEME_STORE_KEY,
  diamondsLeftToday,
  passDaysLeft,
  storeItemFor,
  type DiamondEarnReason,
  type DiamondStoreItem,
} from '../lib/diamonds';
import {
  PREMIUM_FEATURE_KEYS,
  PREMIUM_FEATURE_LABELS,
  canAccessPremiumFeature,
  featureFlagForPremiumKey,
} from '../lib/premiumFeatures';
import type { PremiumFeatureKey } from '../types';
import { isGoogleAdsNativeAvailable, shouldShowGoogleAds } from '../lib/googleAds';
import type { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';

export function DiamondsScreen() {
  const {
    theme,
    config,
    diamonds,
    refreshDiamonds,
    earnDiamondsByAd,
    redeemDiamondPass,
    buyDiamondItem,
    ownsWithDiamonds,
    isAdFreeMember,
    isPremiumMember,
    premiumPassUntil,
  } = useApp();
  const { isGuest, isAdmin, setAuthMode, setShowAuth } = useFinance();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useT();
  const [busy, setBusy] = useState<'earn' | number | string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshDiamonds();
    }, [refreshDiamonds]),
  );

  const leftToday = diamondsLeftToday(diamonds);
  const daysLeft = passDaysLeft(premiumPassUntil);
  const rewardedAllowed = useMemo(
    () =>
      shouldShowGoogleAds({
        config: config.googleAds,
        isAdFreeMember,
        isAdmin,
        format: 'rewarded',
      }),
    [config.googleAds, isAdFreeMember, isAdmin],
  );
  const nativeAdsOk = isGoogleAdsNativeAvailable();
  // Never offer the video when it cannot pay out — a capped user would burn an
  // impression for nothing.
  const canEarn = rewardedAllowed && nativeAdsOk && leftToday > 0;

  const promptSignIn = () => {
    showAppDialog({
      title: t('diamonds.title'),
      message: t('diamonds.signInFirst'),
      icon: '💎',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.signIn'),
          style: 'primary',
          onPress: () => {
            setAuthMode('login');
            setShowAuth(true);
          },
        },
      ],
    });
  };

  const earnFailureMessage = (reason?: DiamondEarnReason): string => {
    switch (reason) {
      case 'cap':
        return t('diamonds.errCap');
      case 'adSkipped':
        return t('diamonds.errSkipped');
      case 'adUnavailable':
        return t('diamonds.errNoAd');
      case 'disabled':
        return t('diamonds.errDisabled');
      case 'signedOut':
        return t('diamonds.signInFirst');
      default:
        return t('diamonds.errGeneric');
    }
  };

  const onWatchAd = async () => {
    if (isGuest) {
      promptSignIn();
      return;
    }
    setBusy('earn');
    try {
      const result = await earnDiamondsByAd();
      if (result.ok) {
        showAppInfo(
          t('diamonds.earnedTitle'),
          t('diamonds.earnedBody').replace('{n}', String(result.awarded)),
          '💎',
        );
        return;
      }
      showAppInfo(t('diamonds.title'), earnFailureMessage(result.reason), '💎');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Avatars and themes are chosen in their own pickers, so those rows send the
   * user there. Feature unlocks have nothing to choose and are bought here.
   * Anything Premium already covers is left out — there is nothing to buy.
   */
  const storeRows = useMemo(() => {
    const rows: {
      key: string;
      label: string;
      kind: 'avatar' | 'theme' | 'feature';
      item: DiamondStoreItem;
      route?: 'AvatarSettings' | 'Themes';
    }[] = [];
    const alreadyIncluded = (key: PremiumFeatureKey) =>
      canAccessPremiumFeature(key, isPremiumMember, config.premiumFeatures, config.features);
    const push = (
      storeKey: string,
      featureKey: PremiumFeatureKey,
      label: string,
      kind: 'avatar' | 'theme' | 'feature',
      route?: 'AvatarSettings' | 'Themes',
    ) => {
      if (alreadyIncluded(featureKey)) return;
      const item = storeItemFor(diamonds, storeKey);
      if (item && item.cost > 0) rows.push({ key: storeKey, label, kind, item, route });
    };
    push(AVATAR_STORE_KEY, 'avatars', t('diamonds.storeAvatars'), 'avatar', 'AvatarSettings');
    push(THEME_STORE_KEY, 'themes', t('diamonds.storeThemes'), 'theme', 'Themes');
    for (const key of PREMIUM_FEATURE_KEYS) {
      const item = storeItemFor(diamonds, key);
      if (!item || item.perItem || item.cost <= 0 || item.days <= 0) continue;
      if (config.features[featureFlagForPremiumKey(key)] === false) continue;
      // A diamond unlock still lists, so the user can top it up before it ends.
      if (alreadyIncluded(key) && !ownsWithDiamonds('feature', key)) continue;
      rows.push({ key, label: PREMIUM_FEATURE_LABELS[key], kind: 'feature', item });
    }
    return rows;
  }, [
    diamonds,
    config.features,
    config.premiumFeatures,
    isPremiumMember,
    ownsWithDiamonds,
    t,
  ]);

  const onStorePress = (row: (typeof storeRows)[number]) => {
    if (row.route) {
      navigation.navigate(row.route);
      return;
    }
    if (isGuest) {
      promptSignIn();
      return;
    }
    showAppDialog({
      title: t('diamonds.buyTitle'),
      message: t('diamonds.buyFeatureConfirm', {
        name: row.label,
        cost: row.item.cost,
        days: row.item.days,
        balance: diamonds.balance,
      }),
      icon: '💎',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('diamonds.buyAction'),
          style: 'primary',
          onPress: () => {
            void (async () => {
              setBusy(row.key);
              try {
                const res = await buyDiamondItem('feature', row.key);
                if (res.ok) {
                  showAppInfo(
                    t('diamonds.boughtTitle'),
                    t('diamonds.boughtFeature', { name: row.label, n: row.item.days }),
                    '💎',
                  );
                  return;
                }
                showAppInfo(
                  t('diamonds.title'),
                  res.reason === 'insufficient'
                    ? t('diamonds.errInsufficient')
                    : res.reason === 'unavailable' || res.reason === 'disabled'
                      ? t('diamonds.errDisabled')
                      : t('diamonds.errGeneric'),
                  '💎',
                );
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    });
  };

  const onRedeem = (days: number, cost: number) => {
    if (isGuest) {
      promptSignIn();
      return;
    }
    showAppDialog({
      title: t('diamonds.redeemTitle'),
      message: t('diamonds.redeemConfirm')
        .replace('{cost}', String(cost))
        .replace('{n}', String(days)),
      icon: '👑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('diamonds.redeemAction'),
          style: 'primary',
          onPress: () => {
            void (async () => {
              setBusy(days);
              try {
                const result = await redeemDiamondPass(days);
                if (result.ok) {
                  showAppInfo(
                    t('diamonds.redeemedTitle'),
                    t('diamonds.redeemedBody').replace('{n}', String(days)),
                    '👑',
                  );
                  return;
                }
                showAppInfo(
                  t('diamonds.title'),
                  result.reason === 'insufficient'
                    ? t('diamonds.errInsufficient')
                    : t('diamonds.errGeneric'),
                  '💎',
                );
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceIcon}>💎</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.balanceValue, { color: theme.ink }]}>{diamonds.balance}</Text>
              <Text style={[styles.hint, { color: theme.muted, marginBottom: 0 }]}>
                {t('diamonds.balanceLabel')}
              </Text>
            </View>
          </View>
          {daysLeft > 0 ? (
            <View style={[styles.passBadge, { backgroundColor: theme.bg, borderColor: theme.primary }]}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800' }}>
                {t('diamonds.passActive').replace('{n}', String(daysLeft))}
              </Text>
            </View>
          ) : null}
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('diamonds.earnTitle')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            {t('diamonds.earnHint')
              .replace('{n}', String(diamonds.perAd))
              .replace('{cap}', String(diamonds.dailyAdCap))}
          </Text>

          <View style={[styles.capRow, { borderColor: theme.line }]}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{t('diamonds.todayLabel')}</Text>
            <Text style={{ color: theme.ink, fontWeight: '900' }}>
              {diamonds.earnedToday} / {diamonds.dailyAdCap}
            </Text>
          </View>

          {busy === 'earn' ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={theme.primaryDark} />
              <Text style={{ color: theme.muted, marginLeft: 10 }}>{t('diamonds.loadingAd')}</Text>
            </View>
          ) : canEarn ? (
            <PrimaryButton title={t('diamonds.watchAd')} onPress={() => void onWatchAd()} />
          ) : null}

          {isAdFreeMember && !rewardedAllowed ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.noteAlreadyPremium')}</Text>
          ) : !nativeAdsOk ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.noteDevBuild')}</Text>
          ) : !rewardedAllowed ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.errNoAd')}</Text>
          ) : leftToday === 0 ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.noteCapReached')}</Text>
          ) : null}
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('diamonds.storeTitle')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('diamonds.storeHint')}</Text>

          {storeRows.length === 0 ? (
            <Text style={{ color: theme.muted }}>{t('diamonds.noStore')}</Text>
          ) : (
            storeRows.map((row) => {
              const owned = row.kind === 'feature' && ownsWithDiamonds('feature', row.key);
              const affordable = diamonds.balance >= row.item.cost;
              const working = busy === row.key;
              return (
                <Pressable
                  key={row.key}
                  disabled={working}
                  onPress={() => onStorePress(row)}
                  style={[
                    styles.passRow,
                    {
                      borderColor: affordable || row.kind !== 'feature' ? theme.primary : theme.line,
                      backgroundColor: affordable ? theme.bg : theme.card,
                      opacity: working ? 0.6 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>{row.label}</Text>
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                      {row.kind === 'feature'
                        ? t('diamonds.storeDays', { n: row.item.days })
                        : t('diamonds.storePerItem')}
                    </Text>
                  </View>
                  {working ? (
                    <ActivityIndicator color={theme.primaryDark} />
                  ) : owned ? (
                    <Text style={{ color: theme.primaryDark, fontWeight: '900' }}>
                      {t('diamonds.storeExtend')}
                    </Text>
                  ) : (
                    <DiamondPrice cost={row.item.cost} listCost={row.item.listCost} />
                  )}
                </Pressable>
              );
            })
          )}
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('diamonds.spendTitle')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('diamonds.spendHint')}</Text>

          {diamonds.passes.length === 0 ? (
            <Text style={{ color: theme.muted }}>{t('diamonds.noPasses')}</Text>
          ) : (
            diamonds.passes.map((pass) => {
              const affordable = diamonds.balance >= pass.cost;
              const working = busy === pass.days;
              return (
                <Pressable
                  key={pass.days}
                  disabled={working}
                  onPress={() => onRedeem(pass.days, pass.cost)}
                  style={[
                    styles.passRow,
                    {
                      borderColor: affordable ? theme.primary : theme.line,
                      backgroundColor: affordable ? theme.bg : theme.card,
                      opacity: working ? 0.6 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>
                      {t('diamonds.passDays').replace('{n}', String(pass.days))}
                    </Text>
                    <DiamondPrice cost={pass.cost} listCost={pass.listCost} compact />
                  </View>
                  {working ? (
                    <ActivityIndicator color={theme.primaryDark} />
                  ) : (
                    <Text
                      style={{
                        color: affordable ? theme.primaryDark : theme.muted,
                        fontWeight: '900',
                      }}
                    >
                      {affordable
                        ? t('diamonds.redeemAction')
                        : t('diamonds.passShortfall', { n: pass.cost - diamonds.balance })}
                    </Text>
                  )}
                </Pressable>
              );
            })
          )}

          <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.adsStayNote')}</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 16, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 14, fontSize: 13 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceIcon: { fontSize: 34 },
  balanceValue: { fontSize: 30, fontWeight: '900' },
  passBadge: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  passRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  note: { fontSize: 12, lineHeight: 18, marginTop: 6 },
});
