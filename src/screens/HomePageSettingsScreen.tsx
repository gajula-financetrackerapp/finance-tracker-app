import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { DEFAULT_HOME_PREFS } from '../constants';
import { Card, PrimaryButton, Screen } from '../components/ui';
import type { HomeListTab, HomeSortOrder } from '../types';

const TAB_OPTIONS: { id: HomeListTab; label: string }[] = [
  { id: 'income', label: 'Income' },
  { id: 'expense', label: 'Expense' },
];

const SORT_OPTIONS: { id: HomeSortOrder; label: string; hint: string }[] = [
  { id: 'newest', label: 'Newest first', hint: 'Latest date at the top' },
  { id: 'oldest', label: 'Oldest first', hint: 'Earliest date at the top' },
  { id: 'amount_high', label: 'Amount · high to low', hint: 'Largest amounts first' },
  { id: 'amount_low', label: 'Amount · low to high', hint: 'Smallest amounts first' },
];

export function HomePageSettingsScreen() {
  const { config, theme, setHomePrefs, resetHomePrefsToDefaults } = useApp();
  const prefs = config.homePrefs;

  const restoreDefaults = () => {
    Alert.alert(
      'Restore app defaults',
      'Reset Home page settings to the app defaults?\n\n• Default tab: Income\n• Summary: shown\n• Sort: Newest first',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => void resetHomePrefsToDefaults(),
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>Default tab</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Which list opens first when you go to Home.
          </Text>
          <View style={styles.segRow}>
            {TAB_OPTIONS.map((opt) => {
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
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={[styles.title, { color: theme.ink, marginBottom: 0 }]}>Show summary</Text>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Show summary',
                      'When on, Home shows Expenses, Income, and Balance amounts in the header.\n\nWhen off, you still get compact Expense / Income tabs to switch the list, without the amount totals.',
                    )
                  }
                  hitSlop={10}
                  accessibilityLabel="Show summary info"
                >
                  <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '700' }}>ⓘ</Text>
                </Pressable>
              </View>
              <Text style={[styles.hint, { color: theme.muted, marginBottom: 0 }]}>
                Expenses, Income and Balance amounts on the Home header.
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
          <Text style={[styles.title, { color: theme.ink }]}>Sort order</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            How transactions are ordered in the Home list.
          </Text>
          {SORT_OPTIONS.map((opt) => {
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
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>{opt.label}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{opt.hint}</Text>
                </View>
                <Text style={{ color: on ? theme.primaryDark : theme.muted, fontWeight: '900' }}>
                  {on ? '✓' : ''}
                </Text>
              </Pressable>
            );
          })}
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>App defaults</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Restore the built-in Home defaults
            {` (${labelTab(DEFAULT_HOME_PREFS.defaultTab)}, summary ${
              DEFAULT_HOME_PREFS.showSummary ? 'on' : 'off'
            }, ${labelSort(DEFAULT_HOME_PREFS.sortOrder)}).`}
          </Text>
          <PrimaryButton title="Restore app defaults" onPress={restoreDefaults} danger />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function labelTab(tab: HomeListTab) {
  return tab === 'expense' ? 'Expense' : 'Income';
}

function labelSort(order: HomeSortOrder) {
  return SORT_OPTIONS.find((o) => o.id === order)?.label ?? order;
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 16, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 14, fontSize: 13 },
  segRow: { flexDirection: 'row', gap: 10 },
  seg: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
});
