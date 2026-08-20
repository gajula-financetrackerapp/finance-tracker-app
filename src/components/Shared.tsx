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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';
import type { RootStackParamList } from '../navigation/types';
import { formatAmountDigits } from '../utils';
import type { OAuthProvider } from '../lib/oauthSignIn';

/** Styled chooser shown when a guest tries to add/change data. */
export function SignInRequiredModal() {
  const { theme } = useApp();
  const { t } = useT();
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
    // Let the gate modal finish dismissing before opening auth (avoids stacked-modal flash).
    setTimeout(() => setShowAuth(true), 40);
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
          <Text style={gateStyles.title}>{t('auth.gateTitle')}</Text>
          <Text style={gateStyles.body}>
            {t('auth.gateBody').replace('{label}', authGateLabel)}
          </Text>

          <Pressable style={gateStyles.primary} onPress={openAuth}>
            <Text style={gateStyles.primaryText}>{t('common.signIn')}</Text>
          </Pressable>
          <Pressable style={gateStyles.ghost} onPress={() => setShowAuthGate(false)}>
            <Text style={gateStyles.ghostText}>{t('auth.notNow')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AuthModal() {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showAuth, setShowAuth, signInWithOAuth } = useFinance();
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setShowAuth(false);
    setError(null);
  };

  const openLegal = (kind: 'terms' | 'privacy') => {
    close();
    navigation.navigate('LegalDocument', { kind });
  };

  const onOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setBusy(true);
    setBusyProvider(provider);
    // Close the full-screen modal first — on Android it blocks the deep-link
    // return from the browser and leaves Chrome on “This site can’t be reached”.
    setShowAuth(false);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const err = await signInWithOAuth(provider);
      if (err) {
        setShowAuth(true);
        setError(err);
      }
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  return (
    <Modal
      visible={showAuth}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <View
        style={[
          styles.authScreen,
          {
            backgroundColor: theme.bg,
            paddingTop: Math.max(insets.top, 16) + 12,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.authInner}>
          <View style={styles.authHeader}>
            <View style={styles.authBadge}>
              <Text style={styles.authBadgeText}>Kashio</Text>
            </View>
            <Text style={styles.title}>{t('common.signIn')}</Text>
            <Text style={styles.sub}>{t('auth.googleSub')}</Text>
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
                <Text style={styles.oauthText}>{t('auth.googleCta')}</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.legalNote}>{t('auth.legalNote')}</Text>
          <View style={styles.legalRow}>
            <Pressable onPress={() => openLegal('terms')} hitSlop={8}>
              <Text style={[styles.legalLink, { color: theme.header }]}>{t('settings.terms')}</Text>
            </Pressable>
            <Pressable onPress={() => openLegal('privacy')} hitSlop={8}>
              <Text style={[styles.legalLink, { color: theme.header }]}>
                {t('settings.privacy')}
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.cancel} onPress={close}>
          <Text style={styles.cancelText}>{t('auth.continueGuest')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function GoogleMark() {
  return (
    <View style={googleMarkStyles.wrap}>
      <Text style={googleMarkStyles.g}>G</Text>
    </View>
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
    authScreen: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: 'space-between',
    },
    authInner: {
      flexGrow: 1,
      justifyContent: 'center',
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
    },
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
    title: { fontSize: 28, fontWeight: '800', color: theme.ink },
    sub: { color: theme.muted, marginTop: 8, marginBottom: 28, lineHeight: 21, fontSize: 15 },
    oauthBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: theme.card,
      borderRadius: 999,
      paddingVertical: 15,
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
      marginTop: 16,
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
    error: { color: theme.red, marginBottom: 12, fontWeight: '600' },
    banner: {
      backgroundColor: theme.header,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    bannerText: { color: '#fff', fontWeight: '700', fontSize: 12.5, textAlign: 'center' },
  });
}
