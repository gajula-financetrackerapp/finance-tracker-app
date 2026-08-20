import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card } from './ui';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

export type SearchableTopic = {
  /** Identity for open/closed state — translated headings can collide. */
  key: string;
  heading: string;
  body: string;
  /** Shown above the body when open, and searched: the FAQ uses it for the route to tap. */
  lead?: string;
};

/** Enough of the sentence around a hit to show why the topic matched. */
function matchSnippet(text: string, needle: string): string | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  const from = Math.max(0, at - 40);
  const to = Math.min(flat.length, at + needle.length + 60);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to).trim()}${to < flat.length ? '…' : ''}`;
}

/**
 * A searchable list of collapsed topics, shared by the FAQ and the legal
 * documents so the two read and behave the same way.
 */
export function SearchableTopics({ topics }: { topics: SearchableTopic[] }) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Collapsed by default so the whole document is scannable as a list.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // One character matches almost everything, which is noise rather than a search.
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= 2;
  const results = useMemo(() => {
    if (!searching) return topics.map((topic) => ({ topic, snippet: null as string | null }));
    return topics
      .filter((topic) =>
        [topic.heading, topic.lead || '', topic.body].some((part) =>
          part.toLowerCase().includes(needle),
        ),
      )
      .map((topic) => ({
        topic,
        snippet: matchSnippet(`${topic.lead ? `${topic.lead} — ` : ''}${topic.body}`, needle),
      }));
  }, [topics, needle, searching]);

  return (
    <>
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
              ? t('legal.searchCount', { n: results.length, q: query.trim() })
              : t('legal.searchNone', { q: query.trim() })}
          </Text>
        ) : null}
      </Card>

      {results.map(({ topic, snippet }) => {
        // A search result opens on tap like any other row, but the snippet
        // below the heading says why it is in the list at all.
        const open = openKey === topic.key;
        return (
          <Card key={topic.key}>
            <Pressable
              onPress={() => setOpenKey(open ? null : topic.key)}
              style={styles.headingRow}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
            >
              <Text style={[styles.heading, { color: theme.ink }]}>{topic.heading}</Text>
              <Text style={[styles.chevron, { color: theme.muted }]}>{open ? '⌃' : '⌄'}</Text>
            </Pressable>
            {!open && snippet ? (
              <Text style={[styles.snippet, { color: theme.muted }]} numberOfLines={2}>
                {snippet}
              </Text>
            ) : null}
            {open && topic.lead ? (
              <View
                style={[
                  styles.lead,
                  { borderColor: `${theme.primary}55`, backgroundColor: `${theme.primary}12` },
                ]}
              >
                <Text style={[styles.leadText, { color: theme.ink }]}>{topic.lead}</Text>
              </View>
            ) : null}
            {open
              ? topic.body.split('\n\n').map((para, i) => (
                  <Text
                    key={`${topic.key}-${i}`}
                    style={[styles.para, { color: theme.ink }, i > 0 && styles.paraGap]}
                  >
                    {para}
                  </Text>
                ))
              : null}
          </Card>
        );
      })}
    </>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
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
    lead: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 },
    leadText: { fontSize: 13, lineHeight: 19, fontWeight: '800' },
    para: { fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 10 },
    paraGap: { marginTop: 10 },
  });
}
