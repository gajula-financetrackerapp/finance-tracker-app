/**
 * DashboardScreen.js
 *
 * Shows 3 feature cards:
 *   1. Personal Finance Tracker — navigates to the Finance tab
 *   2. Reminder & Tracking     — navigates to the Reminders tab
 *   3. List to Buy             — navigates to the BuyList tab
 *
 * Each card contains:
 *   - Icon in a colored circle
 *   - Feature name (bold)
 *   - Short description
 *   - Quick stats pulled from AppContext
 *
 * Top bar has the app name, a settings button, and a user greeting.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../state/AppContext';
import { getTheme } from '../constants/colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount, currency = 'USD') {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return '$0.00';
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  });
}

// ─── Feature card component ───────────────────────────────────────────────────

function FeatureCard({ icon, iconBg, title, description, stats, onPress, theme }) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Text style={styles.iconEmoji}>{icon}</Text>
      </View>

      {/* Text */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.ink }]}>{title}</Text>
        <Text style={[styles.cardDesc, { color: theme.muted }]}>{description}</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {stats.map((stat, i) => (
            <View key={i} style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.ink }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={20} color={theme.muted} style={styles.chevron} />
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation();
  const {
    user,
    config,
    totalBalance,
    expenseReminders,
    medReminders,
    groceryReminders,
    buyList,
    accounts,
    transactions,
  } = useAppContext();

  const theme = getTheme(config?.theme ?? 'yellow');

  // ── Derived stats ──────────────────────────────────────────────────────────

  const userLabel = useMemo(() => {
    if (!user) return 'Guest';
    const email = user.email ?? '';
    return email.split('@')[0] || email;
  }, [user]);

  const pendingReminders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expCount = expenseReminders.filter((r) => {
      if (!r.dueDate) return false;
      return new Date(r.dueDate) >= today;
    }).length;

    const medCount = medReminders.filter((r) => {
      if (!r.endDate) return true; // ongoing
      return new Date(r.endDate) >= today;
    }).length;

    const grocCount = groceryReminders.filter((r) => {
      if (!r.expiryDate) return false;
      return new Date(r.expiryDate) >= today;
    }).length;

    return expCount + medCount + grocCount;
  }, [expenseReminders, medReminders, groceryReminders]);

  const pendingBuyItems = useMemo(
    () => buyList.filter((i) => !i.bought).length,
    [buyList]
  );

  const totalBuyItems = buyList.length;

  const currency = config?.currency ?? 'USD';
  const formattedBalance = formatCurrency(totalBalance, currency);

  const monthlyTx = useMemo(() => {
    const now = new Date();
    return transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [transactions]);

  // ── Tab navigation helpers ─────────────────────────────────────────────────

  function goToTab(tabName) {
    navigation.navigate(tabName);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { backgroundColor: theme.primary }]}>
        <View>
          <Text style={[styles.topBarTitle, { color: theme.ink }]}>Finance Tracker</Text>
          <Text style={[styles.greeting, { color: theme.ink }]}>Hello, {userLabel} 👋</Text>
        </View>
        <TouchableOpacity
          style={[styles.settingsBtn, { backgroundColor: theme.card }]}
          onPress={() => navigation.navigate('Admin')}
          activeOpacity={0.8}
        >
          <Ionicons name="settings-outline" size={20} color={theme.ink} />
        </TouchableOpacity>
      </View>

      {/* ── Cards ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Finance card */}
        <FeatureCard
          theme={theme}
          icon="💰"
          iconBg={theme.orangeLight}
          title="Personal Finance"
          description="Track accounts, income, expenses and budgets."
          stats={[
            { label: 'Total Balance', value: formattedBalance },
            { label: 'Accounts', value: String(accounts.length) },
            { label: 'Tx This Month', value: String(monthlyTx) },
          ]}
          onPress={() => goToTab('Finance')}
        />

        {/* Reminders card */}
        <FeatureCard
          theme={theme}
          icon="🔔"
          iconBg={theme.blueLight}
          title="Reminder & Tracking"
          description="Bills, medicines, and grocery expiry alerts."
          stats={[
            { label: 'Active', value: String(pendingReminders) },
            { label: 'Bills', value: String(expenseReminders.length) },
            { label: 'Medicines', value: String(medReminders.length) },
          ]}
          onPress={() => goToTab('Reminders')}
        />

        {/* Buy List card */}
        <FeatureCard
          theme={theme}
          icon="🛒"
          iconBg={theme.greenLight}
          title="List to Buy"
          description="Shopping list with one-tap check-off."
          stats={[
            { label: 'To Buy', value: String(pendingBuyItems) },
            { label: 'Total Items', value: String(totalBuyItems) },
            {
              label: 'Done',
              value: String(totalBuyItems - pendingBuyItems),
            },
          ]}
          onPress={() => goToTab('BuyList')}
        />

        {/* Quick tips footer */}
        <View style={[styles.tipsBox, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="bulb-outline" size={16} color={theme.primaryDark} />
          <Text style={[styles.tipsText, { color: theme.ink }]}>
            Tap any card to jump straight into that feature.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  greeting: {
    fontSize: 13,
    marginTop: 2,
    opacity: 0.75,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // Scroll
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },

  // Feature card
  card: {
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 26,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  statItem: {
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 1,
  },
  chevron: {
    alignSelf: 'center',
    marginLeft: 6,
  },

  // Tips box
  tipsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  tipsText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
