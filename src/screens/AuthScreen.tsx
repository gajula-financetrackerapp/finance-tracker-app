import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';

const COLORS = {
  primary: '#FFCD3C',
  primaryDark: '#F5B700',
  bg: '#F6F6F8',
  card: '#FFFFFF',
  ink: '#1A1A1A',
  muted: '#8A8A8E',
  line: '#ECECEE',
  red: '#D64545',
};

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const { signIn, signUp, signInWithGitHub, configured } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!configured) {
      setError('Add your Supabase URL and anon key in .env first.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      const err =
        mode === 'login'
          ? await signIn(email.trim(), password)
          : await signUp(fullName.trim() || email.split('@')[0], email.trim(), password);
      if (err) setError(err);
      else if (mode === 'signup') {
        setInfo('Account created. If email confirmation is enabled in Supabase, check your inbox, then log in.');
        setMode('login');
      }
    } finally {
      setBusy(false);
    }
  };

  const onGitHub = async () => {
    setError(null);
    setInfo(null);
    if (!configured) {
      setError('Add your Supabase URL and anon key in .env first.');
      return;
    }
    setBusy(true);
    try {
      const err = await signInWithGitHub();
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <View style={styles.logo}>
            <Text style={{ fontSize: 22 }}>💠</Text>
          </View>
          <Text style={styles.brand}>Finance Tracker</Text>
        </View>

        <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text>
        <Text style={styles.sub}>
          {mode === 'login'
            ? 'Sign in to open your dashboard'
            : 'Sign up to start tracking money and reminders'}
        </Text>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => {
                setMode('login');
                setError(null);
                setInfo(null);
              }}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Login</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => {
                setMode('signup');
                setError(null);
                setInfo(null);
              }}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign up</Text>
            </Pressable>
          </View>

          {mode === 'signup' ? (
            <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your name" />
          ) : null}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.primaryText}>{mode === 'login' ? 'Login' : 'Create account'}</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.or}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Pressable style={styles.outlineBtn} onPress={onGitHub} disabled={busy}>
            <Text style={styles.outlineText}>Continue with GitHub</Text>
          </Pressable>

          <Text style={styles.hint}>
            Admins can open the ⚙ Admin panel inside the app. Promote a user in Supabase:{'\n'}
            <Text style={styles.code}>update profiles set role='admin' where email='...'</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...props
}: {
  label: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={COLORS.muted}
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 20, fontWeight: '800', color: COLORS.ink },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.ink, marginBottom: 6 },
  sub: { color: COLORS.muted, marginBottom: 22, fontSize: 15, lineHeight: 21 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  tabs: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.card },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontWeight: '700', color: COLORS.ink },
  tabTextActive: { color: COLORS.ink },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.ink,
    backgroundColor: COLORS.card,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.ink,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: COLORS.primary, fontWeight: '800', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  outlineText: { color: COLORS.ink, fontWeight: '800', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.line },
  or: { color: COLORS.muted, fontWeight: '700', fontSize: 12 },
  error: { color: COLORS.red, marginBottom: 8, fontWeight: '600' },
  info: { color: '#1f6b3c', marginBottom: 8, fontWeight: '600' },
  hint: { marginTop: 16, color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  code: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), color: COLORS.ink },
});
