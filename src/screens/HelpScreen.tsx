import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { helpTopics } from '../content/helpTopics';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

export function HelpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, config } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const topics = useMemo(() => helpTopics(config.appName), [config.appName]);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('settings.help')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('help.intro')}</Text>
          <Text style={[styles.notice, { color: theme.muted }]}>{t('legal.englishOnly')}</Text>
        </Card>

        {topics.map((topic, index) => {
          const expanded = !!open[index];
          return (
            <Card key={topic.title}>
              <Pressable
                onPress={() => setOpen((prev) => ({ ...prev, [index]: !prev[index] }))}
                style={styles.topicHead}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <Text style={[styles.topicTitle, { color: theme.ink }]}>{topic.title}</Text>
                <Text style={[styles.chev, { color: theme.muted }]}>{expanded ? '▼' : '›'}</Text>
              </Pressable>
              {expanded
                ? topic.body.split('\n\n').map((para, i) => (
                    <Text
                      key={`${topic.title}-${i}`}
                      style={[styles.para, { color: theme.ink }, i > 0 && styles.paraGap]}
                    >
                      {para}
                    </Text>
                  ))
                : null}
            </Card>
          );
        })}

        <Pressable
          style={[styles.linkCard, { backgroundColor: theme.card, borderColor: theme.line }]}
          onPress={() => navigation.navigate('Feedback')}
        >
          <Text style={[styles.linkTitle, { color: theme.ink }]}>{t('settings.feedback')}</Text>
          <Text style={[styles.linkSub, { color: theme.muted }]}>{t('help.sendFeedback')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40, gap: 12 },
    title: { fontWeight: '900', fontSize: 20, marginBottom: 8 },
    hint: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
    notice: { fontSize: 12, lineHeight: 17 },
    topicHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 4,
    },
    topicTitle: { flex: 1, fontWeight: '900', fontSize: 15 },
    chev: { fontSize: 16, fontWeight: '700' },
    para: { fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 8 },
    paraGap: { marginTop: 10 },
    linkCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
    },
    linkTitle: { fontWeight: '800', fontSize: 15 },
    linkSub: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  });
}
