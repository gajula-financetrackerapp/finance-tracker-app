import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { DialogInsetView, SystemModal } from './SystemSafeArea';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

type Props = {
  visible: boolean;
  title: string;
  /** One-line gist, shown first and a little stronger than the rest. */
  lead?: string;
  paragraphs: string[];
  onClose: () => void;
};

/** Centered explainer with a close mark, used on Credit cards and Import SMS. */
export function InfoPopup({ visible, title, lead, paragraphs, onClose }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SystemModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <DialogInsetView>
        <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.top}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={styles.closeMark}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollInner}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {lead ? <Text style={styles.lead}>{lead}</Text> : null}
            {paragraphs.map((p, i) => (
              <Text key={i} style={[styles.body, i === paragraphs.length - 1 && styles.bodyLast]}>
                {p}
              </Text>
            ))}
          </ScrollView>
        </Pressable>
        </Pressable>
      </DialogInsetView>
    </SystemModal>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 61, 62, 0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
      maxHeight: '80%',
      shadowColor: '#0F3D3E',
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    top: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: theme.ink,
      paddingTop: 4,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSoft,
    },
    closeMark: { color: theme.ink, fontSize: 16, fontWeight: '800', lineHeight: 18 },
    bodyScroll: { flexGrow: 0 },
    bodyScrollInner: { paddingBottom: 2 },
    lead: {
      color: theme.ink,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '700',
      marginBottom: 14,
    },
    body: {
      color: theme.muted,
      fontSize: 15,
      lineHeight: 23,
      fontWeight: '500',
      marginBottom: 12,
    },
    bodyLast: { marginBottom: 0 },
  });
}
