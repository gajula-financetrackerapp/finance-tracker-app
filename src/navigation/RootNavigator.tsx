import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { RootStackParamList } from './types';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FinanceScreen } from '../screens/FinanceScreen';
import { ReminderHubScreen } from '../screens/ReminderScreens';
import {
  ExpenseReminderScreen,
  MedicineReminderScreen,
  GroceryReminderScreen,
  GeneralReminderScreen,
} from '../screens/MoreScreens';
import { AdminScreen, ShoppingListScreen } from '../screens/ShoppingAdminScreens';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AuthModal, SignInRequiredModal } from '../components/Shared';
import { AppDialogHost } from '../components/AppDialog';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { theme, config } = useApp();

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.bg,
      card: theme.card,
      text: theme.ink,
      border: theme.line,
      primary: theme.primaryDark,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.primaryDark },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ headerShown: false, title: config.appName }}
        />
        <Stack.Screen name="Finance" component={FinanceScreen} options={{ title: 'Personal Finance' }} />
        <Stack.Screen name="ReminderHub" component={ReminderHubScreen} options={{ title: 'Reminders' }} />
        <Stack.Screen name="ExpenseReminder" component={ExpenseReminderScreen} options={{ title: 'Expense Reminder' }} />
        <Stack.Screen name="MedicineReminder" component={MedicineReminderScreen} options={{ title: 'Medicine Reminder' }} />
        <Stack.Screen name="GroceryReminder" component={GroceryReminderScreen} options={{ title: 'Grocery Expiry' }} />
        <Stack.Screen name="GeneralReminder" component={GeneralReminderScreen} options={{ title: 'General Reminder' }} />
        <Stack.Screen name="ShoppingList" component={ShoppingListScreen} options={{ title: 'Shopping List' }} />
        <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Stack.Navigator>
      <AppDialogHost />
      <SignInRequiredModal />
      <AuthModal />
    </NavigationContainer>
  );
}
