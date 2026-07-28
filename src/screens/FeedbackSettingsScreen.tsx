import React, { useMemo } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { canAccessPremiumFeature } from '../lib/premiumFeatures';
import { UI_FEEDBACK_STYLES } from '../lib/uiFeedback';
import { useUiFeedbackTrigger } from '../lib/useUiFeedbackTrigger';
import { Card, Screen } from '../components/ui';
import { RipplePressable } from '../components/RipplePressable';
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
  const {
    theme,
    config,
    isPremiumMember,
    setUiFeedbackStyle,
    setUiFeedbackSound,
  } = useApp();
  const triggerFeedback = useUiFeedbackTrigger();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const featureOn = config.features.buttonFeedback !== false;
  const allowed =
    featureOn &&
    canAccessPremiumFeature('feedback', isPremiumMember, config.premiumFeatures, config.features);
  const current = config.uiFeedbackStyle;
  const soundOn = config.uiFeedbackSound !== false;
  const styleActive = current !== 'off';

  const select = (style: UiFeedbackPreference, e?: GestureResponderEvent) => {
    if (!featureOn) {
      showAppInfo(t('feedbackStyle.title'), t('feedbackStyle.adminOff'), '⚙️');
      return;
    }
    if (!allowed && style !== 'off') {
      showAppInfo(t('feedbackStyle.title'), t('feedbackStyle.locked'), '👑');
      return;
    }
    // Play immediately — don't await persist (that made sound late vs the wave).
    if (style !== 'off') triggerFeedback(e, style);
    void setUiFeedbackStyle(style);
  };

  const toggleSound = (on: boolean) => {
    if (!allowed) {
      showAppInfo(t('feedbackStyle.title'), t('feedbackStyle.locked'), '👑');
      return;
    }
    if (!styleActive) {
      showAppInfo(t('feedbackStyle.sound'), t('feedbackStyle.soundNeedsStyle'), '🌊');
      return;
    }
    void setUiFeedbackSound(on);
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
            onPress={() => select('off')}
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

        {allowed ? (
          <Card>
            <View style={styles.soundRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowTitle, { color: theme.ink }]}>
                  {t('feedbackStyle.sound')}
                </Text>
                <Text style={[styles.rowHint, { color: theme.muted }]}>
                  {t('feedbackStyle.soundHint')}
                </Text>
              </View>
              <Switch
                value={soundOn && styleActive}
                disabled={!styleActive}
                onValueChange={toggleSound}
                trackColor={{ false: theme.line, true: theme.primary }}
                thumbColor="#fff"
              />
            </View>
          </Card>
        ) : null}

        <View style={styles.grid}>
          {UI_FEEDBACK_STYLES.map((id) => {
            const meta = STYLE_META[id];
            const on = current === id;
            return (
              <RipplePressable
                key={id}
                onPressIn={(e) => select(id, e)}
                localRipple={false}
                uiFeedback={false}
                rippleColor="rgba(255,255,255,0.5)"
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
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 14,
      overflow: 'hidden',
    },
    unlockText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    soundRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    rowTitle: { fontSize: 16, fontWeight: '800' },
    rowHint: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    styleBtn: {
      width: '47%',
      flexGrow: 1,
      minWidth: '45%',
      borderRadius: 16,
      padding: 14,
      minHeight: 110,
      borderWidth: 3,
      overflow: 'hidden',
    },
    styleTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
    styleHint: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 12, marginTop: 6 },
    styleCheck: { position: 'absolute', right: 12, top: 10, color: '#fff', fontWeight: '900', fontSize: 18 },
  });
}
