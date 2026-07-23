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
import { formatAmountDigits } from '../utils';
import { BottomSheet } from './BottomSheet';

/** Styled chooser shown when a guest tries to add/change data. */
export function SignInRequiredModal() {
  const {
    showAuthGate,
    setShowAuthGate,
    authGateLabel,
    setAuthMode,
    setShowAuth,
  } = useFinance();

  const openAuth = (mode: 'login' | 'signup') => {
    setShowAuthGate(false);
    setAuthMode(mode);
    setShowAuth(true);
  };

  return (
    <Modal
      visible={showAuthGate}
      transparent
      animationType="fade"
      onRequestClose={() => setShowAuthGate(false)}
    >
      <Pressable style={gateStyles.backdrop} onPress={() => setShowAuthGate(false)}>
        <Pressable style={gateStyles.card} onPress={(e) => e.stopPropagation()}>
          <View style={gateStyles.iconWrap}>
            <Text style={gateStyles.icon}>🔐</Text>
          </View>
          <Text style={gateStyles.title}>Sign in required</Text>
          <Text style={gateStyles.body}>
            Log in or sign up to {authGateLabel}. Guests can browse, but can’t add or change data.
          </Text>

          <Pressable style={gateStyles.primary} onPress={() => openAuth('login')}>
            <Text style={gateStyles.primaryText}>Login</Text>
          </Pressable>
          <Pressable style={gateStyles.secondary} onPress={() => openAuth('signup')}>
            <Text style={gateStyles.secondaryText}>Create account</Text>
          </Pressable>
          <Pressable style={gateStyles.ghost} onPress={() => setShowAuthGate(false)}>
            <Text style={gateStyles.ghostText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
      : 'Sign up to keep your money data safely synced to your account';

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
    <BottomSheet visible={showAuth} onClose={() => setShowAuth(false)}>
      <View style={styles.authHeader}>
        <View style={styles.authBadge}>
          <Text style={styles.authBadgeText}>Pulse Wallet</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, authMode === 'login' && styles.tabOn]}
          onPress={() => {
            setAuthMode('login');
            setError(null);
          }}
        >
          <Text style={[styles.tabText, authMode === 'login' && styles.tabTextOn]}>Login</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, authMode === 'signup' && styles.tabOn]}
          onPress={() => {
            setAuthMode('signup');
            setError(null);
          }}
        >
          <Text style={[styles.tabText, authMode === 'signup' && styles.tabTextOn]}>Sign up</Text>
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
    </BottomSheet>
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
      <Text style={styles.bannerText}>Guest mode · Sign in to add or save data</Text>
    </Pressable>
  );
}

export function Donut({
  value,
  total,
  color,
  size = 120,
  currencyCode = 'INR',
}: {
  value: number;
  total: number;
  color: string;
  size?: number;
  currencyCode?: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
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
          {formatAmountDigits(Math.round(value), currencyCode, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
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

const gateStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 61, 62, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    shadowColor: '#0F3D3E',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  icon: { fontSize: 26 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.ink,
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    marginBottom: 20,
    color: theme.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  primary: {
    backgroundColor: theme.header,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondary: {
    backgroundColor: theme.accentSoft,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: theme.accent + '55',
  },
  secondaryText: { color: theme.header, fontWeight: '800', fontSize: 16 },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  ghostText: { color: theme.muted, fontWeight: '700', fontSize: 14 },
});

const styles = StyleSheet.create({
  authHeader: { marginBottom: 4 },
  authBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  authBadgeText: { color: theme.header, fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  title: { fontSize: 24, fontWeight: '800', color: theme.ink },
  sub: { color: theme.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: theme.line,
    marginBottom: 14,
    backgroundColor: theme.bg,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: theme.header },
  tabText: { fontWeight: '700', color: theme.muted },
  tabTextOn: { color: '#fff' },
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
    backgroundColor: theme.header,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 12.5, textAlign: 'center' },
});
