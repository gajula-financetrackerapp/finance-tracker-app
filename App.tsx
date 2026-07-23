import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/context/AppContext';
import { FinanceProvider, useFinance } from './src/FinanceContext';
import { AlarmProvider } from './src/alarms/AlarmContext';
import { AlarmBanner } from './src/components/AlarmBanner';
import { AppNavigator } from './src/navigation/AppNavigator';

function BootGate({ children }: { children: React.ReactNode }) {
  const { ready, theme } = useApp();
  if (!ready) {
    return (
      <View style={[styles.boot, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ color: theme.muted, fontWeight: '700', marginTop: 12 }}>
          Loading Pulse Wallet…
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}

function AdminLockSync() {
  const { isAdmin } = useFinance();
  const { setAdminAuthed } = useApp();
  useEffect(() => {
    if (!isAdmin) setAdminAuthed(false);
  }, [isAdmin, setAdminAuthed]);
  return null;
}

function ThemedShell({ children }: { children: React.ReactNode }) {
  const { theme } = useApp();
  // Don't pad top here — stack headers / workspace / profile apply insets once.
  // Double top SafeArea was pulling App Settings & Admin upward on open.
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style="light" backgroundColor={theme.header} />
      {children}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FinanceProvider>
        <AppProvider>
          <ThemedShell>
            <BootGate>
              <AlarmProvider>
                <AdminLockSync />
                <AppNavigator />
                <AlarmBanner />
              </AlarmProvider>
            </BootGate>
          </ThemedShell>
        </AppProvider>
      </FinanceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
