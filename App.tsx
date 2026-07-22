import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/context/AppContext';
import { FinanceProvider, useFinance } from './src/FinanceContext';
import { AppNavigator } from './src/navigation/AppNavigator';

function BootGate({ children }: { children: React.ReactNode }) {
  const { ready, theme } = useApp();
  if (!ready) {
    return (
      <View style={[styles.boot, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ color: theme.muted, fontWeight: '700', marginTop: 12 }}>Loading Pulse Wallet…</Text>
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

export default function App() {
  return (
    <SafeAreaProvider>
      <FinanceProvider>
        <AppProvider>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <StatusBar style="light" />
            <BootGate>
              <AdminLockSync />
              <AppNavigator />
            </BootGate>
          </SafeAreaView>
        </AppProvider>
      </FinanceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F3D3E' },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
