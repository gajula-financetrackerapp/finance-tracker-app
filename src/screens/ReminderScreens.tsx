import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { RootStackParamList } from '../navigation/types';

export function ReminderHubScreen() {
  const { config, theme } = useApp();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const items = [
    config.features.expenseReminder && {
      key: 'expense',
      icon: '💸',
      title: 'Expense Reminder',
      subtitle: 'Rent, bills and due dates',
      route: 'ExpenseReminder' as const,
    },
    config.features.medicineReminder && {
      key: 'med',
      icon: '💊',
      title: 'Medicine Reminder',
      subtitle: 'Daily / weekly medicine schedule',
      route: 'MedicineReminder' as const,
    },
    config.features.groceryExpiryReminder && {
      key: 'grocery',
      icon: '🥬',
      title: 'Grocery Expiry',
      subtitle: 'Track expiry dates for food items',
      route: 'GroceryReminder' as const,
    },
    config.features.generalReminder && {
      key: 'general',
      icon: '🔔',
      title: 'General Reminder',
      subtitle: 'Meetings, calls and personal tasks',
      route: 'GeneralReminder' as const,
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: string;
    title: string;
    subtitle: string;
    route: keyof RootStackParamList;
  }>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.h1, { color: theme.ink }]}>Reminder & Tracking</Text>
        <Text style={{ color: theme.muted, marginBottom: 18 }}>Choose a reminder type</Text>
        {items.map((item) => (
          <Pressable key={item.key} onPress={() => navigation.navigate(item.route as never)}>
            <Card>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={[styles.icon, { backgroundColor: theme.primary }]}>
                  <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>{item.title}</Text>
                  <Text style={{ color: theme.muted }}>{item.subtitle}</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
