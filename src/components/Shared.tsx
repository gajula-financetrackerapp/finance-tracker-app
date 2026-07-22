import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFinance } from '../FinanceContext';
import { theme } from '../theme';

export function AuthModal() {
  const { showAuth, setShowAuth, authMode, setAuthMode, signIn, signUp } = useFinance();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const title = authMode === 'login' ? 'Welcome back' : 'Create account';
  const subtitle =
    authMode === 'login'
      ? 'Log in to save your transactions'
      : 'Sign up to keep your money data safely on this device';

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setBusy(true);
    try {
      if (authMode === 'login') {
        const err = await signIn(email.trim(), password);
        if (err) setError(err);
      } else {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          return;
        }
        const err = await signUp(name.trim() || email.split('@')[0], email.trim(), password);
        if (err) setError(err);
        else setInfo('Account created. You can now save data.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={showAuth} animationType="slide" transparent onRequestClose={() => setShowAuth(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>

          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, authMode === 'login' && styles.tabOn]}
              onPress={() => {
                setAuthMode('login');
                setError(null);
              }}
            >
              <Text style={styles.tabText}>Login</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, authMode === 'signup' && styles.tabOn]}
              onPress={() => {
                setAuthMode('signup');
                setError(null);
              }}
            >
              <Text style={styles.tabText}>Sign up</Text>
            </Pressable>
          </View>

          {authMode === 'signup' ? (
            <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
          ) : null}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@email.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Pressable style={styles.primary} onPress={submit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{authMode === 'login' ? 'Login' : 'Create account'}</Text>
            )}
          </Pressable>
          <Pressable style={styles.cancel} onPress={() => setShowAuth(false)}>
            <Text style={styles.cancelText}>Continue as guest</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function GuestBanner() {
  const { isGuest, setShowAuth, setAuthMode } = useFinance();
  if (!isGuest) return null;
  return (
    <Pressable
      style={styles.banner}
      onPress={() => {
        setAuthMode('signup');
        setShowAuth(true);
      }}
    >
      <Text style={styles.bannerText}>Guest mode · Sign up to save changes</Text>
    </Pressable>
  );
}

export function Donut({
  value,
  total,
  color,
  size = 120,
}: {
  value: number;
  total: number;
  color: string;
  size?: number;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  // Simple CSS-like ring using borders (no heavy chart lib)
  const ring = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: 14,
      borderColor: theme.track,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderTopColor: pct > 0.02 ? color : theme.track,
      borderRightColor: pct > 0.25 ? color : theme.track,
      borderBottomColor: pct > 0.5 ? color : theme.track,
      borderLeftColor: pct > 0.75 ? color : theme.track,
      transform: [{ rotate: '-45deg' }],
    }),
    [pct, color, size],
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={ring}>
        <Text style={{ transform: [{ rotate: '45deg' }], fontWeight: '800', fontSize: 18, color: theme.ink }}>
          {Math.round(value).toLocaleString('en-IN')}
        </Text>
      </View>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={theme.muted} {...rest} style={[styles.input, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    paddingBottom: 34,
  },
  title: { fontSize: 24, fontWeight: '800', color: theme.ink },
  sub: { color: theme.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: theme.header,
    marginBottom: 14,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.card },
  tabOn: { backgroundColor: theme.accentSoft },
  tabText: { fontWeight: '700', color: theme.ink },
  label: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.ink,
    backgroundColor: theme.bg,
  },
  primary: {
    backgroundColor: theme.header,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: theme.muted, fontWeight: '700' },
  error: { color: theme.red, marginBottom: 8, fontWeight: '600' },
  info: { color: theme.green, marginBottom: 8, fontWeight: '600' },
  banner: {
    backgroundColor: theme.accentSoft,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
  },
  bannerText: { color: theme.header, fontWeight: '700', fontSize: 12.5, textAlign: 'center' },
});
