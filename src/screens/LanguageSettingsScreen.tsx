import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import {
  APP_LANGUAGES,
  findAppLanguage,
  type AppLanguageCode,
} from '../i18n/languages';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

export function LanguageSettingsScreen() {
  const { theme, config, setLanguage } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const current = findAppLanguage(config.language);
  const [query, setQuery] = useState('');

  const pick = async (code: AppLanguageCode) => {
    if (code === config.language) return;
    await setLanguage(code);
  };

  /** Flat list: Device language + English first, then all others A–Z by English name. */
  const languages = useMemo(() => {
    const system = APP_LANGUAGES.find((l) => l.code === 'system');
    const english = APP_LANGUAGES.find((l) => l.code === 'en');
    const rest = APP_LANGUAGES.filter((l) => l.code !== 'system' && l.code !== 'en').sort((a, b) =>
      a.englishLabel.localeCompare(b.englishLabel, 'en'),
    );
    return [system, english, ...rest].filter(Boolean) as typeof APP_LANGUAGES;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter((lang) => {
      const hay = `${lang.nativeLabel} ${lang.englishLabel} ${lang.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [languages, query]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('language.title')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('language.hint')}</Text>
          <Text style={[styles.current, { color: theme.ink }]}>
            {t('language.current')}: {current.nativeLabel}
          </Text>
        </Card>

        <Card>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('language.search')}
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[
              styles.search,
              {
                color: theme.ink,
                borderColor: theme.line,
                backgroundColor: theme.bg,
              },
            ]}
          />
          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: theme.muted }]}>{t('language.noMatches')}</Text>
          ) : (
            filtered.map((lang, index) => {
              const on = config.language === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => void pick(lang.code)}
                  style={[
                    styles.row,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.line,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.ink }]}>{lang.nativeLabel}</Text>
                    {lang.englishLabel !== lang.nativeLabel ? (
                      <Text style={[styles.sub, { color: theme.muted }]}>{lang.englishLabel}</Text>
                    ) : null}
                  </View>
                  {on ? (
                    <Text style={[styles.check, { color: theme.header }]}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40, gap: 12 },
    title: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
    hint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
    current: { fontWeight: '800', fontSize: 14 },
    search: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    empty: {
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
    },
    name: { fontWeight: '800', fontSize: 15 },
    sub: { fontSize: 12, marginTop: 2 },
    check: { fontWeight: '900', fontSize: 16 },
  });
}
