import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { Card, Screen } from '../components/ui';
import { aboutBlocks } from '../content/aboutContent';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

function appVersion() {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0'
  );
}

export function AboutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, config } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const version = appVersion();
  const blocks = useMemo(
    () => aboutBlocks(config.appName, version),
    [config.appName, version],
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={styles.brandEmoji}>💼</Text>
          <Text style={[styles.brand, { color: theme.ink }]}>
            {config.appName || 'MoneyLit'}
          </Text>
          <Text style={[styles.tagline, { color: theme.muted }]}>{t('about.tagline')}</Text>
          <Text style={[styles.version, { color: theme.muted }]}>
            {t('about.version').replace('{version}', version)}
          </Text>
          <Text style={[styles.notice, { color: theme.muted }]}>{t('legal.englishOnly')}</Text>
        </Card>

        {blocks.map((block) => (
          <Card key={block.heading}>
            <Text style={[styles.heading, { color: theme.ink }]}>{block.heading}</Text>
            <Text style={[styles.para, { color: theme.ink }]}>{block.body}</Text>
          </Card>
        ))}

        <View style={[styles.links, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Pressable
            style={styles.linkRow}
            onPress={() => navigation.navigate('LegalDocument', { kind: 'terms' })}
          >
            <Text style={[styles.linkText, { color: theme.ink }]}>{t('settings.terms')}</Text>
            <Text style={{ color: theme.muted, fontWeight: '700' }}>›</Text>
          </Pressable>
          <View style={[styles.linkDivider, { backgroundColor: theme.line }]} />
          <Pressable
            style={styles.linkRow}
            onPress={() => navigation.navigate('LegalDocument', { kind: 'privacy' })}
          >
            <Text style={[styles.linkText, { color: theme.ink }]}>{t('settings.privacy')}</Text>
            <Text style={{ color: theme.muted, fontWeight: '700' }}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40, gap: 12 },
    brandEmoji: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
    brand: { fontWeight: '900', fontSize: 22, textAlign: 'center' },
    tagline: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
    version: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 10 },
    notice: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 8 },
    heading: { fontWeight: '900', fontSize: 15, marginBottom: 8 },
    para: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
    links: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    linkText: { fontWeight: '800', fontSize: 15 },
    linkDivider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  });
}
