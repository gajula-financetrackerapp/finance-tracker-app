import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';

export default function ReminderDashboardScreen({ navigation }) {
  const { config, expenseReminders, medReminders, groceryReminders } = useAppContext();
  const theme = getTheme(config.theme);
  const styles = makeStyles(theme);

  const pendingBills = expenseReminders.filter((r) => !r.paid).length;
  const medicineCount = medReminders.length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiringCount = groceryReminders.filter((r) => {
    if (!r.expiryDate) return false;
    const exp = new Date(r.expiryDate);
    exp.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    return diff <= 3;
  }).length;

  const cards = [
    {
      emoji: '💳',
      title: 'Expense / Bill Reminder',
      subtitle:
        pendingBills === 0
          ? 'No pending bills'
          : `${pendingBills} pending bill${pendingBills !== 1 ? 's' : ''}`,
      screen: 'ExpenseReminder',
      accentColor: theme.blue,
      accentBg: theme.blueLight,
      badge: pendingBills,
    },
    {
      emoji: '💊',
      title: 'Medicine Reminder',
      subtitle:
        medicineCount === 0
          ? 'No medicines tracked'
          : `${medicineCount} medicine${medicineCount !== 1 ? 's' : ''} tracked`,
      screen: 'MedicineReminder',
      accentColor: theme.purple,
      accentBg: theme.purpleLight,
      badge: medicineCount,
    },
    {
      emoji: '🥦',
      title: 'Grocery Expiry Reminder',
      subtitle:
        expiringCount === 0
          ? `${groceryReminders.length} item${groceryReminders.length !== 1 ? 's' : ''} tracked`
          : `${expiringCount} item${expiringCount !== 1 ? 's' : ''} expiring soon`,
      screen: 'GroceryReminder',
      accentColor: theme.green,
      accentBg: theme.greenLight,
      badge: expiringCount,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={theme.statusBar === 'dark' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.headerBg}
      />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reminders</Text>
        <Text style={styles.headerSub}>Stay on top of what matters</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Choose reminder type</Text>

        {cards.map((card) => (
          <TouchableOpacity
            key={card.screen}
            style={styles.card}
            onPress={() => navigation.navigate(card.screen)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: card.accentBg }]}>
              <Text style={styles.iconEmoji}>{card.emoji}</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>

            <View style={styles.cardRight}>
              {card.badge > 0 && (
                <View style={[styles.badge, { backgroundColor: card.accentColor }]}>
                  <Text style={styles.badgeText}>{card.badge}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
            <Text style={styles.summaryNum}>{expenseReminders.length}</Text>
            <Text style={styles.summaryLabel}>Bills</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
            <Text style={styles.summaryNum}>{medReminders.length}</Text>
            <Text style={styles.summaryLabel}>Medicines</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
            <Text style={styles.summaryNum}>{groceryReminders.length}</Text>
            <Text style={styles.summaryLabel}>Groceries</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    header: {
      backgroundColor: theme.headerBg,
      paddingTop: 52,
      paddingBottom: 18,
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.headerText,
    },
    headerSub: {
      fontSize: 13,
      color: theme.headerText,
      opacity: 0.75,
      marginTop: 2,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 14,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 3,
    },
    iconBox: {
      width: 54,
      height: 54,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    iconEmoji: {
      fontSize: 26,
    },
    cardBody: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.ink,
      marginBottom: 3,
    },
    cardSubtitle: {
      fontSize: 13,
      color: theme.muted,
    },
    cardRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 24,
    },
    summaryCard: {
      flex: 1,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    summaryNum: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.ink,
    },
    summaryLabel: {
      fontSize: 11,
      color: theme.muted,
      marginTop: 2,
    },
  });
}
