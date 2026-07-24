import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { DEFAULT_HOME_PREFS } from '../constants';
import { Card, PrimaryButton, Screen } from '../components/ui';
import type { HomeListTab, HomeSortOrder } from '../types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';

export function HomePageSettingsScreen() {
  const { config, theme, setHomePrefs, resetHomePrefsToDefaults } = useApp();
  const { t } = useT();
  const prefs = config.homePrefs;

  const tabOptions: { id: HomeListTab; labelKey: TranslationKey }[] = [
    { id: 'income', labelKey: 'home.income' },
    { id: 'expense', labelKey: 'home.expenses' },
  ];

  const sortOptions: {
    id: HomeSortOrder;
    labelKey: TranslationKey;
    hintKey: TranslationKey;
  }[] = [
    { id: 'newest', labelKey: 'homePrefs.newest', hintKey: 'homePrefs.newestHint' },
    { id: 'oldest', labelKey: 'homePrefs.oldest', hintKey: 'homePrefs.oldestHint' },
    { id: 'amount_high', labelKey: 'homePrefs.amountHigh', hintKey: 'homePrefs.amountHighHint' },
    { id: 'amount_low', labelKey: 'homePrefs.amountLow', hintKey: 'homePrefs.amountLowHint' },
  ];

  const restoreDefaults = () => {
    Alert.alert(t('homePrefs.restore'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.restore'),
        style: 'destructive',
        onPress: () => void resetHomePrefsToDefaults(),
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('homePrefs.defaultTab')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('homePrefs.defaultTabHint')}</Text>
          <View style={styles.segRow}>
            {tabOptions.map((opt) => {
              const on = prefs.defaultTab === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => void setHomePrefs({ defaultTab: opt.id })}
                  style={[
                    styles.seg,
                    {
                      backgroundColor: on ? theme.ink : theme.bg,
                      borderColor: theme.line,
                    },
                  ]}
                >
                  <Text style={{ color: on ? theme.primary : theme.ink, fontWeight: '800' }}>
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.title, { color: theme.ink, marginBottom: 4 }]}>
                {t('homePrefs.showSummary')}
              </Text>
              <Text style={[styles.hint, { color: theme.muted, marginBottom: 0 }]}>
                {t('homePrefs.showSummaryHint')}
              </Text>
            </View>
            <Switch
              value={prefs.showSummary}
              onValueChange={(v) => void setHomePrefs({ showSummary: v })}
              trackColor={{ false: theme.line, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('homePrefs.sortOrder')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('homePrefs.sortHint')}</Text>
          {sortOptions.map((opt) => {
            const on = prefs.sortOrder === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => void setHomePrefs({ sortOrder: opt.id })}
                style={[
                  styles.optionRow,
                  {
                    borderColor: on ? theme.primary : theme.line,
                    backgroundColor: on ? theme.bg : theme.card,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>{t(opt.labelKey)}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {t(opt.hintKey)}
                  </Text>
                </View>
                <Text style={{ color: on ? theme.primaryDark : theme.muted, fontWeight: '900' }}>
                  {on ? '✓' : ''}
                </Text>
              </Pressable>
            );
          })}
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('homePrefs.appDefaults')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            {t('homePrefs.restore')}
            {` (${
              DEFAULT_HOME_PREFS.defaultTab === 'expense'
                ? t('home.expenses')
                : t('home.income')
            }).`}
          </Text>
          <PrimaryButton title={t('homePrefs.restore')} onPress={restoreDefaults} danger />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 16, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 14, fontSize: 13 },
  segRow: { flexDirection: 'row', gap: 10 },
  seg: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  optionRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
