import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { THEMES } from '../constants';
import { Card, Screen } from '../components/ui';
import type { ThemeKey } from '../types';

export function ThemesScreen() {
  const { config, theme, setTheme } = useApp();
  const keys = Object.keys(THEMES) as ThemeKey[];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>Themes</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Choose a look for Pulse Wallet. Your selection is saved on this device.
          </Text>

          <View style={styles.grid}>
            {keys.map((key) => {
              const t = THEMES[key];
              const selected = config.theme === key;
              // Light primaries (e.g. Classic Yellow) need dark label/check for visibility.
              const onLight = key === 'yellow';
              const fg = onLight ? '#1A1A1A' : '#fff';
              return (
                <Pressable
                  key={key}
                  onPress={() => void setTheme(key)}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: t.primary,
                      borderColor: selected ? (onLight ? t.ink : theme.ink) : 'transparent',
                      borderWidth: selected ? 3 : 0,
                    },
                  ]}
                >
                  <View style={[styles.previewBar, { backgroundColor: t.primaryDark }]} />
                  <Text style={[styles.swatchLabel, { color: fg }]}>{t.label}</Text>
                  {selected ? <Text style={[styles.check, { color: fg }]}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <Text style={[styles.previewTitle, { color: theme.ink }]}>Preview</Text>
          <View style={[styles.previewCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <View style={[styles.previewHeader, { backgroundColor: theme.primaryDark || theme.primary }]}>
              <Text style={styles.previewHeaderText}>{THEMES[config.theme].label}</Text>
            </View>
            <View style={[styles.previewBody, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.ink, fontWeight: '800' }}>Sample card</Text>
              <Text style={{ color: theme.muted, marginTop: 4 }}>
                Buttons, lists and screens will follow this theme.
              </Text>
              <View style={[styles.previewBtn, { backgroundColor: theme.primary }]}>
                <Text style={styles.previewBtnText}>Primary</Text>
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
  hint: { lineHeight: 20, marginBottom: 16, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: '47%',
    minHeight: 88,
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
    opacity: 0.85,
  },
  swatchLabel: { fontWeight: '800', fontSize: 13 },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontWeight: '900',
    fontSize: 16,
  },
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
