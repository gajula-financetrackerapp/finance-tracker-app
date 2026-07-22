import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FinanceProvider, useFinance } from './src/FinanceContext';
import { AuthModal } from './src/components/Shared';
import { HomeScreen, AddModal } from './src/screens/HomeScreen';
import { ChartsScreen } from './src/screens/ChartsScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { theme } from './src/theme';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '⌂',
    Charts: '◉',
    Reports: '☰',
    Profile: '☺',
  };
  return (
    <Text style={{ fontSize: 18, color: focused ? theme.accent : theme.muted, fontWeight: focused ? '800' : '500' }}>
      {icons[label] || '•'}
    </Text>
  );
}

function EmptyAdd() {
  return <View style={{ flex: 1 }} />;
}

function AppTabs() {
  const { ready, setShowAdd } = useFinance();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.bootText}>Loading Pulse Wallet…</Text>
      </View>
    );
  }

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Charts"
          component={ChartsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="Charts" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Add"
          component={EmptyAdd}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View style={styles.fabWrap}>
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
          name="Reports"
          component={ReportsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="Reports" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} />,
          }}
        />
      </Tab.Navigator>
      <AuthModal />
      <AddModal />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FinanceProvider>
        <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />
          <NavigationContainer>
            <AppTabs />
          </NavigationContainer>
        </SafeAreaView>
      </FinanceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.header },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
    gap: 12,
  },
  bootText: { color: theme.muted, fontWeight: '700' },
  tabBar: {
    height: 68,
    paddingBottom: 8,
    paddingTop: 6,
    borderTopColor: theme.line,
    backgroundColor: theme.card,
  },
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
    backgroundColor: theme.accent,
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
