import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { useT } from '../i18n/useT';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CardAboutModal({ visible, onClose }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.top}>
            <Text style={styles.title}>{t('cards.aboutTitle')}</Text>
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
          <Text style={styles.body}>{t('cards.aboutSms')}</Text>
          <Text style={styles.body}>{t('cards.aboutMissing')}</Text>
          <Text style={styles.body}>{t('cards.aboutCycle')}</Text>
          <Text style={[styles.body, styles.bodyLast]}>{t('cards.aboutHome')}</Text>
        </Pressable>
      </Pressable>
    </Modal>
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
    body: {
      color: theme.muted,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '600',
      marginBottom: 12,
    },
    bodyLast: { marginBottom: 0 },
  });
}
