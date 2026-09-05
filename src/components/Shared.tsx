import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../FinanceContext';
import { useApp } from '../context/AppContext';
import { shadeColor } from '../utils/buildTheme';
import { useT } from '../i18n/useT';
import { SYSTEM_MODAL_PROPS } from './SystemSafeArea';
import { authActionKey } from '../i18n/authActions';
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
  const gateActionKey = authActionKey(authGateLabel);

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
      {...SYSTEM_MODAL_PROPS}
      onRequestClose={() => setShowAuthGate(false)}
    >
      <Pressable style={gateStyles.backdrop} onPress={() => setShowAuthGate(false)}>
        <Pressable style={gateStyles.card} onPress={(e) => e.stopPropagation()}>
          <View style={gateStyles.iconWrap}>
            <Text style={gateStyles.icon}>🔐</Text>
          </View>
          <Text style={gateStyles.title}>{t('auth.gateTitle')}</Text>
          <Text style={gateStyles.body}>
            {gateActionKey
              ? t('auth.gateBody').replace('{label}', t(gateActionKey))
              : t('auth.gateBodyPlain')}
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

/**
 * What the app is for, in the three lines a first-time visitor would want.
 * The sign-in screen is the only place we get to say it, and a screen with a
 * lone button on it tells them nothing.
 */
const AUTH_HIGHLIGHTS = [
  { icon: '💳', key: 'auth.featureImport' },
  { icon: '🔔', key: 'auth.featureRemind' },
  { icon: '👥', key: 'auth.featureSplit' },
] as const;

export function AuthModal() {
  const { theme, config } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showAuth, setShowAuth, signInWithOAuth } = useFinance();
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Dual-tone packs already carry two header colours. Single-tone ones set
   * headerEnd to the header itself, which would paint a flat block, so the
   * sweep is derived from the one colour they do have.
   */
  const heroColors = useMemo<[string, string, ...string[]]>(
    () =>
      theme.dualTone
        ? [theme.header, theme.headerEnd, theme.secondary]
        : [shadeColor(theme.header, 0.14), theme.header, shadeColor(theme.header, -0.2)],
    [theme.dualTone, theme.header, theme.headerEnd, theme.secondary],
  );

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
      {...SYSTEM_MODAL_PROPS}
    >
      <View style={[styles.authScreen, { backgroundColor: theme.bg }]}>
        <ScrollView
          contentContainerStyle={[
            styles.authScroll,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 26 }]}>
            <LinearGradient
              colors={heroColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Depth, cheaply: two blown-up highlights behind the mark. */}
            <View style={styles.heroGlowTop} pointerEvents="none" />
            <View style={styles.heroGlowBottom} pointerEvents="none" />

            <BrandMark theme={theme} name={config.appName} />
            <Text style={styles.brandName}>{config.appName}</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          </View>

          {/* Lifted over the hero's edge so the two read as one surface. */}
          <View style={styles.sheet}>
            <Text style={styles.title}>{t('common.signIn')}</Text>
            <Text style={styles.sub}>{t('auth.googleSub')}</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.oauthBtn,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
              onPress={() => {
                if (!busy) void onOAuth('google');
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('auth.googleCta')}
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

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>{t('auth.or')}</Text>
              <View style={styles.orLine} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.guestBtn, pressed && styles.pressed]}
              onPress={close}
              accessibilityRole="button"
            >
              <Text style={styles.guestText}>{t('auth.continueGuest')}</Text>
            </Pressable>
            <Text style={styles.guestHint}>{t('auth.guestHint')}</Text>
          </View>

          <View style={styles.features}>
            {AUTH_HIGHLIGHTS.map((item) => (
              <View key={item.key} style={styles.featureRow}>
                <View style={styles.featureIconWrap}>
                  <Text style={styles.featureIcon}>{item.icon}</Text>
                </View>
                <Text style={styles.featureText}>{t(item.key)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.legalNote}>{t('auth.legalNote')}</Text>
          <View style={styles.legalRow}>
            <Pressable onPress={() => openLegal('terms')} hitSlop={8}>
              <Text style={[styles.legalLink, { color: theme.header }]}>{t('settings.terms')}</Text>
            </Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable onPress={() => openLegal('privacy')} hitSlop={8}>
              <Text style={[styles.legalLink, { color: theme.header }]}>
                {t('settings.privacy')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * The logo slot. It holds the app's initial for now — when the artwork is
 * settled, swap the Text below for an Image at the same size and nothing else
 * on this screen needs to move.
 */
function BrandMark({ theme, name }: { theme: ThemeTokens; name: string }) {
  const initial = (name || 'K').trim().charAt(0).toUpperCase();
  return (
    <View style={brandStyles.halo}>
      <View style={brandStyles.tile}>
        <Text style={[brandStyles.initial, { color: theme.onPrimaryDark }]}>{initial}</Text>
      </View>
    </View>
  );
}

const brandStyles = StyleSheet.create({
  halo: {
    width: 104,
    height: 104,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 16,
  },
  tile: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  initial: { fontSize: 42, fontWeight: '900', letterSpacing: -1 },
});

/** Google's own mark — a blue letter G is not their brand, and it shows. */
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

export function GuestBanner() {
  const { theme } = useApp();
  const { t } = useT();
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
      accessibilityRole="button"
      accessibilityLabel={t('common.signIn')}
    >
      <Text style={styles.bannerText} numberOfLines={2}>
        {t('auth.guestBanner')}
      </Text>
      {/* The whole strip has always opened sign-in, but a line of text does not
          look like something to press. The button is inside it rather than
          beside it, so either place still works. */}
      <View style={styles.bannerBtn}>
        <Text style={styles.bannerBtnText}>{t('common.signIn')}</Text>
      </View>
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
    authScreen: { flex: 1 },
    authScroll: { flexGrow: 1 },
    hero: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 58,
      borderBottomLeftRadius: 34,
      borderBottomRightRadius: 34,
      overflow: 'hidden',
    },
    heroGlowTop: {
      position: 'absolute',
      top: -70,
      right: -50,
      width: 210,
      height: 210,
      borderRadius: 105,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    heroGlowBottom: {
      position: 'absolute',
      bottom: -90,
      left: -60,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: 'rgba(255,255,255,0.07)',
    },
    brandName: {
      color: theme.onPrimaryDark,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    tagline: {
      color: theme.onPrimaryDark,
      opacity: 0.85,
      fontSize: 14.5,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 300,
    },
    sheet: {
      backgroundColor: theme.card,
      marginHorizontal: 16,
      marginTop: -34,
      borderRadius: 26,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 18,
      borderWidth: 1,
      borderColor: theme.line,
      shadowColor: theme.ink,
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    title: { fontSize: 24, fontWeight: '800', color: theme.ink, textAlign: 'center' },
    sub: {
      color: theme.muted,
      marginTop: 6,
      marginBottom: 20,
      lineHeight: 20,
      fontSize: 13.5,
      textAlign: 'center',
    },
    oauthBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: theme.white,
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 18,
      borderWidth: 1.5,
      borderColor: theme.line,
      shadowColor: theme.ink,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    oauthText: { color: theme.ink, fontWeight: '800', fontSize: 15.5 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.6 },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
    orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.line },
    orText: {
      color: theme.muted,
      fontSize: 11.5,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    guestBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: theme.line,
      backgroundColor: theme.accentSoft,
    },
    guestText: { color: theme.ink, fontWeight: '800', fontSize: 14.5 },
    guestHint: {
      color: theme.muted,
      fontSize: 11.5,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 16,
    },
    features: { paddingHorizontal: 26, paddingTop: 22, gap: 14 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    featureIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: theme.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureIcon: { fontSize: 17 },
    featureText: { flex: 1, color: theme.ink, fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
    legalNote: {
      marginTop: 26,
      paddingHorizontal: 34,
      color: theme.muted,
      fontSize: 11.5,
      lineHeight: 17,
      textAlign: 'center',
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 6,
    },
    legalLink: { fontWeight: '800', fontSize: 12.5 },
    legalDot: { color: theme.muted, fontSize: 12.5 },
    error: {
      color: theme.red,
      marginBottom: 12,
      fontWeight: '700',
      fontSize: 13,
      textAlign: 'center',
    },
    banner: {
      backgroundColor: theme.header,
      paddingVertical: 8,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    bannerText: { color: '#fff', fontWeight: '700', fontSize: 12.5, flex: 1 },
    bannerBtn: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.6)',
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    bannerBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  });
}
