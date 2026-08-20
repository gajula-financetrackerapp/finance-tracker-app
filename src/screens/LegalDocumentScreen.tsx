import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { SearchableTopics, type SearchableTopic } from '../components/SearchableTopics';
import { privacyPolicySections } from '../legal/privacyPolicy';
import { termsOfUseSections } from '../legal/termsOfUse';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

const LAST_UPDATED = '17 August 2026';

export function LegalDocumentScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'LegalDocument'>>();
  const { theme, config } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const kind = route.params.kind;
  const title = kind === 'terms' ? t('settings.terms') : t('settings.privacy');
  const sections =
    kind === 'terms'
      ? termsOfUseSections(config.appName)
      : privacyPolicySections(config.appName);

  const topics = useMemo<SearchableTopic[]>(
    () => sections.map((s) => ({ key: s.heading, heading: s.heading, body: s.body })),
    [sections],
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>
            {t('legal.lastUpdated').replace('{date}', LAST_UPDATED)}
          </Text>
          <Text style={[styles.notice, { color: theme.muted }]}>{t('legal.englishOnly')}</Text>
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
    title: { fontWeight: '900', fontSize: 20, marginBottom: 8 },
    meta: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
    notice: { fontSize: 12, lineHeight: 17 },
  });
}
