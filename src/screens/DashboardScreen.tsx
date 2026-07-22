import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { RootStackParamList } from '../navigation/types';
import { Card, Screen } from '../components/ui';
import { GuestBanner } from '../components/Shared';

export function DashboardScreen() {
  const { ready, config, theme, finance, expenseReminders, shoppingList } = useApp();
  const { isGuest, isAdmin } = useFinance();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!ready) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={theme.primaryDark} size="large" />
      </Screen>
    );
  }

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTxns = finance.transactions.filter((t) => t.date.startsWith(monthKey));
  const monthExpense = monthTxns
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  const cards = [
    config.features.finance && {
      key: 'finance',
      icon: '💰',
      title: 'Personal Finance',
      subtitle: 'Home · Charts · Reports · Accounts · Budget',
      meta: `${monthTxns.length} txns · ₹${monthExpense.toLocaleString('en-IN')} spent`,
      onPress: () => navigation.navigate('Finance'),
    },
    config.features.reminders && {
      key: 'reminders',
      icon: '⏰',
      title: 'Reminders',
      subtitle: 'Expense · Medicine · Grocery expiry · General',
      meta: `${expenseReminders.length} expense reminders`,
      onPress: () => navigation.navigate('ReminderHub'),
    },
    config.features.shoppingList && {
      key: 'shopping',
      icon: '🛒',
      title: 'Shopping List',
      subtitle: 'Things to buy and mark as purchased',
      meta: `${shoppingList.filter((i) => !i.bought).length} open items`,
      onPress: () => navigation.navigate('ShoppingList'),
    },
    {
      key: 'profile',
      icon: isGuest ? '👤' : '✅',
      title: isGuest ? 'Profile / Sign up' : 'Profile',
      subtitle: isGuest
        ? 'Browse freely · Sign up to save your changes'
        : 'Account, logout and save status',
      meta: isGuest ? 'Guest mode' : 'Signed in',
      onPress: () => navigation.navigate('Profile'),
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: string;
    title: string;
    subtitle: string;
    meta: string;
    onPress: () => void;
  }>;

  return (
    <Screen>
      <View style={[styles.topbar, { backgroundColor: theme.primaryDark }]}>
        <Text style={styles.brand}>{config.appName}</Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
          >
            <Text style={styles.chipText}>{isGuest ? 'Guest' : isAdmin ? 'Admin' : 'Account'}</Text>
          </Pressable>
          {isAdmin ? (
            <Pressable
              onPress={() => navigation.navigate('Admin')}
              style={[styles.chip, { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.chipText, { color: '#fff' }]}>⚙ Admin</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <GuestBanner />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, { color: theme.ink }]}>All-in-One Hub</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          Same modules as before — Finance, Reminders, Shopping & Admin — with a native app look.
        </Text>

        {cards.length === 0 ? (
          <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 40 }}>
            No modules enabled.
            {isAdmin
              ? ' Open Admin to turn features on.'
              : ' Ask an admin to enable features.'}
          </Text>
        ) : (
          cards.map((card) => (
            <Pressable key={card.key} onPress={card.onPress}>
              <Card>
                <View style={[styles.iconBox, { backgroundColor: theme.primary + '22' }]}>
                  <Text style={{ fontSize: 26 }}>{card.icon}</Text>
                </View>
                <Text style={[styles.cardTitle, { color: theme.ink }]}>{card.title}</Text>
                <Text style={{ color: theme.muted, lineHeight: 20 }}>{card.subtitle}</Text>
                <Text style={{ color: theme.primaryDark, fontWeight: '700', marginTop: 10, fontSize: 12 }}>
                  {card.meta}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  topbar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: '#fff', fontWeight: '800', fontSize: 17 },
  topActions: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  chipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  sub: { textAlign: 'center', marginBottom: 22, marginTop: 6, lineHeight: 20 },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
});
