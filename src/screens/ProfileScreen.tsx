import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFinance } from '../FinanceContext';
import { theme } from '../theme';
import { GuestBanner } from '../components/Shared';

export function ProfileScreen() {
  const {
    isGuest,
    isAdmin,
    session,
    setShowAuth,
    setAuthMode,
    signOut,
  } = useFinance();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <GuestBanner />

      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 28 }}>{isGuest ? '👤' : '✅'}</Text>
          </View>
          <Text style={styles.name}>
            {isGuest ? 'Guest explorer' : session?.user?.email || 'Signed in'}
          </Text>
          <Text style={styles.sub}>
            {isGuest
              ? 'Browse everything freely. Sign up only when you want to save.'
              : isAdmin
                ? 'Admin account'
                : 'Signed in · saves enabled'}
          </Text>
        </View>

        {isGuest ? (
          <>
            <Pressable
              style={styles.primary}
              onPress={() => {
                setAuthMode('signup');
                setShowAuth(true);
              }}
            >
              <Text style={styles.primaryText}>Sign up to save data</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => {
                setAuthMode('login');
                setShowAuth(true);
              }}
            >
              <Text style={styles.secondaryText}>Already have an account? Login</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.secondary} onPress={signOut}>
            <Text style={[styles.secondaryText, { color: theme.red }]}>Logout</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { backgroundColor: theme.header, paddingVertical: 16, alignItems: 'center' },
  title: { color: '#fff', fontWeight: '800', fontSize: 18 },
  body: { padding: 16 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.line,
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: { fontWeight: '800', fontSize: 18, color: theme.ink },
  sub: { color: theme.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  primary: {
    backgroundColor: theme.header,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: {
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.card,
  },
  secondaryText: { color: theme.ink, fontWeight: '700' },
});
