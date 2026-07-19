/**
 * AppNavigator.js
 *
 * Full navigation tree:
 *
 *   AuthStack
 *     └─ LoginScreen
 *
 *   MainTabs (Bottom Tab Navigator)
 *     ├─ Dashboard (stack)
 *     │    └─ DashboardScreen
 *     ├─ Finance (stack)
 *     │    ├─ FinanceScreen
 *     │    ├─ TransactionsScreen
 *     │    └─ AccountsScreen
 *     ├─ Reminders (stack)
 *     │    ├─ ReminderDashboardScreen
 *     │    ├─ ExpenseReminderScreen
 *     │    ├─ MedicineReminderScreen
 *     │    └─ GroceryReminderScreen
 *     └─ BuyList (stack)
 *          └─ BuyListScreen
 *
 *   Root Stack wraps MainTabs and adds:
 *     └─ AdminScreen (modal)
 *
 * Screens that haven't been created yet are stubbed with a placeholder
 * so navigation wiring is complete and the app doesn't crash at runtime.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAppContext } from '../state/AppContext';
import { getTheme } from '../constants/colors';

// ─── Screen imports ───────────────────────────────────────────────────────────

import LoginScreen from '../screens/auth/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';

// Lazy-require real screens if they exist; otherwise fall through to stubs.
// This pattern lets you add each screen file independently without breaking the nav.
let FinanceScreen = null;
let TransactionsScreen = null;
let AccountsScreen = null;
let ReminderDashboardScreen = null;
let ExpenseReminderScreen = null;
let MedicineReminderScreen = null;
let GroceryReminderScreen = null;
let BuyListScreen = null;
let AdminScreen = null;

try { FinanceScreen = require('../screens/finance/FinanceScreen').default; } catch (_) {
  try { FinanceScreen = require('../screens/FinanceScreen').default; } catch (__) {}
}
try { TransactionsScreen = require('../screens/finance/TransactionsScreen').default; } catch (_) {
  try { TransactionsScreen = require('../screens/TransactionsScreen').default; } catch (__) {}
}
try { AccountsScreen = require('../screens/finance/AccountsScreen').default; } catch (_) {
  try { AccountsScreen = require('../screens/AccountsScreen').default; } catch (__) {}
}
try { ReminderDashboardScreen = require('../screens/reminders/ReminderDashboardScreen').default; } catch (_) {
  try { ReminderDashboardScreen = require('../screens/ReminderDashboardScreen').default; } catch (__) {}
}
try { ExpenseReminderScreen = require('../screens/reminders/ExpenseReminderScreen').default; } catch (_) {
  try { ExpenseReminderScreen = require('../screens/ExpenseReminderScreen').default; } catch (__) {}
}
try { MedicineReminderScreen = require('../screens/reminders/MedicineReminderScreen').default; } catch (_) {
  try { MedicineReminderScreen = require('../screens/MedicineReminderScreen').default; } catch (__) {}
}
try { GroceryReminderScreen = require('../screens/reminders/GroceryReminderScreen').default; } catch (_) {
  try { GroceryReminderScreen = require('../screens/GroceryReminderScreen').default; } catch (__) {}
}
try { BuyListScreen = require('../screens/buylist/BuyListScreen').default; } catch (_) {
  try { BuyListScreen = require('../screens/BuyListScreen').default; } catch (__) {}
}
try { AdminScreen = require('../screens/admin/AdminScreen').default; } catch (_) {
  try { AdminScreen = require('../screens/AdminScreen').default; } catch (__) {}
}

// ─── Placeholder screen (used for unbuilt screens) ───────────────────────────

function PlaceholderScreen({ route }) {
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.emoji}>🚧</Text>
      <Text style={placeholderStyles.title}>{route.name}</Text>
      <Text style={placeholderStyles.sub}>This screen is coming soon.</Text>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F6F8',
    padding: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: '#8A8A8E',
    textAlign: 'center',
  },
});

// ─── Stack / Tab factories ────────────────────────────────────────────────────

const AuthStack = createStackNavigator();
const RootStack = createStackNavigator();
const Tab = createBottomTabNavigator();
const DashboardStack = createStackNavigator();
const FinanceStack = createStackNavigator();
const RemindersStack = createStackNavigator();
const BuyListStack = createStackNavigator();

// ─── Shared header options factory ───────────────────────────────────────────

function headerOptions(theme) {
  return {
    headerStyle: { backgroundColor: theme.headerBg },
    headerTintColor: theme.headerText,
    headerTitleStyle: { fontWeight: '700', fontSize: 17 },
    headerBackTitleVisible: false,
  };
}

// ─── Auth flow ────────────────────────────────────────────────────────────────

function AuthNavigator({ theme }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

// ─── Tab stacks ───────────────────────────────────────────────────────────────

function DashboardNavigator({ theme }) {
  return (
    <DashboardStack.Navigator screenOptions={headerOptions(theme)}>
      <DashboardStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ headerShown: false }} // custom top bar in DashboardScreen
      />
    </DashboardStack.Navigator>
  );
}

function FinanceNavigator({ theme }) {
  return (
    <FinanceStack.Navigator screenOptions={headerOptions(theme)}>
      <FinanceStack.Screen
        name="FinanceHome"
        component={FinanceScreen ?? PlaceholderScreen}
        options={{ title: 'Finance' }}
      />
      <FinanceStack.Screen
        name="Transactions"
        component={TransactionsScreen ?? PlaceholderScreen}
        options={{ title: 'Transactions' }}
      />
      <FinanceStack.Screen
        name="Accounts"
        component={AccountsScreen ?? PlaceholderScreen}
        options={{ title: 'Accounts' }}
      />
    </FinanceStack.Navigator>
  );
}

function RemindersNavigator({ theme }) {
  return (
    <RemindersStack.Navigator screenOptions={headerOptions(theme)}>
      <RemindersStack.Screen
        name="ReminderDashboard"
        component={ReminderDashboardScreen ?? PlaceholderScreen}
        options={{ title: 'Reminders' }}
      />
      <RemindersStack.Screen
        name="ExpenseReminder"
        component={ExpenseReminderScreen ?? PlaceholderScreen}
        options={{ title: 'Bill Reminders' }}
      />
      <RemindersStack.Screen
        name="MedicineReminder"
        component={MedicineReminderScreen ?? PlaceholderScreen}
        options={{ title: 'Medicine Reminders' }}
      />
      <RemindersStack.Screen
        name="GroceryReminder"
        component={GroceryReminderScreen ?? PlaceholderScreen}
        options={{ title: 'Grocery Reminders' }}
      />
    </RemindersStack.Navigator>
  );
}

function BuyListNavigator({ theme }) {
  return (
    <BuyListStack.Navigator screenOptions={headerOptions(theme)}>
      <BuyListStack.Screen
        name="BuyListHome"
        component={BuyListScreen ?? PlaceholderScreen}
        options={{ title: 'List to Buy' }}
      />
    </BuyListStack.Navigator>
  );
}

// ─── Tab icon helper ──────────────────────────────────────────────────────────

function tabIcon(routeName, focused) {
  const MAP = {
    Dashboard: focused ? 'home' : 'home-outline',
    Finance: focused ? 'wallet' : 'wallet-outline',
    Reminders: focused ? 'notifications' : 'notifications-outline',
    BuyList: focused ? 'list' : 'list-outline',
  };
  return MAP[routeName] ?? 'ellipse-outline';
}

// ─── Main tabs ────────────────────────────────────────────────────────────────

function MainTabs({ theme }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.line,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={tabIcon(route.name, focused)} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen
        name="Dashboard"
        options={{ tabBarLabel: 'Dashboard' }}
      >
        {() => <DashboardNavigator theme={theme} />}
      </Tab.Screen>

      <Tab.Screen
        name="Finance"
        options={{ tabBarLabel: 'Finance' }}
      >
        {() => <FinanceNavigator theme={theme} />}
      </Tab.Screen>

      <Tab.Screen
        name="Reminders"
        options={{ tabBarLabel: 'Reminders' }}
      >
        {() => <RemindersNavigator theme={theme} />}
      </Tab.Screen>

      <Tab.Screen
        name="BuyList"
        options={{ tabBarLabel: 'Buy List' }}
      >
        {() => <BuyListNavigator theme={theme} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ─── Root navigator (exported) ────────────────────────────────────────────────

export default function AppNavigator() {
  const { user, config } = useAppContext();
  const theme = getTheme(config?.theme ?? 'yellow');

  if (!user) {
    return <AuthNavigator theme={theme} />;
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main tab navigator */}
      <RootStack.Screen name="MainTabs">
        {() => <MainTabs theme={theme} />}
      </RootStack.Screen>

      {/* Admin screen — presented modally from anywhere */}
      <RootStack.Screen
        name="Admin"
        component={AdminScreen ?? PlaceholderScreen}
        options={{
          headerShown: true,
          ...headerOptions(theme),
          title: 'Settings',
          presentation: 'modal',
        }}
      />
    </RootStack.Navigator>
  );
}
