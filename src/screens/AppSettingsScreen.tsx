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
import { canAccessPremiumFeature } from '../lib/premiumFeatures';
import { GuestBanner } from '../components/Shared';
import { ExportDataSheet } from '../components/ExportDataSheet';
import { showAppDialog, showAppInfo } from '../appDialog';
import { requireAuthToSave } from '../authGate';
import { RootStackParamList } from '../navigation/types';
import { ensureUserProfile } from '../lib/profile';
import { pickBackupJson, shareJsonBackup } from '../utils/backupFile';
import { clearAppCache, formatCacheBytes } from '../utils/clearAppCache';
import { languageSubtitle } from '../i18n/languages';
import { useT } from '../i18n/useT';

type Row = {
  kind: 'link';
  icon: string;
  title: string;
  subtitle?: string;
  /** Show the Premium crown (same as Profile / Themes). */
  premium?: boolean;
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
  const cloudFeatureOn = config.features.cloud !== false;
  const backupFeatureOn = config.features.backup !== false;
  const themesFeatureOn = config.features.themes !== false;
  const cloudOk =
    cloudFeatureOn &&
    canAccessPremiumFeature('cloud', isPremiumMember, config.premiumFeatures, config.features);
  const backupOk =
    backupFeatureOn &&
    canAccessPremiumFeature('backup', isPremiumMember, config.premiumFeatures, config.features);

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
    if (!backupFeatureOn) {
      showAppInfo(t('settings.backupTitle'), t('settings.backupOffByAdmin'), '⚙️');
      return;
    }
    if (!canAccessPremiumFeature('backup', isPremiumMember, config.premiumFeatures, config.features)) {
      showAppInfo(t('settings.backupTitle'), t('settings.backupPremiumOnly'), '👑');
      return;
    }
    void (async () => {
      const ok = await shareJsonBackup(exportBackup(), config.appName || 'Pulse Wallet');
      if (!ok) {
        showAppInfo(t('settings.backupTitle'), t('settings.backupShareFailed'), '💾');
      }
    })();
  };

  const restoreBackup = () => {
    if (!backupFeatureOn) {
      showAppInfo(t('settings.restore'), t('settings.restoreOffByAdmin'), '⚙️');
      return;
    }
    if (!canAccessPremiumFeature('backup', isPremiumMember, config.premiumFeatures, config.features)) {
      showAppInfo(t('settings.restore'), t('settings.restorePremiumOnly'), '👑');
      return;
    }
    showAppDialog({
      title: t('settings.restoreWarnTitle'),
      message: t('settings.restoreWarnBody'),
      icon: '⚠️',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.restoreChooseFile'),
          style: 'primary',
          onPress: () => {
            void (async () => {
              const json = await pickBackupJson();
              if (!json) return;
              showAppDialog({
                title: t('settings.restoreConfirmTitle'),
                message: t('settings.restoreConfirmBody'),
                icon: '📥',
                buttons: [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('settings.restoreReplace'),
                    style: 'primary',
                    onPress: () => {
                      showAppDialog({
                        title: t('settings.restoreRemindersTitle'),
                        message: t('settings.restoreRemindersBody'),
                        icon: '⏰',
                        buttons: [
                          {
                            text: t('settings.restoreRemindersNo'),
                            style: 'cancel',
                            onPress: () => {
                              void (async () => {
                                const ok = await importBackup(json, { replaceReminders: false });
                                showAppInfo(
                                  ok ? t('settings.restore') : t('common.couldNotSave'),
                                  ok ? t('settings.restoredOk') : t('settings.restoreFailed'),
                                  ok ? '✅' : '⚠️',
                                );
                              })();
                            },
                          },
                          {
                            text: t('settings.restoreRemindersYes'),
                            style: 'primary',
                            onPress: () => {
                              void (async () => {
                                const ok = await importBackup(json, { replaceReminders: true });
                                showAppInfo(
                                  ok ? t('settings.restore') : t('common.couldNotSave'),
                                  ok ? t('settings.restoredOk') : t('settings.restoreFailed'),
                                  ok ? '✅' : '⚠️',
                                );
                              })();
                            },
                          },
                        ],
                      });
                    },
                  },
                ],
              });
            })();
          },
        },
      ],
    });
  };

  const deleteAllData = () => {
    if (isPremiumMember) {
      showAppDialog({
        title: t('settings.deleteDataTitle'),
        message: t('settings.deleteDataBody'),
        icon: '🗑',
        buttons: [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.deletePhoneOnly'),
            style: 'destructive',
            onPress: async () => {
              await resetAll('local');
              showAppInfo(t('common.done'), t('settings.clearedLocal'), '✅');
            },
          },
          {
            text: t('settings.deleteCloudOnly'),
            style: 'destructive',
            onPress: async () => {
              await resetAll('cloud');
              showAppInfo(t('common.done'), t('settings.clearedCloud'), '✅');
            },
          },
          {
            text: t('settings.deletePhoneAndCloud'),
            style: 'destructive',
            onPress: async () => {
              await resetAll('both');
              showAppInfo(t('common.done'), t('settings.clearedBoth'), '✅');
            },
          },
        ],
      });
      return;
    }

    showAppDialog({
      title: t('settings.deleteAllTitle'),
      message: t('settings.deleteAllBody'),
      icon: '🗑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await resetAll('local');
            showAppInfo(t('common.done'), t('settings.clearedAllLocal'), '✅');
          },
        },
      ],
    });
  };

  const clearCache = () => {
    showAppDialog({
      title: t('settings.clearCache'),
      message: t('settings.clearCacheBody'),
      icon: '🧹',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearCache'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await clearAppCache();
              if (!result.ok) {
                showAppInfo(t('settings.clearCache'), t('settings.clearCacheFailed'), '⚠️');
                return;
              }
              if (result.filesRemoved === 0) {
                showAppInfo(t('settings.clearCache'), t('settings.clearCacheEmpty'), '✨');
                return;
              }
              showAppInfo(
                t('settings.clearCache'),
                t('settings.clearCacheDone').replace(
                  '{size}',
                  formatCacheBytes(result.bytesFreed),
                ),
                '✅',
              );
            })();
          },
        },
      ],
    });
  };

  const sections: { title?: string; rows: Row[] }[] = [
    {
      title: t('settings.sectionAccount'),
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
          icon: '🔒',
          title: t('settings.password'),
          onPress: () => soon(t('settings.password'), t('settings.comingSoon')),
        },
      ],
    },
    {
      title: t('settings.sectionLook'),
      rows: [
        ...(themesFeatureOn
          ? [
              {
                kind: 'link' as const,
                icon: '🎨',
                title: t('settings.themes'),
                premium: config.premiumFeatures.themes === 'premium',
                onPress: () => goStack('Themes'),
              },
            ]
          : []),
        {
          kind: 'link',
          icon: '🌐',
          title: t('settings.language'),
          subtitle: languageSubtitle(config.language),
          onPress: () => goStack('LanguageSettings'),
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
      title: t('settings.sectionFinance'),
      rows: [
        ...(config.features.finance !== false
          ? [
              {
                kind: 'link' as const,
                icon: '📋',
                title: t('allTxns.title'),
                onPress: () => goStack('AllTransactions'),
              },
              ...(config.features.smsImport !== false
                ? [
                    {
                      kind: 'link' as const,
                      icon: '📥',
                      title: t('import.title'),
                      subtitle: t('home.hubImportSub'),
                      onPress: () => goStack('ImportTransactions'),
                    },
                  ]
                : []),
              {
                kind: 'link' as const,
                icon: '📒',
                title: t('settings.cashBooks'),
                subtitle: t('settings.cashBooksSub'),
                onPress: () => goStack('MyCashBooks'),
              },
              ...(config.features.financeAccounts !== false
                ? [
                    {
                      kind: 'link' as const,
                      icon: '🪪',
                      title: t('settings.accounts'),
                      subtitle: t('settings.accountsSub'),
                      onPress: () => goStack('Accounts'),
                    },
                  ]
                : []),
              {
                kind: 'link' as const,
                icon: '▦',
                title: t('settings.categories'),
                subtitle: t('settings.categoriesSub'),
                onPress: () => goStack('CategorySettings'),
              },
              {
                kind: 'link' as const,
                icon: '📆',
                title: t('settings.calendar'),
                onPress: () => goStack('Calendar'),
              },
            ]
          : []),
      ],
    },
    {
      title: t('settings.sectionAlerts'),
      rows: [
        ...(config.features.reminders !== false
          ? [
              {
                kind: 'link' as const,
                icon: '🔔',
                title: t('settings.alarms'),
                subtitle: config.alarmsEnabled ? t('settings.alarmsOn') : t('settings.alarmsOff'),
                onPress: () => goStack('AlarmSettings'),
              },
            ]
          : []),
      ],
    },
    {
      title: t('settings.sectionData'),
      rows: [
        ...(cloudFeatureOn
          ? [
              {
                kind: 'link' as const,
                icon: '☁️',
                title: t('settings.cloudSync'),
                subtitle: cloudOk ? t('settings.cloudOn') : t('settings.cloudOff'),
                premium: config.premiumFeatures.cloud === 'premium',
                onPress: () =>
                  showAppInfo(
                    t('settings.cloudSync'),
                    cloudOk
                      ? 'Premium syncs transactions, reminders, categories, and bill images to the cloud so you can sign in on another phone.'
                      : 'Free accounts store data on this phone only. Unlock Premium for cloud sync and file backup.',
                    '☁️',
                  ),
              },
            ]
          : []),
        ...(backupFeatureOn
          ? [
              {
                kind: 'link' as const,
                icon: '💾',
                title: t('settings.backup'),
                subtitle: backupOk ? t('settings.backupOn') : t('settings.backupOff'),
                premium: config.premiumFeatures.backup === 'premium',
                onPress: backupData,
              },
              {
                kind: 'link' as const,
                icon: '📥',
                title: t('settings.restore'),
                subtitle: backupOk ? t('settings.restoreOn') : t('settings.restoreOff'),
                premium: config.premiumFeatures.backup === 'premium',
                onPress: restoreBackup,
              },
            ]
          : []),
        {
          kind: 'link',
          icon: '📤',
          title: t('settings.export'),
          subtitle: t('settings.exportSub'),
          onPress: () => setShowExport(true),
        },
        {
          kind: 'link',
          icon: '🗑',
          title: t('settings.deleteData'),
          subtitle: isPremiumMember ? t('settings.deleteDataOn') : t('settings.deleteDataOff'),
          onPress: deleteAllData,
        },
      ],
    },
    {
      title: t('settings.sectionAdvanced'),
      rows: [
        {
          kind: 'link',
          icon: '✨',
          title: t('settings.ai'),
          premium: true,
          onPress: () => soon(t('settings.ai'), t('settings.comingSoon')),
        },
        {
          kind: 'link',
          icon: '🛠',
          title: t('settings.api'),
          premium: true,
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
          title: t('settings.faq'),
          onPress: () => goStack('Faq'),
        },
        {
          kind: 'link',
          icon: '📘',
          title: t('settings.help'),
          onPress: () => goStack('Help'),
        },
        {
          kind: 'link',
          icon: '✉',
          title: t('settings.feedback'),
          onPress: () => {
            if (!requireAuthToSave('send feedback')) return;
            goStack('Feedback');
          },
        },
        {
          kind: 'link',
          icon: 'ℹ',
          title: t('settings.about'),
          onPress: () => goStack('About'),
        },
        {
          kind: 'link',
          icon: '📄',
          title: t('settings.terms'),
          onPress: () => navigation.navigate('LegalDocument', { kind: 'terms' }),
        },
        {
          kind: 'link',
          icon: '🛡',
          title: t('settings.privacy'),
          onPress: () => navigation.navigate('LegalDocument', { kind: 'privacy' }),
        },
      ],
    },
    {
      title: t('settings.sectionDevice'),
      rows: [
        {
          kind: 'link',
          icon: '🧹',
          title: t('settings.clearCache'),
          subtitle: t('settings.clearCacheSub'),
          onPress: clearCache,
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

        {sections
          .filter((section) => section.rows.length > 0)
          .map((section, si) => (
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
                    {row.premium ? <Text style={styles.premiumMark}>👑</Text> : null}
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
  premiumMark: { fontSize: 16, marginRight: 2 },
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
