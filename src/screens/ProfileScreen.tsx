import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFinance } from '../FinanceContext';
import { theme } from '../theme';
import { GuestBanner } from '../components/Shared';
import { RootStackParamList } from '../navigation/types';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isGuest, isAdmin, session, setShowAuth, setAuthMode, signOut } = useFinance();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <GuestBanner />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 28 }}>{isGuest ? '👤' : isAdmin ? '🛡' : '✅'}</Text>
          </View>
          <Text style={styles.name}>
            {isGuest ? 'Guest explorer' : session?.user?.email || 'Signed in'}
          </Text>
          <Text style={styles.sub}>
            {isGuest
              ? 'Browse the dashboard freely. Sign up only when you want to save.'
              : isAdmin
                ? 'Admin account · can edit app settings'
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

        {isAdmin ? (
          <>
            <Text style={styles.section}>Admin</Text>
            <Pressable style={styles.toolRow} onPress={() => navigation.navigate('Admin')}>
              <Text style={styles.toolIcon}>⚙</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>Admin settings</Text>
                <Text style={styles.toolSub}>Theme, features and backups</Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { backgroundColor: theme.header, paddingVertical: 16, alignItems: 'center' },
  title: { color: '#fff', fontWeight: '800', fontSize: 18 },
  body: { padding: 16, paddingBottom: 110 },
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
    marginBottom: 8,
  },
  secondaryText: { color: theme.ink, fontWeight: '700' },
  section: {
    marginTop: 18,
    marginBottom: 10,
    color: theme.muted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.line,
    gap: 12,
  },
  toolIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  toolTitle: { fontWeight: '800', color: theme.ink },
  toolSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  chev: { color: theme.muted, fontSize: 22, fontWeight: '700' },
});
