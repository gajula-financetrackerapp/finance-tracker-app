import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { privacyPolicySections } from '../legal/privacyPolicy';
import { termsOfUseSections } from '../legal/termsOfUse';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

const LAST_UPDATED = '24 July 2026';

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

        {sections.map((section) => {
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
    chevron: { fontSize: 16, fontWeight: '900' },
    para: { fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 10 },
    paraGap: { marginTop: 10 },
  });
}
