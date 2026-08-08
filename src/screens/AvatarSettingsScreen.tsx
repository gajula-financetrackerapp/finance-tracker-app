import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { Card, Screen } from '../components/ui';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { showAppDialog, showAppInfo } from '../appDialog';
import { ensureUserProfile } from '../lib/profile';
import {
  AVATAR_STYLES,
  PREMIUM_AVATAR_IDS,
  canUseAvatarStyle,
  findAvatarStyle,
  userInitial,
  type AvatarStyleDef,
  type AvatarStyleId,
} from '../data/avatars';
import { canAccessPremiumFeature } from '../lib/premiumFeatures';
import { avatarStoreItem } from '../lib/diamonds';
import { DiamondPrice } from '../components/DiamondPrice';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

export function AvatarSettingsScreen() {
  const {
    theme,
    config,
    isPremiumMember,
    setAvatarStyle,
    diamonds,
    ownsWithDiamonds,
    buyDiamondItem,
    refreshDiamonds,
  } = useApp();
  const { isGuest, session } = useFinance();
  const { t } = useT();
  const [buyingId, setBuyingId] = useState<AvatarStyleId | null>(null);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const current = findAvatarStyle(config.avatarStyle);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Balance may have moved on the Diamonds screen since this list mounted.
      void refreshDiamonds();
      if (isGuest || !session?.user?.id) {
        setDisplayName(null);
        return;
      }
      void ensureUserProfile({
        userId: session.user.id,
        email: session.user.email,
      }).then((p) => setDisplayName(p?.full_name || null));
    }, [isGuest, session?.user?.id, session?.user?.email, refreshDiamonds]),
  );

  const initial = userInitial(displayName, session?.user?.email);
  const classic = AVATAR_STYLES[0];
  const characters = PREMIUM_AVATAR_IDS.map((id) => findAvatarStyle(id)).filter(
    Boolean,
  ) as AvatarStyleDef[];
  const avatarsOk = canAccessPremiumFeature(
    'avatars',
    isPremiumMember,
    config.premiumFeatures,
    config.features,
  );

  if (config.features.avatars === false) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>
            {t('avatar.characters')}
          </Text>
          <Text style={{ color: theme.muted, fontWeight: '600', lineHeight: 20 }}>
            Character avatars are turned off by an admin. Classic initial still works.
          </Text>
        </Card>
      </Screen>
    );
  }

  // Priced only while an admin keeps avatars on sale for diamonds.
  const price = avatarStoreItem(diamonds);

  const buyWithDiamonds = async (id: AvatarStyleId, cost: number) => {
    setBuyingId(id);
    const res = await buyDiamondItem('avatar', id);
    setBuyingId(null);
    if (res.ok) {
      await setAvatarStyle(id);
      showAppDialog({
        title: t('diamonds.boughtTitle'),
        message: t('diamonds.boughtAvatar', { n: cost }),
        icon: '💎',
        buttons: [{ text: t('common.gotIt'), style: 'primary' }],
      });
      return;
    }
    const message =
      res.reason === 'insufficient'
        ? t('diamonds.errInsufficient')
        : res.reason === 'signedOut'
          ? t('diamonds.signInFirst')
          : res.reason === 'owned'
            ? t('diamonds.errOwned')
            : res.reason === 'unavailable' || res.reason === 'disabled'
              ? t('diamonds.errDisabled')
              : t('diamonds.errGeneric');
    showAppInfo(t('diamonds.title'), message, '💎');
  };

  const offerPurchase = (id: AvatarStyleId, cost: number) => {
    showAppDialog({
      title: t('diamonds.buyTitle'),
      message: t('diamonds.buyAvatarConfirm', { cost, balance: diamonds.balance }),
      icon: '💎',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('diamonds.buyAction'),
          style: 'primary',
          onPress: () => void buyWithDiamonds(id, cost),
        },
      ],
    });
  };

  const pick = async (id: AvatarStyleId) => {
    if (canUseAvatarStyle(id, avatarsOk) || ownsWithDiamonds('avatar', id)) {
      await setAvatarStyle(id);
      return;
    }
    if (price) {
      offerPurchase(id, price.cost);
      return;
    }
    showAppDialog({
      title: t('avatar.premiumTitle'),
      message: t('avatar.premiumMsg'),
      icon: '✨',
      buttons: [{ text: t('common.gotIt'), style: 'primary' }],
    });
  };

  const renderTile = (item: AvatarStyleDef) => {
    const on = config.avatarStyle === item.id;
    const owned = ownsWithDiamonds('avatar', item.id);
    const locked = !canUseAvatarStyle(item.id, avatarsOk) && !owned;
    const buying = buyingId === item.id;
    return (
      <Pressable
        key={item.id}
        onPress={() => void pick(item.id)}
        disabled={buying}
        style={[
          styles.tile,
          {
            borderColor: on ? theme.header : theme.line,
            backgroundColor: theme.card,
            opacity: locked ? 0.75 : 1,
          },
        ]}
      >
        <ProfileAvatar initial={initial} styleId={item.id} preview size={64} />
        {on ? <Text style={[styles.check, { color: theme.header }]}>✓</Text> : null}
        {locked ? (
          <View style={styles.lock}>
            {buying ? (
              <ActivityIndicator color="#fff" />
            ) : price ? (
              <DiamondPrice cost={price.cost} listCost={price.listCost} compact color="#fff" />
            ) : (
              <Text style={styles.lockText}>{t('themes.premium')}</Text>
            )}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('settings.avatar')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('avatar.hint')}</Text>
          <View style={styles.previewCol}>
            <ProfileAvatar initial={initial} size={88} />
            <Text style={[styles.previewName, { color: theme.ink }]}>
              {current.id === 'classic' ? current.label : t('avatar.character')}
            </Text>
            <Text style={[styles.previewBlurb, { color: theme.muted }]}>{current.blurb}</Text>
          </View>
        </Card>

        <Card>
          <Text style={[styles.section, { color: theme.ink }]}>{t('avatar.classic')}</Text>
          <Pressable
            onPress={() => void pick('classic')}
            style={[
              styles.classicRow,
              {
                borderColor: config.avatarStyle === 'classic' ? theme.header : theme.line,
                backgroundColor: theme.card,
              },
            ]}
          >
            <ProfileAvatar initial={initial} styleId="classic" size={48} animate={false} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.tileLabel, { color: theme.ink }]}>{classic.label}</Text>
              <Text style={[styles.tileBlurb, { color: theme.muted }]}>{classic.blurb}</Text>
            </View>
            {config.avatarStyle === 'classic' ? (
              <Text style={[styles.checkInline, { color: theme.header }]}>✓</Text>
            ) : null}
          </Pressable>
        </Card>

        <Card>
          <Text style={[styles.section, { color: theme.ink }]}>{t('avatar.characters')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            {avatarsOk
              ? t('avatar.premiumChars')
              : price
                ? t('avatar.diamondHint', { cost: price.cost, balance: diamonds.balance })
                : t('avatar.premiumChars')}
          </Text>
          <View style={styles.grid}>{characters.map(renderTile)}</View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40 },
    title: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
    section: { fontWeight: '900', fontSize: 16, marginBottom: 6 },
    hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
    previewCol: { alignItems: 'center', gap: 6, marginTop: 4 },
    previewName: { fontWeight: '800', fontSize: 15 },
    previewBlurb: { fontSize: 12 },
    classicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1.5,
      borderRadius: 14,
      padding: 12,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      width: '30%',
      flexGrow: 1,
      maxWidth: '31.5%',
      borderWidth: 1.5,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      minHeight: 88,
    },
    tileLabel: { fontWeight: '800', fontSize: 12 },
    tileBlurb: { fontSize: 11, lineHeight: 14 },
    check: { position: 'absolute', top: 6, right: 8, fontWeight: '900', fontSize: 14 },
    checkInline: { fontWeight: '900', fontSize: 16 },
    lock: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.28)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lockText: { color: '#fff', fontWeight: '900', fontSize: 10 },
  });
}
