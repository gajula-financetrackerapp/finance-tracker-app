/**
 * App.js — Root entry point
 *
 * - Wraps everything in AppProvider
 * - Requests notification permissions on mount
 * - Sets up a foreground notification handler
 * - Conditionally renders AuthStack or MainStack based on auth state
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { AppProvider, useAppContext } from './src/state/AppContext';
import { requestPermissions } from './src/services/notifications';
import { getTheme } from './src/constants/colors';
import AppNavigator from './src/navigation/AppNavigator';

// ─── Notification handler (foreground) ───────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Splash / Loading Screen ──────────────────────────────────────────────────

function SplashScreen({ theme }) {
  return (
    <View style={[styles.splash, { backgroundColor: theme.primary }]}>
      <View style={[styles.splashLogoBox, { backgroundColor: theme.card }]}>
        <Text style={styles.splashEmoji}>💠</Text>
      </View>
      <Text style={[styles.splashTitle, { color: theme.ink }]}>Finance Tracker</Text>
      <ActivityIndicator
        size="large"
        color={theme.ink}
        style={styles.splashSpinner}
      />
    </View>
  );
}

// ─── Root with auth-aware rendering ──────────────────────────────────────────

function Root() {
  const { authLoading, config } = useAppContext();
  const theme = getTheme(config?.theme ?? 'yellow');

  // Request notification permissions once on mount
  useEffect(() => {
    requestPermissions().catch(() => {});
  }, []);

  // Forward notification responses (taps) — handled globally here
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        // Future: deep-link to the relevant screen based on response.notification.request.content.data
        console.log('[App] Notification tapped:', response.notification.request.content.data);
      }
    );
    return () => sub.remove();
  }, []);

  if (authLoading) {
    return <SplashScreen theme={theme} />;
  }

  return (
    <>
      <StatusBar style={theme.statusBar} />
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

// ─── App export ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogoBox: {
    width: 88,
    height: 88,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 16,
  },
  splashEmoji: {
    fontSize: 44,
  },
  splashTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 24,
  },
  splashSpinner: {
    marginTop: 8,
  },
});
