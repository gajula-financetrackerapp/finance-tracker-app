import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from '../navigation/types';
import { ensureUserProfile } from '../lib/profile';

type MenuRow = {
  icon: string;
  title: string;
  onPress: () => void;
};

/**
 * Profile hub — few top-level options (like Money Tracker).
 * Detailed preferences live under App Settings.
 */
export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode, signOut } = useFinance();
  const { theme, config } = useApp();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [adDismissed, setAdDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isGuest || !session?.user?.id) {
        setDisplayName(null);
        return;
      }
      void ensureUserProfile({
        userId: session.user.id,
        email: session.user.email,
      }).then((p) => {
        setDisplayName(p?.full_name || null);
      });
    }, [isGuest, session?.user?.id, session?.user?.email]),
  );

  const goStack = (screen: keyof RootStackParamList) => {
    const root = navigation.getParent() ?? navigation;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (root as any).navigate(screen);
  };

  const onHeaderPress = () => {
    if (isGuest) {
      setAuthMode('login');
      setShowAuth(true);
      return;
    }
    goStack('MyProfile');
  };

  const referFriends = async () => {
    try {
      await Share.share({
        message: `Try ${config.appName} — a simple finance & reminders app. Download it and track together!`,
        title: `Share ${config.appName}`,
      });
    } catch {
      Alert.alert('Share', 'Could not open the share sheet right now.');
    }
  };

  const menuRows: MenuRow[] = [
    {
      icon: '👍',
      title: 'Refer to friends',
      onPress: () => void referFriends(),
    },
    {
      icon: '⚙',
      title: 'App Settings',
      onPress: () => goStack('AppSettings'),
    },
    ...(isAdmin
      ? [
          {
            icon: '🛡',
            title: 'Admin settings',
            onPress: () => goStack('Admin'),
          } satisfies MenuRow,
        ]
      : []),
  ];

  const headerBg = theme.primaryDark || theme.primary;
  const titleName = isGuest
    ? 'Sign In'
    : displayName || session?.user?.email?.split('@')[0] || 'Signed in';
  const subtitle = isGuest
    ? 'Sign in, more exciting!'
    : session?.user?.email || 'Tap to manage your profile';

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { backgroundColor: headerBg, paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.headerRow} onPress={onHeaderPress}>
          <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.28)' }]}>
            <Text style={styles.avatarEmoji}>{isGuest ? '👤' : '✅'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{titleName}</Text>
            <Text style={styles.headerSub}>{subtitle}</Text>
          </View>
          <Text style={styles.headerChev}>›</Text>
        </Pressable>
        <View style={[styles.headerCurve, { backgroundColor: theme.bg }]} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={[styles.group, styles.premiumCard, { backgroundColor: theme.card, borderColor: theme.line }]}
          onPress={() =>
            Alert.alert(
              'Premium Member',
              'Premium perks (ad-free, advanced import, and more) will be available in a later update.',
            )
          }
        >
          <Text style={styles.rowIcon}>👑</Text>
          <Text style={[styles.rowTitle, { color: theme.ink, flex: 1 }]}>Premium Member</Text>
          <Text style={[styles.chev, { color: theme.muted }]}>›</Text>
        </Pressable>

        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {menuRows.map((row, i) => (
            <View key={row.title}>
              <Pressable style={styles.row} onPress={row.onPress}>
                <Text style={styles.rowIcon}>{row.icon}</Text>
                <Text style={[styles.rowTitle, { color: theme.ink, flex: 1 }]}>{row.title}</Text>
                <Text style={[styles.chev, { color: theme.muted }]}>›</Text>
              </Pressable>
              {i < menuRows.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: theme.line }]} />
              ) : null}
            </View>
          ))}
        </View>

        {!isGuest ? (
          <Pressable
            style={[styles.logoutBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            onPress={() =>
              Alert.alert('Logout', 'Sign out of your account on this device?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: () => void signOut() },
              ])
            }
          >
            <Text style={[styles.logoutText, { color: theme.red }]}>Logout</Text>
          </Pressable>
        ) : null}

        {!adDismissed ? (
          <View style={[styles.adBanner, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.adTop}>
              <Text style={[styles.adBadge, { color: theme.muted }]}>Ad</Text>
              <View style={styles.adActions}>
                <Pressable
                  hitSlop={10}
                  onPress={() =>
                    Alert.alert(
                      'Sponsored space',
                      'This banner is reserved for the app owner to show promotions or partner ads.',
                    )
                  }
                  accessibilityLabel="Ad info"
                >
                  <Text style={[styles.adActionIcon, { color: theme.muted }]}>ⓘ</Text>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  onPress={() => setAdDismissed(true)}
                  accessibilityLabel="Dismiss ad"
                >
                  <Text style={[styles.adActionIcon, { color: theme.muted }]}>✕</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.adBody}>
              <View style={[styles.adLogo, { backgroundColor: theme.bg }]}>
                <Text style={{ fontSize: 22 }}>📣</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.adTitle, { color: theme.ink }]}>Your ad goes here</Text>
                <Text style={[styles.adSub, { color: theme.muted }]}>
                  Promote a partner app or offer for {config.appName} users.
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.adCta, { backgroundColor: theme.primary }]}
              onPress={() =>
                Alert.alert(
                  'Ad slot',
                  'Wire this button to a URL or campaign when you are ready to run ads.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Open example',
                      onPress: () => void Linking.openURL('https://example.com'),
                    },
                  ],
                )
              }
            >
              <Text style={styles.adCtaText}>Open</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    zIndex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 26 },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 20 },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },
  headerChev: { color: 'rgba(255,255,255,0.7)', fontSize: 28, fontWeight: '300' },
  headerCurve: {
    position: 'absolute',
    left: -40,
    right: -40,
    bottom: -36,
    height: 56,
    borderTopLeftRadius: 80,
    borderTopRightRadius: 80,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
    minHeight: 56,
  },
  rowIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  rowTitle: { fontWeight: '700', fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  chev: { fontSize: 22, fontWeight: '700' },
  logoutBtn: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: { fontWeight: '800', fontSize: 16 },
  adBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  adTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adBadge: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  adActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  adActionIcon: { fontSize: 16, fontWeight: '700' },
  adBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adTitle: { fontWeight: '800', fontSize: 15 },
  adSub: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  adCta: {
    alignSelf: 'flex-end',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  adCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
