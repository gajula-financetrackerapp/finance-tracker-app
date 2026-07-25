import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import type { RootStackParamList } from '../navigation/types';
import { formatAmountDigits } from '../utils';
import { BottomSheet } from './BottomSheet';
import type { OAuthProvider } from '../lib/oauthSignIn';

/** Styled chooser shown when a guest tries to add/change data. */
export function SignInRequiredModal() {
  const { theme } = useApp();
  const gateStyles = useMemo(() => makeGateStyles(theme), [theme]);
  const {
    showAuthGate,
    setShowAuthGate,
    authGateLabel,
    setAuthMode,
    setShowAuth,
  } = useFinance();

  const openAuth = () => {
    setShowAuthGate(false);
    setAuthMode('login');
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
            Sign in with Google or Apple to {authGateLabel}. Guests can browse, but can’t add or
            change data.
          </Text>

          <Pressable style={gateStyles.primary} onPress={openAuth}>
            <Text style={gateStyles.primaryText}>Sign in</Text>
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
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showAuth, setShowAuth, signInWithOAuth } = useFinance();
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openLegal = (kind: 'terms' | 'privacy') => {
    setShowAuth(false);
    navigation.navigate('LegalDocument', { kind });
  };

  const onOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setBusy(true);
    setBusyProvider(provider);
    try {
      const err = await signInWithOAuth(provider);
      if (err) setError(err);
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  return (
    <BottomSheet
      visible={showAuth}
      onClose={() => {
        setShowAuth(false);
        setError(null);
      }}
    >
      <View style={styles.authHeader}>
        <View style={styles.authBadge}>
          <Text style={styles.authBadgeText}>Pulse Wallet</Text>
        </View>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.sub}>
          Continue with Google or Apple — no email verification step needed.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.oauthBtn, styles.oauthGoogle]}
        onPress={() => {
          if (!busy) void onOAuth('google');
        }}
        disabled={busy}
      >
        {busyProvider === 'google' ? (
          <ActivityIndicator color={theme.ink} />
        ) : (
          <>
            <GoogleMark />
            <Text style={styles.oauthText}>Sign In With Google</Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={styles.oauthBtn}
        onPress={() => {
          if (!busy) void onOAuth('apple');
        }}
        disabled={busy}
      >
        {busyProvider === 'apple' ? (
          <ActivityIndicator color={theme.ink} />
        ) : (
          <>
            <AppleMark color={theme.ink} />
            <Text style={styles.oauthText}>Sign In With Apple</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.legalNote}>
        By logging in, you agree to the User Agreement and Privacy Policy
      </Text>
      <View style={styles.legalRow}>
        <Pressable onPress={() => openLegal('terms')} hitSlop={8}>
          <Text style={[styles.legalLink, { color: theme.header }]}>Terms of Use</Text>
        </Pressable>
        <Pressable onPress={() => openLegal('privacy')} hitSlop={8}>
          <Text style={[styles.legalLink, { color: theme.header }]}>Privacy Policy</Text>
        </Pressable>
      </View>

      <Pressable style={styles.cancel} onPress={() => setShowAuth(false)}>
        <Text style={styles.cancelText}>Continue as guest</Text>
      </Pressable>
    </BottomSheet>
  );
}

function GoogleMark() {
  return (
    <View style={googleMarkStyles.wrap}>
      <Text style={googleMarkStyles.g}>G</Text>
    </View>
  );
}

function AppleMark({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        fill={color}
        d="M16.365 1.43c0 1.14-.43 2.18-1.17 2.98-.79.86-2.1 1.52-3.2 1.43-.13-1.1.42-2.25 1.14-3.04.8-.88 2.2-1.52 3.23-1.37zM20.9 17.4c-.57 1.3-.84 1.88-1.57 3.03-1.02 1.58-2.46 3.55-4.25 3.57-1.58.02-2-.98-4.16-.97-2.16.01-2.63.99-4.21.97-1.79-.02-3.16-1.8-4.18-3.37C.8 17.84-.4 12.9 1.5 9.58c1.1-1.94 2.84-3.17 4.48-3.17 1.67 0 2.72 1.03 4.1 1.03 1.34 0 2.16-1.04 4.1-1.04 1.46 0 3.01.99 4.1 2.7-3.6 1.97-3.02 7.1.62 8.3z"
      />
    </Svg>
  );
}

const googleMarkStyles = StyleSheet.create({
  wrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  g: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4285F4',
    ...Platform.select({
      ios: { fontFamily: 'System' },
      default: {},
    }),
  },
});

export function GuestBanner() {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { isGuest, setShowAuth, setAuthMode } = useFinance();
  if (!isGuest) return null;
  return (
    <Pressable
      style={styles.banner}
      onPress={() => {
        setAuthMode('login');
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
  const { theme } = useApp();
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
    [pct, color, size, theme],
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={ring}>
        <Text
          style={{
            transform: [{ rotate: '45deg' }],
            fontWeight: '800',
            fontSize: 18,
            color: theme.ink,
          }}
        >
          {formatAmountDigits(Math.round(value), currencyCode, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </Text>
      </View>
    </View>
  );
}

function makeGateStyles(theme: ThemeTokens) {
  return StyleSheet.create({
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
    ghost: { alignItems: 'center', paddingVertical: 12 },
    ghostText: { color: theme.muted, fontWeight: '700', fontSize: 14 },
  });
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
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
    oauthBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: theme.bg,
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 18,
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: theme.line,
    },
    oauthGoogle: {
      shadowColor: '#4285F4',
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    oauthText: { color: theme.ink, fontWeight: '700', fontSize: 15 },
    legalNote: {
      marginTop: 8,
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 22,
      marginTop: 8,
      marginBottom: 6,
    },
    legalLink: { fontWeight: '700', fontSize: 13 },
    cancel: { alignItems: 'center', paddingVertical: 14 },
    cancelText: { color: theme.muted, fontWeight: '700' },
    error: { color: theme.red, marginBottom: 8, fontWeight: '600' },
    banner: {
      backgroundColor: theme.header,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    bannerText: { color: '#fff', fontWeight: '700', fontSize: 12.5, textAlign: 'center' },
  });
}
