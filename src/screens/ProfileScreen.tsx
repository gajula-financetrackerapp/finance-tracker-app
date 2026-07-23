import React, { useCallback, useEffect, useState } from 'react';
import {
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
import { ProfileAdBanner } from '../components/ProfileAdBanner';
import { showAppDialog, showAppInfo } from '../appDialog';
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
  const ad = config.adBanner;
  const showAd = !!ad?.enabled && (ad.items?.length ?? 0) > 0;
  const adFingerprint = [
    ad?.enabled,
    ad?.endCardHoldSec,
    ...(ad?.items || []).map(
      (item) =>
        [
          item.id,
          item.title,
          item.subtitle,
          item.icon,
          item.buttonLabel,
          item.buttonUrl,
          item.appScheme,
          item.mediaUri,
          item.mediaType,
          item.endImageUri,
        ].join(':'),
    ),
  ].join('|');

  // If admin updates the banner, show it again even if the user dismissed an older version.
  useEffect(() => {
    setAdDismissed(false);
  }, [adFingerprint]);

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
      showAppInfo('Share', 'Could not open the share sheet right now.', '📤');
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
            showAppInfo(
              'Premium Member',
              'Premium perks (ad-free, advanced import, and more) will be available in a later update.',
              '👑',
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
              showAppDialog({
                title: 'Logout',
                message: 'Sign out of your account on this device?',
                icon: '👋',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Logout', style: 'destructive', onPress: () => void signOut() },
                ],
              })
            }
          >
            <Text style={[styles.logoutText, { color: theme.red }]}>Logout</Text>
          </Pressable>
        ) : null}

        {!adDismissed && showAd && ad ? (
          <ProfileAdBanner
            config={ad}
            onDismiss={() => setAdDismissed(true)}
            onInfo={() =>
              showAppInfo(
                'Sponsored',
                'This banner is managed by the app admin. Tap the button to open the link.',
                '📣',
              )
            }
          />
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
});
