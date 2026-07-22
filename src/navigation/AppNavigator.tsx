import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';
import { theme as pulse } from '../theme';
import { AuthModal } from '../components/Shared';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';
import { HomeScreen, AddModal } from '../screens/HomeScreen';
import { ChartsScreen } from '../screens/ChartsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { TxnListScreen } from '../screens/TxnListScreen';
import { ReminderHubScreen } from '../screens/ReminderScreens';
import {
  ExpenseReminderScreen,
  MedicineReminderScreen,
  GroceryReminderScreen,
  GeneralReminderScreen,
} from '../screens/MoreScreens';
import { AdminScreen, ShoppingListScreen } from '../screens/ShoppingAdminScreens';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '⌂',
    Charts: '◉',
    Budget: '☰',
    Profile: '☺',
  };
  return (
    <Text
      style={{
        fontSize: 18,
        color: focused ? pulse.accent : pulse.muted,
        fontWeight: focused ? '800' : '500',
      }}
    >
      {icons[label] || '•'}
    </Text>
  );
}

function EmptyAdd() {
  return <View style={{ flex: 1 }} />;
}

function MainTabs() {
  const { setShowAdd } = useFinance();
  const insets = useSafeAreaInsets();
  // Keep tabs above Android 3-button nav / iPhone home indicator
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 56 + bottomPad;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: pulse.accent,
        tabBarInactiveTintColor: pulse.muted,
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 6,
          borderTopColor: pulse.line,
          backgroundColor: pulse.card,
        },
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Charts"
        component={ChartsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Charts" focused={focused} /> }}
      />
      <Tab.Screen
        name="Add"
        component={EmptyAdd}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={[styles.fabWrap, { top: -18 - Math.min(bottomPad, 12) }]}>
              <View style={styles.fab}>
                <Text style={styles.fabText}>+</Text>
              </View>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            setShowAdd(true);
          },
        }}
      />
      <Tab.Screen
        name="Budget"
        component={ReportsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Budget" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

/** Top workspace switcher + Finance (default) / Reminders / Buy list */
function MainShell() {
  const { workspace } = useWorkspace();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.shell}>
      <WorkspaceSwitcher />
      <View style={[styles.shellBody, workspace !== 'finance' && { paddingBottom: insets.bottom }]}>
        {workspace === 'finance' ? <MainTabs /> : null}
        {workspace === 'reminders' ? <ReminderHubScreen /> : null}
        {workspace === 'shopping' ? <ShoppingListScreen /> : null}
      </View>
    </View>
  );
}

export function AppNavigator() {
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
    <WorkspaceProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: pulse.header },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '800' },
            contentStyle: { backgroundColor: pulse.bg },
          }}
        >
          <Stack.Screen
            name="Dashboard"
            component={MainShell}
            options={{ headerShown: false, title: config.appName }}
          />
          <Stack.Screen
            name="Calendar"
            component={CalendarScreen}
            options={{
              title: 'Calendar',
              headerShadowVisible: false,
              contentStyle: { backgroundColor: '#fff' },
            }}
          />
          <Stack.Screen
            name="TxnList"
            component={TxnListScreen}
            options={({ route }) => ({
              title: route.params.kind === 'expense' ? 'Expenses' : 'Income',
            })}
          />
          <Stack.Screen name="ReminderHub" component={ReminderHubScreen} options={{ title: 'Reminders' }} />
          <Stack.Screen name="ExpenseReminder" component={ExpenseReminderScreen} options={{ title: 'Expense Reminder' }} />
          <Stack.Screen name="MedicineReminder" component={MedicineReminderScreen} options={{ title: 'Medicine Reminder' }} />
          <Stack.Screen name="GroceryReminder" component={GroceryReminderScreen} options={{ title: 'Grocery Expiry' }} />
          <Stack.Screen name="GeneralReminder" component={GeneralReminderScreen} options={{ title: 'General Reminder' }} />
          <Stack.Screen name="ShoppingList" component={ShoppingListScreen} options={{ title: 'Shopping List' }} />
          <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin Settings' }} />
        </Stack.Navigator>
        <AuthModal />
        <AddModal />
      </NavigationContainer>
    </WorkspaceProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: pulse.bg },
  shellBody: { flex: 1 },
  tabLabel: { fontSize: 11, fontWeight: '700' },
  fabWrap: {
    position: 'absolute',
    top: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: pulse.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '600', marginTop: -2 },
});
