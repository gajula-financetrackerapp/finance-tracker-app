import React, { useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { canAccessPremiumFeature } from '../lib/premiumFeatures';
import { playUiFeedback, UI_FEEDBACK_STYLES } from '../lib/uiFeedback';
import { Card, Screen } from '../components/ui';
import { RipplePressable } from '../components/RipplePressable';
import { spawnScreenRipple } from '../components/ScreenRippleHost';
import { showAppInfo } from '../appDialog';
import { RootStackParamList } from '../navigation/types';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';
import type { ThemeTokens, UiFeedbackPreference, UiFeedbackStyle } from '../types';

const STYLE_META: Record<
  UiFeedbackStyle,
  { titleKey: TranslationKey; hintKey: TranslationKey; color: string }
> = {
  pop: {
    titleKey: 'feedbackStyle.pop',
    hintKey: 'feedbackStyle.popHint',
    color: '#06b6d4',
  },
  chime: {
    titleKey: 'feedbackStyle.chime',
    hintKey: 'feedbackStyle.chimeHint',
    color: '#f59e0b',
  },
  beep: {
    titleKey: 'feedbackStyle.beep',
    hintKey: 'feedbackStyle.beepHint',
    color: '#ec4899',
  },
  buzz: {
    titleKey: 'feedbackStyle.buzz',
    hintKey: 'feedbackStyle.buzzHint',
    color: '#10b981',
  },
};

/** Pick Pulse Pop / Sunset Chime / Neon Beep / Deep Buzz — Premium-gated. */
export function FeedbackSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, config, isPremiumMember, setUiFeedbackStyle } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const featureOn = config.features.buttonFeedback !== false;
  const allowed =
    featureOn &&
    canAccessPremiumFeature('feedback', isPremiumMember, config.premiumFeatures);
  const current = config.uiFeedbackStyle;

  const select = async (style: UiFeedbackPreference) => {
    if (!featureOn) {
      showAppInfo(t('feedbackStyle.title'), t('feedbackStyle.adminOff'), '⚙️');
      return;
    }
    if (!allowed && style !== 'off') {
      showAppInfo(t('feedbackStyle.title'), t('feedbackStyle.locked'), '👑');
      return;
    }
    await setUiFeedbackStyle(style);
    if (style !== 'off') {
      void playUiFeedback(style);
      const { width, height } = Dimensions.get('window');
      spawnScreenRipple(width / 2, height / 2);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: theme.muted }]}>
          {allowed ? t('feedbackStyle.intro') : t('feedbackStyle.introLocked')}
        </Text>

        {!allowed ? (
          <RipplePressable
            onPress={() => navigation.navigate('PremiumCompare')}
            rippleColor="rgba(255,255,255,0.28)"
            style={[styles.unlockBtn, { backgroundColor: theme.header }]}
          >
            <Text style={styles.unlockText}>{t('premium.seePlans')}</Text>
          </RipplePressable>
        ) : null}

        <Card>
          <Pressable
            onPress={() => void select('off')}
            style={[
              styles.row,
              current === 'off' && { borderColor: theme.header, backgroundColor: theme.accentSoft },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.ink }]}>{t('feedbackStyle.off')}</Text>
              <Text style={[styles.rowHint, { color: theme.muted }]}>
                {t('feedbackStyle.offHint')}
              </Text>
            </View>
            {current === 'off' ? (
              <Text style={{ color: theme.header, fontWeight: '900' }}>✓</Text>
            ) : null}
          </Pressable>
        </Card>

        <View style={styles.grid}>
          {UI_FEEDBACK_STYLES.map((id) => {
            const meta = STYLE_META[id];
            const on = current === id;
            return (
              <RipplePressable
                key={id}
                onPress={() => void select(id)}
                rippleColor="rgba(255,255,255,0.35)"
                style={[
                  styles.styleBtn,
                  {
                    backgroundColor: meta.color,
                    borderColor: on ? '#fff' : 'transparent',
                  },
                ]}
              >
                <Text style={styles.styleTitle}>{t(meta.titleKey)}</Text>
                <Text style={styles.styleHint}>{t(meta.hintKey)}</Text>
                {on ? <Text style={styles.styleCheck}>✓</Text> : null}
              </RipplePressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, paddingBottom: 40 },
    intro: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginBottom: 14 },
    unlockBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 14,
    },
    unlockText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      padding: 12,
    },
    rowTitle: { fontWeight: '800', fontSize: 15 },
    rowHint: { fontSize: 12, marginTop: 3, fontWeight: '600' },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 4,
    },
    styleBtn: {
      width: '47%',
      flexGrow: 1,
      minWidth: '45%',
      borderRadius: 14,
      paddingVertical: 18,
      paddingHorizontal: 14,
      minHeight: 110,
      borderWidth: 3,
      opacity: 1,
    },
    styleTitle: { color: '#fff', fontWeight: '800', fontSize: 15, opacity: 1 },
    styleHint: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: 11,
      marginTop: 6,
      fontWeight: '600',
      opacity: 1,
    },
    styleCheck: {
      position: 'absolute',
      top: 10,
      right: 12,
      color: '#fff',
      fontWeight: '900',
      fontSize: 16,
    },
  });
}
