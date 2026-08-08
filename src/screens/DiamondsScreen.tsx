import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { showAppDialog, showAppInfo } from '../appDialog';
import { diamondsLeftToday, passDaysLeft, type DiamondEarnReason } from '../lib/diamonds';
import { isGoogleAdsNativeAvailable, shouldShowGoogleAds } from '../lib/googleAds';
import { useT } from '../i18n/useT';

export function DiamondsScreen() {
  const {
    theme,
    config,
    diamonds,
    refreshDiamonds,
    earnDiamondsByAd,
    redeemDiamondPass,
    isAdFreeMember,
    premiumPassUntil,
  } = useApp();
  const { isGuest, isAdmin, setAuthMode, setShowAuth } = useFinance();
  const { t } = useT();
  const [busy, setBusy] = useState<'earn' | number | null>(null);

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

          {!rewardedAllowed ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.noteAlreadyPremium')}</Text>
          ) : !nativeAdsOk ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.noteDevBuild')}</Text>
          ) : leftToday === 0 ? (
            <Text style={[styles.note, { color: theme.muted }]}>{t('diamonds.noteCapReached')}</Text>
          ) : null}
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
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>
                      {t('diamonds.passDays').replace('{n}', String(pass.days))}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                      {t('diamonds.passCost').replace('{n}', String(pass.cost))}
                    </Text>
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
                      {affordable ? t('diamonds.redeemAction') : `💎 ${pass.cost - diamonds.balance}`}
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
