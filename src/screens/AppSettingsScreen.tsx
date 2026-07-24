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
import { pickBackupJson, shareJsonBackup } from '../utils/backupFile';
import { languageSubtitle } from '../i18n/languages';
import { useT } from '../i18n/useT';

type Row = {
  kind: 'link';
  icon: string;
  title: string;
  subtitle?: string;
  vip?: boolean;
  onPress: () => void;
};

function soon(title: string, message: string) {
  showAppInfo(title, message, '✨');
}

/** Full settings list previously on Profile — opened from App Settings. */
export function AppSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode } = useFinance();
  const { theme, config, resetAll, exportBackup, importBackup, isPremiumMember } = useApp();
  const { t } = useT();
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

  const backupData = () => {
    if (!isPremiumMember) {
      showAppInfo(
        'Backup',
        'File backup (Gmail / Files) is a Premium feature. Free keeps data on this phone only. Unlock Premium for backup and cloud sync.',
        '👑',
      );
      return;
    }
    void (async () => {
      const ok = await shareJsonBackup(exportBackup(), config.appName || 'Pulse Wallet');
      if (!ok) {
        showAppInfo(
          'Backup',
          'Could not open the share sheet. Try again, or use Export Data for a spreadsheet.',
          '💾',
        );
      }
    })();
  };

  const restoreBackup = () => {
    if (!isPremiumMember) {
      showAppInfo(
        'Restore backup',
        'Restoring a backup file is a Premium feature. Unlock Premium to use Backup / Restore.',
        '👑',
      );
      return;
    }
    showAppDialog({
      title: 'Restore backup',
      message:
        'Pick a Pulse Wallet backup JSON file (for example from Gmail Downloads or Files). This replaces data on this phone.',
      icon: '📥',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          style: 'primary',
          onPress: () => {
            void (async () => {
              const json = await pickBackupJson();
              if (!json) return;
              const ok = await importBackup(json);
              showAppInfo(
                ok ? 'Restored' : 'Restore failed',
                ok
                  ? 'Your backup was imported into this phone.'
                  : 'That file does not look like a valid Pulse Wallet backup.',
                ok ? '✅' : '⚠️',
              );
            })();
          },
        },
      ],
    });
  };

  const deleteAllData = () => {
    if (isPremiumMember) {
      showAppDialog({
        title: 'Delete data',
        message:
          'Premium data is on this phone and in the cloud. What should we delete?',
        icon: '🗑',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'This phone only',
            style: 'destructive',
            onPress: async () => {
              await resetAll('local');
              showAppInfo('Done', 'Local data cleared. Cloud copy is unchanged.', '✅');
            },
          },
          {
            text: 'Cloud only',
            style: 'destructive',
            onPress: async () => {
              await resetAll('cloud');
              showAppInfo('Done', 'Cloud data cleared. Data on this phone is unchanged.', '✅');
            },
          },
          {
            text: 'Phone + cloud',
            style: 'destructive',
            onPress: async () => {
              await resetAll('both');
              showAppInfo('Done', 'Local and cloud data cleared.', '✅');
            },
          },
        ],
      });
      return;
    }

    showAppDialog({
      title: 'Delete all data',
      message:
        'Your data is stored on this phone only. Deleting removes everything here and cannot be recovered.',
      icon: '🗑',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await resetAll('local');
            showAppInfo('Done', 'All local data cleared.', '✅');
          },
        },
      ],
    });
  };

  const sections: { title?: string; rows: Row[] }[] = [
    {
      rows: [
        {
          kind: 'link',
          icon: '👤',
          title: t('settings.myProfile'),
          subtitle: isGuest
            ? t('common.guest')
            : displayName || session?.user?.email || t('profile.signedIn'),
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
          title: t('settings.dataSharing'),
          onPress: () => soon(t('settings.dataSharing'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '▦',
          title: t('settings.categories'),
          subtitle: t('settings.categoriesSub'),
          onPress: () => goStack('CategorySettings'),
        },
        {
          kind: 'link',
          icon: '🎨',
          title: t('settings.themes'),
          onPress: () => goStack('Themes'),
        },
        {
          kind: 'link',
          icon: '🖥',
          title: t('settings.homePage'),
          subtitle: t('settings.homePageSub'),
          onPress: () => goStack('HomePageSettings'),
        },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '📒',
          title: t('settings.cashBooks'),
          subtitle: t('settings.cashBooksSub'),
          onPress: () => goStack('MyCashBooks'),
        },
        {
          kind: 'link',
          icon: '🪪',
          title: t('settings.accounts'),
          subtitle: t('settings.accountsSub'),
          onPress: () => goStack('Accounts'),
        },
        {
          kind: 'link',
          icon: '📤',
          title: t('settings.export'),
          subtitle: t('settings.exportSub'),
          onPress: () => setShowExport(true),
        },
        {
          kind: 'link',
          icon: '📥',
          title: t('settings.import'),
          vip: true,
          onPress: () => soon(t('settings.import'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '🔒',
          title: t('settings.password'),
          vip: true,
          onPress: () => soon(t('settings.password'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '🔔',
          title: t('settings.alarms'),
          subtitle: config.alarmsEnabled ? t('settings.alarmsOn') : t('settings.alarmsOff'),
          onPress: () => goStack('AlarmSettings'),
        },
        {
          kind: 'link',
          icon: '📆',
          title: t('settings.calendar'),
          onPress: () => goStack('Calendar'),
        },
        {
          kind: 'link',
          icon: '✳️',
          title: t('settings.avatar'),
          subtitle: t('settings.avatarSub'),
          onPress: () => goStack('AvatarSettings'),
        },
        {
          kind: 'link',
          icon: '✨',
          title: t('settings.ai'),
          onPress: () => soon(t('settings.ai'), t('settings.comingSoon')),
        },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '💾',
          title: t('settings.backup'),
          subtitle: isPremiumMember ? t('settings.backupOn') : t('settings.backupOff'),
          vip: !isPremiumMember,
          onPress: backupData,
        },
        {
          kind: 'link',
          icon: '📥',
          title: t('settings.restore'),
          subtitle: isPremiumMember ? t('settings.restoreOn') : t('settings.restoreOff'),
          vip: !isPremiumMember,
          onPress: restoreBackup,
        },
        {
          kind: 'link',
          icon: '🗑',
          title: t('settings.deleteData'),
          subtitle: isPremiumMember ? t('settings.deleteDataOn') : t('settings.deleteDataOff'),
          onPress: deleteAllData,
        },
        {
          kind: 'link',
          icon: '☁️',
          title: t('settings.cloudSync'),
          subtitle: isPremiumMember ? t('settings.cloudOn') : t('settings.cloudOff'),
          onPress: () =>
            showAppInfo(
              t('settings.cloudSync'),
              isPremiumMember
                ? 'Premium syncs transactions, reminders, categories, and bill images to Supabase so you can sign in on another phone.'
                : 'Free accounts store data on this phone only. Unlock Premium for cloud sync and file backup.',
              '☁️',
            ),
        },
        {
          kind: 'link',
          icon: '🌐',
          title: t('settings.language'),
          subtitle: languageSubtitle(config.language),
          onPress: () => goStack('LanguageSettings'),
        },
        {
          kind: 'link',
          icon: '🛠',
          title: t('settings.api'),
          vip: true,
          onPress: () => soon(t('settings.api'), t('settings.comingSoon')),
        },
      ],
    },
    {
      title: t('common.support'),
      rows: [
        {
          kind: 'link',
          icon: '❓',
          title: t('settings.help'),
          onPress: () => soon(t('settings.help'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '📄',
          title: t('settings.terms'),
          onPress: () => soon(t('settings.terms'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '🛡',
          title: t('settings.privacy'),
          onPress: () => soon(t('settings.privacy'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: 'ℹ',
          title: t('settings.about'),
          onPress: () => soon(t('settings.about'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '✉',
          title: t('settings.feedback'),
          onPress: () => soon(t('settings.feedback'), t('settings.comingSoon')),
        },
      ],
    },
    {
      rows: [
        {
          kind: 'link',
          icon: '🧹',
          title: t('settings.clearCache'),
          onPress: () => showAppInfo(t('settings.clearCache'), 'Cache cleared.', '🧹'),
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
              <Text style={[styles.toolTitle, { color: theme.ink }]}>{t('profile.admin')}</Text>
              <Text style={[styles.toolSub, { color: theme.muted }]}>
                {t('settings.adminThemes')}
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
