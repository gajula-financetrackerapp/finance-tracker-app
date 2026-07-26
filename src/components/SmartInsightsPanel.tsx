import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { canAccessPremiumFeature } from '../lib/premiumFeatures';
import {
  buildSmartInsights,
  sampleInsight,
  type InsightSeverity,
  type SmartInsight,
} from '../lib/smartInsights';
import { fmt } from '../theme';
import { useT } from '../i18n/useT';
import type { TranslationKey } from '../i18n/translations';
import type { ThemeTokens } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = {
  monthKey: string;
};

function fillMessage(template: string, params: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function severityIcon(severity: InsightSeverity) {
  if (severity === 'warn') return '⚠️';
  if (severity === 'good') return '✅';
  return '💡';
}

/** Compact Charts button that opens Smart Insights in a closable dialog. */
export function SmartInsightsButton({ monthKey }: Props) {
  const { finance, config, theme, isPremiumMember } = useApp();
  const { t, catName } = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const insightsOk = canAccessPremiumFeature(
    'insights',
    isPremiumMember,
    config.premiumFeatures,
  );

  const insights = useMemo(() => {
    if (!insightsOk) return [sampleInsight()];
    return buildSmartInsights({
      transactions: finance.transactions,
      budgets: finance.categoryBudgets || [],
      monthKey,
      formatMoney: (n) => fmt(n, config.currency),
      categoryLabel: catName,
    });
  }, [
    insightsOk,
    finance.transactions,
    finance.categoryBudgets,
    monthKey,
    config.currency,
    catName,
  ]);

  const openPremium = () => {
    setOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation as any).navigate('PremiumCompare');
  };

  const renderCard = (insight: SmartInsight, locked: boolean) => {
    const msg = fillMessage(t(insight.messageKey as TranslationKey), insight.params);
    return (
      <View
        key={insight.id}
        style={[
          styles.card,
          insight.severity === 'warn' && styles.cardWarn,
          insight.severity === 'good' && styles.cardGood,
          locked && styles.cardLocked,
        ]}
      >
        <Text style={styles.cardIcon}>{severityIcon(insight.severity)}</Text>
        <Text style={[styles.cardText, locked && styles.cardTextLocked]}>{msg}</Text>
      </View>
    );
  };

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('insights.title')}
      >
        <Text style={styles.triggerIcon}>💡</Text>
        <Text style={styles.triggerText}>{t('insights.title')}</Text>
        {!insightsOk ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('themes.premium')}</Text>
          </View>
        ) : null}
        <Text style={styles.triggerChevron}>›</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <View style={styles.dialog}>
            <View style={styles.dialogHead}>
              <View style={styles.dialogTitleWrap}>
                <Text style={styles.dialogTitle}>{t('insights.title')}</Text>
                {!insightsOk ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t('themes.premium')}</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                style={styles.closeBtn}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.sub}>{t('insights.subtitle')}</Text>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {insightsOk ? (
                insights.map((i) => renderCard(i, false))
              ) : (
                <>
                  {renderCard(insights[0], true)}
                  <Pressable style={styles.unlockBtn} onPress={openPremium}>
                    <Text style={styles.unlockText}>{t('insights.unlock')}</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 4,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.line,
    },
    triggerIcon: { fontSize: 15 },
    triggerText: {
      flex: 1,
      color: theme.ink,
      fontWeight: '800',
      fontSize: 14,
    },
    triggerChevron: {
      color: theme.muted,
      fontSize: 20,
      fontWeight: '700',
      marginTop: -2,
    },
    badge: {
      backgroundColor: theme.header,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 0.3 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    dialog: {
      backgroundColor: theme.card,
      borderRadius: 18,
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 14,
      maxHeight: '72%',
    },
    dialogHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    dialogTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      paddingRight: 8,
    },
    dialogTitle: {
      color: theme.ink,
      fontWeight: '800',
      fontSize: 17,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.line,
    },
    closeText: {
      color: theme.muted,
      fontSize: 24,
      fontWeight: '600',
      marginTop: -2,
    },
    sub: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 12,
      lineHeight: 16,
    },
    list: { maxHeight: 420 },
    listContent: { paddingBottom: 4 },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    cardWarn: {
      borderColor: theme.red + '55',
      backgroundColor: theme.red + '10',
    },
    cardGood: {
      borderColor: theme.green + '55',
      backgroundColor: theme.green + '10',
    },
    cardLocked: { opacity: 0.72 },
    cardIcon: { fontSize: 16, marginTop: 1 },
    cardText: {
      flex: 1,
      color: theme.ink,
      fontSize: 13.5,
      fontWeight: '600',
      lineHeight: 19,
    },
    cardTextLocked: { color: theme.muted },
    unlockBtn: {
      marginTop: 4,
      marginBottom: 4,
      backgroundColor: theme.header,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    unlockText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
}
