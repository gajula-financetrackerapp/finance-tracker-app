import React, { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { GuestBanner } from '../components/Shared';
import { ExportDataSheet } from '../components/ExportDataSheet';
import { showAppDialog, showAppInfo } from '../appDialog';
import { RootStackParamList } from '../navigation/types';
import { ensureUserProfile } from '../lib/profile';

type Row = {
  kind: 'link';
  icon: string;
  title: string;
  subtitle?: string;
  vip?: boolean;
  onPress: () => void;
};

function soon(title: string) {
  showAppInfo(title, 'This setting will be available in a later update.', '✨');
}

/** Full settings list previously on Profile — opened from App Settings. */
export function AppSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode } = useFinance();
  const { theme, config, resetAll } = useApp();
  const [showExport, setShowExport] = useState(false);

  const goStack = (screen: keyof RootStackParamList) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation as any).navigate(screen);
  };

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
      }).then((p) => {
        setDisplayName(p?.full_name || null);
      });
    }, [isGuest, session?.user?.id, session?.user?.email]),
  );

  const sections: { title?: string; rows: Row[] }[] = [
    {
      rows: [
        {
          kind: 'link',
          icon: '👤',
          title: 'My Profile',
          subtitle: isGuest
            ? 'Guest'
            : displayName || session?.user?.email || 'Signed in',
          onPress: () => {
            if (isGuest) {
              setAuthMode('login');
              setShowAuth(true);
            } else {
              goStack('MyProfile');
            }
          },
        },
        {
          kind: 'link',
          icon: '🔗',
          title: 'Data Sharing',
          onPress: () => soon('Data Sharing'),
        },
        {
          kind: 'link',
          icon: '▦',
          title: 'Categories',
          subtitle: 'Expense & income categories',
          onPress: () => goStack('CategorySettings'),
        },
        {
          kind: 'link',
          icon: '🎨',
          title: 'Themes',
          onPress: () => goStack('Themes'),
        },
        {
          kind: 'link',
          icon: '🖥',
          title: 'Home page settings',
          subtitle: 'Default tab, summary & sort',
          onPress: () => goStack('HomePageSettings'),
        },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '📒',
          title: 'My Cash Books',
          subtitle: 'Personal, Business, Trip…',
          onPress: () => goStack('MyCashBooks'),
        },
        {
          kind: 'link',
          icon: '🪪',
          title: 'Accounts',
          subtitle: 'Cash, bank & wallets',
          onPress: () => goStack('Accounts'),
        },
        {
          kind: 'link',
          icon: '📤',
          title: 'Export Data',
          subtitle: 'Date range → CSV or Excel',
          onPress: () => setShowExport(true),
        },
        {
          kind: 'link',
          icon: '📥',
          title: 'Import Transactions',
          vip: true,
          onPress: () => soon('Import Transactions'),
        },
        {
          kind: 'link',
          icon: '🔒',
          title: 'Password',
          vip: true,
          onPress: () => soon('Password'),
        },
        {
          kind: 'link',
          icon: '🔔',
          title: 'Alarms & Notifications',
          subtitle: config.alarmsEnabled ? 'Alarms on' : 'Alarms off',
          onPress: () => goStack('AlarmSettings'),
        },
        {
          kind: 'link',
          icon: '📆',
          title: 'Calendar',
          onPress: () => goStack('Calendar'),
        },
        {
          kind: 'link',
          icon: '✳️',
          title: 'Avatar',
          subtitle: 'Classic free · characters for Premium',
          onPress: () => goStack('AvatarSettings'),
        },
        {
          kind: 'link',
          icon: '✨',
          title: 'AI Settings',
          onPress: () => soon('AI Settings'),
        },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '🗑',
          title: 'Delete all data',
          onPress: () => {
            showAppDialog({
              title: 'Delete all data',
              message: 'This will clear local app data. Continue?',
              icon: '🗑',
              buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await resetAll();
                    showAppInfo('Done', 'Local data cleared.', '✅');
                  },
                },
              ],
            });
          },
        },
        {
          kind: 'link',
          icon: '☁️',
          title: 'Automatically backed up data',
          onPress: () => soon('Automatically backed up data'),
        },
        {
          kind: 'link',
          icon: '🌐',
          title: 'Language',
          onPress: () => soon('Language'),
        },
        {
          kind: 'link',
          icon: '🛠',
          title: 'API (Developer Tools)',
          vip: true,
          onPress: () => soon('API (Developer Tools)'),
        },
      ],
    },
    {
      title: 'Support',
      rows: [
        { kind: 'link', icon: '❓', title: 'Help', onPress: () => soon('Help') },
        { kind: 'link', icon: '📄', title: 'Terms of Use', onPress: () => soon('Terms of Use') },
        {
          kind: 'link',
          icon: '🛡',
          title: 'Privacy Policy',
          onPress: () => soon('Privacy Policy'),
        },
        { kind: 'link', icon: 'ℹ', title: 'About us', onPress: () => soon('About us') },
        { kind: 'link', icon: '✉', title: 'Feedback', onPress: () => soon('Feedback') },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '🧹',
          title: 'Clear cache',
          onPress: () => showAppInfo('Clear cache', 'Cache cleared.', '🧹'),
        },
      ],
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <GuestBanner />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {isAdmin ? (
          <Pressable
            style={[styles.toolRow, { backgroundColor: theme.card, borderColor: theme.line }]}
            onPress={() => goStack('Admin')}
          >
            <Text style={styles.toolIcon}>⚙</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toolTitle, { color: theme.ink }]}>Admin settings</Text>
              <Text style={[styles.toolSub, { color: theme.muted }]}>
                Themes, ads and backups
              </Text>
            </View>
            <Text style={[styles.chev, { color: theme.muted }]}>›</Text>
          </Pressable>
        ) : null}

        {sections.map((section, si) => (
          <View key={`sec-${si}`} style={styles.sectionBlock}>
            {section.title ? (
              <Text style={[styles.section, { color: theme.muted }]}>{section.title}</Text>
            ) : null}
            <View
              style={[styles.group, { backgroundColor: theme.card, borderColor: theme.line }]}
            >
              {section.rows.map((row, ri) => (
                <View key={`${row.title}-${ri}`}>
                  <Pressable style={styles.row} onPress={row.onPress}>
                    <Text style={styles.rowIcon}>{row.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: theme.ink }]}>{row.title}</Text>
                      {row.subtitle ? (
                        <Text style={[styles.rowSub, { color: theme.muted }]} numberOfLines={1}>
                          {row.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {row.vip ? (
                      <View style={styles.vip}>
                        <Text style={styles.vipText}>VIP</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.chev, { color: theme.muted }]}>›</Text>
                  </Pressable>
                  {ri < section.rows.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: theme.line }]} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <ExportDataSheet visible={showExport} onClose={() => setShowExport(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 8,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionBlock: { marginBottom: 14 },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    minHeight: 54,
  },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowTitle: { fontWeight: '700', fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 54 },
  vip: {
    backgroundColor: '#E5A100',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  vipText: { color: '#fff', fontWeight: '800', fontSize: 10 },
  chev: { fontSize: 22, fontWeight: '700' },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    gap: 12,
  },
  toolIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  toolTitle: { fontWeight: '800' },
  toolSub: { fontSize: 12, marginTop: 2 },
});
