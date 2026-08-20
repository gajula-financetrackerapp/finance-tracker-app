import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { SearchableTopics, type SearchableTopic } from '../components/SearchableTopics';
import { faqTopics } from '../content/faqTopics';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

export function FaqScreen() {
  const { theme } = useApp();
  const { t, lang } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const topics = useMemo<SearchableTopic[]>(
    () =>
      // lang: the answers and every step come from the language pack.
      faqTopics().map((topic) => ({
        key: topic.id,
        heading: topic.question,
        lead: `${t('faq.steps')}: ${topic.path.join('  →  ')}`,
        body: topic.answer,
      })),
    [t, lang],
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('settings.faq')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('faq.intro')}</Text>
        </Card>

        <SearchableTopics topics={topics} />

        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40, gap: 12 },
    title: { fontWeight: '900', fontSize: 20, marginBottom: 6 },
    hint: { fontSize: 13, lineHeight: 19 },
  });
}
