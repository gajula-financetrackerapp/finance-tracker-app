import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from '../navigation/types';
import { Card, Screen } from '../components/ui';

export function DashboardScreen() {
  const { ready, config, theme } = useApp();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!ready) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={theme.primaryDark} size="large" />
      </Screen>
    );
  }

  const cards = [
    config.features.finance && {
      key: 'finance',
      icon: '💰',
      title: 'Personal Finance',
      subtitle: 'Track expenses, income, accounts & budgets',
      onPress: () => navigation.navigate('Finance'),
    },
    config.features.reminders && {
      key: 'reminders',
      icon: '⏰',
      title: 'Reminders',
      subtitle: 'Expense, medicine, grocery & general alerts',
      onPress: () => navigation.navigate('ReminderHub'),
    },
    config.features.shoppingList && {
      key: 'shopping',
      icon: '🛒',
      title: 'Shopping List',
      subtitle: 'Things to buy and mark as purchased',
      onPress: () => navigation.navigate('ShoppingList'),
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: string;
    title: string;
    subtitle: string;
    onPress: () => void;
  }>;

  return (
    <Screen>
      <View style={[styles.topbar, { backgroundColor: theme.card, borderBottomColor: theme.line }]}>
        <Text style={[styles.brand, { color: theme.ink }]}>💠 {config.appName}</Text>
        <Pressable
          onPress={() => navigation.navigate('Admin')}
          style={[styles.adminBtn, { backgroundColor: theme.ink }]}
        >
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>⚙ Admin</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, { color: theme.ink }]}>{config.appName}</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          All-in-one tracker for money, reminders and shopping
        </Text>

        {cards.length === 0 ? (
          <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 40 }}>
            No modules enabled. Open Admin to turn features on.
          </Text>
        ) : (
          cards.map((card) => (
            <Pressable key={card.key} onPress={card.onPress}>
              <Card>
                <View style={[styles.iconBox, { backgroundColor: theme.primary }]}>
                  <Text style={{ fontSize: 26 }}>{card.icon}</Text>
                </View>
                <Text style={[styles.cardTitle, { color: theme.ink }]}>{card.title}</Text>
                <Text style={{ color: theme.muted, lineHeight: 20 }}>{card.subtitle}</Text>
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
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontWeight: '800', fontSize: 17 },
  adminBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9 },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 18 },
  sub: { textAlign: 'center', marginBottom: 28, marginTop: 6 },
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
