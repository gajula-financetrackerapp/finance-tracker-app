import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { Card, Screen } from '../components/ui';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { showAppDialog } from '../appDialog';
import { ensureUserProfile } from '../lib/profile';
import {
  AVATAR_STYLES,
  canUseAvatarStyle,
  findAvatarStyle,
  userInitial,
  type AvatarStyleDef,
  type AvatarStyleId,
} from '../data/avatars';
import type { ThemeTokens } from '../types';

const GENT_IDS: AvatarStyleId[] = [
  'ryan',
  'george',
  'marco',
  'nathan',
  'malik',
  'arthur',
  'daniel',
];
const LADY_IDS: AvatarStyleId[] = [
  'emma',
  'clara',
  'amara',
  'sophia',
  'helen',
  'isabella',
  'nora',
];

export function AvatarSettingsScreen() {
  const {
    theme,
    config,
    isPremiumMember,
    setPremiumMember,
    setAvatarStyle,
  } = useApp();
  const { isGuest, session } = useFinance();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const current = findAvatarStyle(config.avatarStyle);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (isGuest || !session?.user?.id) {
        setDisplayName(null);
        return;
      }
      void ensureUserProfile({
        userId: session.user.id,
        email: session.user.email,
      }).then((p) => setDisplayName(p?.full_name || null));
    }, [isGuest, session?.user?.id, session?.user?.email]),
  );

  const initial = userInitial(displayName, session?.user?.email);
  const classic = AVATAR_STYLES[0];
  const byId = (ids: AvatarStyleId[]) =>
    ids.map((id) => findAvatarStyle(id)).filter(Boolean) as AvatarStyleDef[];

  const pick = async (id: AvatarStyleId) => {
    if (!canUseAvatarStyle(id, isPremiumMember)) {
      showAppDialog({
        title: 'Premium avatar',
        message: `${findAvatarStyle(id).label} is a Premium character avatar. Unlock Premium to use it.`,
        icon: '✨',
        buttons: [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Unlock Premium',
            style: 'primary',
            onPress: () => {
              void setPremiumMember(true).then(() => void setAvatarStyle(id));
            },
          },
        ],
      });
      return;
    }
    await setAvatarStyle(id);
  };

  const renderTile = (item: AvatarStyleDef) => {
    const on = config.avatarStyle === item.id;
    const locked = !canUseAvatarStyle(item.id, isPremiumMember);
    return (
      <Pressable
        key={item.id}
        onPress={() => void pick(item.id)}
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
        <Text style={[styles.tileLabel, { color: theme.ink }]} numberOfLines={1}>
          {item.label}
        </Text>
        {on ? <Text style={[styles.check, { color: theme.header }]}>✓</Text> : null}
        {locked ? (
          <View style={styles.lock}>
            <Text style={styles.lockText}>Premium</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>Avatar</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Classic follows your theme and shows your initial ({initial}). Premium unlocks
            3D character avatars.
          </Text>
          <View style={styles.previewCol}>
            <ProfileAvatar initial={initial} size={88} />
            <Text style={[styles.previewName, { color: theme.ink }]}>{current.label}</Text>
            <Text style={[styles.previewBlurb, { color: theme.muted }]}>{current.blurb}</Text>
          </View>
        </Card>

        <Card>
          <Text style={[styles.section, { color: theme.ink }]}>Classic</Text>
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
          <Text style={[styles.section, { color: theme.ink }]}>Characters</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Premium · characters with a light idle animation.
          </Text>
          <View style={styles.grid}>
            {[...byId(LADY_IDS), ...byId(GENT_IDS)].map(renderTile)}
          </View>
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
      gap: 6,
      overflow: 'hidden',
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
