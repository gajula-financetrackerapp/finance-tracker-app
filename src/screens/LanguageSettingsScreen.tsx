import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const { theme, config, updateConfig } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const current = findAppLanguage(config.language);

  const pick = async (code: AppLanguageCode) => {
    if (code === config.language) return;
    await updateConfig({ language: code });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('language.title')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('language.hint')}</Text>
          <Text style={[styles.current, { color: theme.ink }]}>
            {t('language.current')}: {current.flag} {current.nativeLabel}
          </Text>
        </Card>

        <Card>
          {APP_LANGUAGES.map((lang, index) => {
            const on = config.language === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => void pick(lang.code)}
                style={[
                  styles.row,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line },
                ]}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
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
          })}
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
    },
    flag: { fontSize: 22, width: 32, textAlign: 'center' },
    name: { fontWeight: '800', fontSize: 15 },
    sub: { fontSize: 12, marginTop: 2 },
    check: { fontWeight: '900', fontSize: 16 },
  });
}
