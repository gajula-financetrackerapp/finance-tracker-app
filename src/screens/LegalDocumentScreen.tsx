import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { privacyPolicySections } from '../legal/privacyPolicy';
import { termsOfUseSections } from '../legal/termsOfUse';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

const LAST_UPDATED = '17 August 2026';

/** Enough of the sentence around a hit to show why the section matched. */
function matchSnippet(body: string, needle: string): string | null {
  const flat = body.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  const from = Math.max(0, at - 40);
  const to = Math.min(flat.length, at + needle.length + 60);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to).trim()}${to < flat.length ? '…' : ''}`;
}

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

  // Collapsed by default so the whole document is scannable as a list.
  const [openHeading, setOpenHeading] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // One character matches almost everything, which is noise rather than a search.
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= 2;
  const results = useMemo(() => {
    if (!searching) return sections.map((section) => ({ section, snippet: null as string | null }));
    return sections
      .filter(
        (s) =>
          s.heading.toLowerCase().includes(needle) || s.body.toLowerCase().includes(needle),
      )
      .map((section) => ({ section, snippet: matchSnippet(section.body, needle) }));
  }, [sections, needle, searching]);

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

        <Card>
          <View
            style={[
              styles.searchRow,
              { borderColor: searching ? theme.primary : theme.line, backgroundColor: theme.bg },
            ]}
          >
            <Text style={[styles.searchIcon, { color: theme.muted }]}>🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('legal.searchPlaceholder')}
              placeholderTextColor={theme.muted}
              style={[styles.searchInput, { color: theme.ink }]}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Text style={[styles.searchClear, { color: theme.primary }]}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {searching ? (
            <Text style={[styles.searchMeta, { color: theme.muted }]}>
              {results.length
                ? t('legal.searchCount')
                    .replace('{n}', String(results.length))
                    .replace('{q}', query.trim())
                : t('legal.searchNone').replace('{q}', query.trim())}
            </Text>
          ) : null}
        </Card>

        {results.map(({ section, snippet }) => {
          // A search result opens on tap like any other row, but the snippet
          // below the heading says why it is in the list at all.
          const open = openHeading === section.heading;
          return (
            <Card key={section.heading}>
              <Pressable
                onPress={() => setOpenHeading(open ? null : section.heading)}
                style={styles.headingRow}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Text style={[styles.heading, { color: theme.ink }]}>{section.heading}</Text>
                <Text style={[styles.chevron, { color: theme.muted }]}>
                  {open ? '⌃' : '⌄'}
                </Text>
              </Pressable>
              {!open && snippet ? (
                <Text style={[styles.snippet, { color: theme.muted }]} numberOfLines={2}>
                  {snippet}
                </Text>
              ) : null}
              {open
                ? section.body.split('\n\n').map((para, i) => (
                    <Text
                      key={`${section.heading}-${i}`}
                      style={[styles.para, { color: theme.ink }, i > 0 && styles.paraGap]}
                    >
                      {para}
                    </Text>
                  ))
                : null}
            </Card>
          );
        })}

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
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    heading: { fontWeight: '900', fontSize: 15, flex: 1 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 2,
    },
    searchIcon: { fontSize: 13 },
    searchInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 9 },
    searchClear: { fontSize: 15, fontWeight: '900' },
    searchMeta: { fontSize: 12, fontWeight: '700', marginTop: 8 },
    snippet: { fontSize: 12, lineHeight: 17, marginTop: 6, fontStyle: 'italic' },
    chevron: { fontSize: 16, fontWeight: '900' },
    para: { fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 10 },
    paraGap: { marginTop: 10 },
  });
}
