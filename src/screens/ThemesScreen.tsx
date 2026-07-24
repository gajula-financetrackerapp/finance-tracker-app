import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { THEMES } from '../constants';
import { Card, Screen } from '../components/ui';
import { showAppDialog } from '../appDialog';
import { SparkleBurst } from '../components/PremiumChrome';
import type { ThemeKey } from '../types';
import {
  canUseTheme,
  themeAccessFor,
  visibleThemes,
} from '../utils/themeAccess';
import { useT } from '../i18n/useT';

const LIGHT_SWATCHES = new Set<ThemeKey>(['yellow', 'gold', 'champagne', 'royal']);

export function ThemesScreen() {
  const { config, theme, setTheme, isPremiumMember } = useApp();
  const { t } = useT();
  const catalog = config.themeCatalog;
  const keys = visibleThemes(catalog);
  const [sparkleKey, setSparkleKey] = useState<ThemeKey | null>(null);

  const onPick = async (key: ThemeKey) => {
    if (canUseTheme(key, catalog, isPremiumMember)) {
      const ok = await setTheme(key);
      if (ok && THEMES[key].premiumMotion) {
        setSparkleKey(key);
        setTimeout(() => setSparkleKey((k) => (k === key ? null : k)), 750);
      }
      return;
    }
    const access = themeAccessFor(key, catalog);
    if (access === 'premiumPro') {
      showAppDialog({
        title: 'Premium Pro',
        message: `${THEMES[key].label} is a Premium Pro color. This tier is coming soon.`,
        icon: '💎',
        buttons: [{ text: t('common.gotIt'), style: 'primary' }],
      });
      return;
    }
    showAppDialog({
      title: 'Premium color',
      message: `${THEMES[key].label} is a Premium look. It unlocks after a paid subscription — checkout is coming soon.`,
      icon: '👑',
      buttons: [{ text: t('common.gotIt'), style: 'primary' }],
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('themes.title')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('themes.hint')}</Text>
          {isPremiumMember ? (
            <Text style={[styles.badge, { color: theme.primaryDark || theme.primary }]}>
              👑 {t('themes.premium')}
            </Text>
          ) : null}

          <View style={styles.grid}>
            {keys.map((key) => {
              const themeDef = THEMES[key];
              const selected = config.theme === key;
              const access = themeAccessFor(key, catalog);
              const locked = !canUseTheme(key, catalog, isPremiumMember);
              const onLight = !themeDef.dualTone && LIGHT_SWATCHES.has(key);
              const fg = onLight ? '#1A1A1A' : '#fff';
              return (
                <Pressable
                  key={key}
                  onPress={() => void onPick(key)}
                  style={[
                    styles.swatch,
                    {
                      borderColor: selected ? (onLight ? themeDef.ink : theme.ink) : 'transparent',
                      borderWidth: selected ? 3 : 0,
                      opacity: locked ? 0.72 : 1,
                    },
                  ]}
                >
                  {themeDef.dualTone ? (
                    <LinearGradient
                      colors={[themeDef.header, themeDef.headerEnd, themeDef.secondary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  ) : (
                    <View
                      style={[StyleSheet.absoluteFillObject, { backgroundColor: themeDef.primary }]}
                    />
                  )}
                  <View style={[styles.previewBar, { backgroundColor: themeDef.secondary || themeDef.primaryDark }]} />
                  <Text style={[styles.swatchLabel, { color: fg }]}>{themeDef.label}</Text>
                  {themeDef.dualTone ? (
                    <Text style={[styles.tag, { color: fg }]}>Dual · Live</Text>
                  ) : null}
                  {access === 'premium' ? (
                    <Text style={[styles.crown, { color: fg }]}>👑</Text>
                  ) : null}
                  {access === 'premiumPro' ? (
                    <Text style={[styles.crown, { color: fg }]}>💎</Text>
                  ) : null}
                  {selected ? <Text style={[styles.check, { color: fg }]}>✓</Text> : null}
                  {locked ? (
                    <View style={styles.lockOverlay}>
                      <Text style={styles.lockText}>
                        {access === 'premiumPro' ? 'Pro' : t('themes.premium')}
                      </Text>
                    </View>
                  ) : null}
                  <SparkleBurst active={sparkleKey === key} />
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <Text style={[styles.previewTitle, { color: theme.ink }]}>{t('themes.preview')}</Text>
          <View style={[styles.previewCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            {theme.dualTone ? (
              <LinearGradient
                colors={[theme.header, theme.headerEnd, theme.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.previewHeader}
              >
                <Text style={styles.previewHeaderText}>{THEMES[config.theme].label}</Text>
              </LinearGradient>
            ) : (
              <View
                style={[styles.previewHeader, { backgroundColor: theme.primaryDark || theme.primary }]}
              >
                <Text style={styles.previewHeaderText}>{THEMES[config.theme].label}</Text>
              </View>
            )}
            <View style={[styles.previewBody, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.ink, fontWeight: '800' }}>{t('themes.sample')}</Text>
              <Text style={{ color: theme.muted, marginTop: 4 }}>
                {theme.premiumMotion
                  ? 'Headers glow softly and the + button breathes between both tones.'
                  : 'Buttons, lists and screens follow this color.'}
              </Text>
              <View style={[styles.previewBtn, { backgroundColor: theme.primary }]}>
                <Text style={styles.previewBtnText}>{t('themes.primary')}</Text>
              </View>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 12, fontSize: 13 },
  badge: { fontWeight: '800', fontSize: 13, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: '47%',
    minHeight: 96,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  previewBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    opacity: 0.9,
  },
  swatchLabel: { fontWeight: '800', fontSize: 13 },
  tag: { fontWeight: '700', fontSize: 10, marginTop: 2, opacity: 0.9 },
  crown: { position: 'absolute', top: 12, left: 10, fontSize: 14 },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontWeight: '900',
    fontSize: 16,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  previewTitle: { fontWeight: '800', fontSize: 15, marginBottom: 10 },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewHeader: { paddingVertical: 14, alignItems: 'center' },
  previewHeaderText: { color: '#fff', fontWeight: '800' },
  previewBody: { padding: 14 },
  previewBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  previewBtnText: { color: '#fff', fontWeight: '800' },
});
