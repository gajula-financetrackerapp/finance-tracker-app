import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { useWorkspace } from '../WorkspaceContext';
import { CURRENCIES } from '../constants';
import { theme } from '../theme';
import { GuestBanner } from '../components/Shared';
import { RootStackParamList } from '../navigation/types';

type Row =
  | {
      kind: 'link';
      icon: string;
      title: string;
      subtitle?: string;
      vip?: boolean;
      onPress: () => void;
    }
  | {
      kind: 'toggle';
      icon: string;
      title: string;
      value: boolean;
      onChange: (v: boolean) => void;
    };

function soon(title: string) {
  Alert.alert(title, 'This setting will be available in a later update.');
}

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode, signOut } = useFinance();
  const { config, exportBackup, resetAll } = useApp();
  const { setWorkspace } = useWorkspace();

  const goStack = (screen: keyof RootStackParamList) => {
    const root = navigation.getParent() ?? navigation;
    // Nested tab → stack navigation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (root as any).navigate(screen);
  };

  const [notificationShortcut, setNotificationShortcut] = useState(false);
  const [soundEffect, setSoundEffect] = useState(true);
  const [thousandsSeparator, setThousandsSeparator] = useState(true);

  const currency =
    CURRENCIES.find((c) => c.code === config.currency) || CURRENCIES[0];

  const goFinanceTab = (tab: 'Budget' | 'Home') => {
    setWorkspace('finance');
    // Best-effort: user can open Budget from tabs
    if (tab === 'Budget') {
      Alert.alert('Budget', 'Open the Budget tab at the bottom to manage budgets.');
    }
  };

  const sections: { title?: string; rows: Row[] }[] = [
    {
      rows: [
        {
          kind: 'link',
          icon: '👤',
          title: 'My Profile',
          subtitle: isGuest ? 'Guest' : session?.user?.email || 'Signed in',
          onPress: () => {
            if (isGuest) {
              setAuthMode('login');
              setShowAuth(true);
            } else {
              Alert.alert('My Profile', session?.user?.email || 'Signed in');
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
          title: 'Category settings',
          onPress: () => soon('Category settings'),
        },
        {
          kind: 'link',
          icon: '💵',
          title: 'Default currency',
          subtitle: `${currency.sym} ${currency.code} · ${currency.name}`,
          onPress: () =>
            Alert.alert(
              'Default currency',
              'Use the currency button at the top right of the app to change it.',
            ),
        },
        {
          kind: 'link',
          icon: '⏰',
          title: 'Reminder',
          onPress: () => setWorkspace('reminders'),
        },
        {
          kind: 'link',
          icon: '🔁',
          title: 'Recurring Transactions',
          onPress: () => soon('Recurring Transactions'),
        },
        {
          kind: 'link',
          icon: '📅',
          title: 'Monthly Start Date',
          vip: true,
          onPress: () => soon('Monthly Start Date'),
        },
        {
          kind: 'link',
          icon: '🎨',
          title: 'Themes',
          onPress: () =>
            isAdmin
              ? goStack('Admin')
              : Alert.alert('Themes', 'Theme settings are available to admin accounts.'),
        },
        {
          kind: 'link',
          icon: 'Aa',
          title: 'Font Size',
          onPress: () => soon('Font Size'),
        },
        {
          kind: 'link',
          icon: '🖥',
          title: 'Home page settings',
          onPress: () => soon('Home page settings'),
        },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '📒',
          title: 'My Cash Books',
          onPress: () => soon('My Cash Books'),
        },
        {
          kind: 'link',
          icon: '🪪',
          title: 'Accounts',
          onPress: () => soon('Accounts'),
        },
        {
          kind: 'link',
          icon: '📊',
          title: 'Budget',
          onPress: () => goFinanceTab('Budget'),
        },
        {
          kind: 'link',
          icon: '📤',
          title: 'Export Data',
          onPress: async () => {
            try {
              const json = exportBackup();
              await Share.share({ message: json, title: 'Pulse Wallet backup' });
            } catch {
              Alert.alert('Export Data', 'Could not export right now.');
            }
          },
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
          kind: 'toggle',
          icon: '📣',
          title: 'Notification Shortcut',
          value: notificationShortcut,
          onChange: setNotificationShortcut,
        },
        {
          kind: 'toggle',
          icon: '🎵',
          title: 'Sound Effect',
          value: soundEffect,
          onChange: setSoundEffect,
        },
        {
          kind: 'toggle',
          icon: ',',
          title: 'Thousands separator',
          value: thousandsSeparator,
          onChange: setThousandsSeparator,
        },
        {
          kind: 'link',
          icon: '00',
          title: 'Number display format',
          onPress: () => soon('Number display format'),
        },
        {
          kind: 'link',
          icon: '🧮',
          title: 'Calculator',
          onPress: () => soon('Calculator'),
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
          title: 'Icon',
          onPress: () => soon('Icon'),
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
            Alert.alert('Delete all data', 'This will clear local app data. Continue?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await resetAll();
                  Alert.alert('Done', 'Local data cleared.');
                },
              },
            ]);
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
          onPress: () => Alert.alert('Clear cache', 'Cache cleared.'),
        },
      ],
    },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <GuestBanner />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 28 }}>{isGuest ? '👤' : isAdmin ? '🛡' : '✅'}</Text>
          </View>
          <Text style={styles.name}>
            {isGuest ? 'Guest explorer' : session?.user?.email || 'Signed in'}
          </Text>
          <Text style={styles.sub}>
            {isGuest
              ? 'Browse freely. Sign up when you want to save.'
              : isAdmin
                ? 'Admin account · can edit app settings'
                : 'Signed in · saves enabled'}
          </Text>
        </View>

        {isGuest ? (
          <>
            <Pressable
              style={styles.primary}
              onPress={() => {
                setAuthMode('signup');
                setShowAuth(true);
              }}
            >
              <Text style={styles.primaryText}>Sign up to save data</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => {
                setAuthMode('login');
                setShowAuth(true);
              }}
            >
              <Text style={styles.secondaryText}>Already have an account? Login</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.secondary} onPress={signOut}>
            <Text style={[styles.secondaryText, { color: theme.red }]}>Logout</Text>
          </Pressable>
        )}

        {isAdmin ? (
          <Pressable style={styles.toolRow} onPress={() => goStack('Admin')}>
            <Text style={styles.toolIcon}>⚙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolTitle}>Admin settings</Text>
              <Text style={styles.toolSub}>Theme, features and backups</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ) : null}

        {sections.map((section, si) => (
          <View key={`sec-${si}`} style={styles.sectionBlock}>
            {section.title ? <Text style={styles.section}>{section.title}</Text> : null}
            <View style={styles.group}>
              {section.rows.map((row, ri) => (
                <View key={`${row.title}-${ri}`}>
                  {row.kind === 'toggle' ? (
                    <View style={styles.row}>
                      <Text style={styles.rowIcon}>{row.icon}</Text>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Switch
                        value={row.value}
                        onValueChange={row.onChange}
                        trackColor={{ false: theme.line, true: theme.accent }}
                        thumbColor="#fff"
                      />
                    </View>
                  ) : (
                    <Pressable style={styles.row} onPress={row.onPress}>
                      <Text style={styles.rowIcon}>{row.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{row.title}</Text>
                        {row.subtitle ? (
                          <Text style={styles.rowSub} numberOfLines={1}>
                            {row.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      {row.vip ? (
                        <View style={styles.vip}>
                          <Text style={styles.vipText}>VIP</Text>
                        </View>
                      ) : null}
                      <Text style={styles.chev}>›</Text>
                    </Pressable>
                  )}
                  {ri < section.rows.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { backgroundColor: theme.header, paddingVertical: 16, alignItems: 'center' },
  title: { color: '#fff', fontWeight: '800', fontSize: 18 },
  body: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.line,
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: { fontWeight: '800', fontSize: 18, color: theme.ink },
  sub: { color: theme.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  primary: {
    backgroundColor: theme.header,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: {
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.card,
    marginBottom: 12,
  },
  secondaryText: { color: theme.ink, fontWeight: '700' },
  section: {
    marginBottom: 8,
    color: theme.muted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionBlock: { marginBottom: 14 },
  group: {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
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
  rowTitle: { fontWeight: '700', color: theme.ink, fontSize: 15 },
  rowSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.line, marginLeft: 54 },
  vip: {
    backgroundColor: '#E5A100',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  vipText: { color: '#fff', fontWeight: '800', fontSize: 10 },
  chev: { color: theme.muted, fontSize: 22, fontWeight: '700' },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.line,
    gap: 12,
  },
  toolIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  toolTitle: { fontWeight: '800', color: theme.ink },
  toolSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
});
