import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORY_ICON_CHOICES } from '../categories/defaults';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

type Props = {
  visible: boolean;
  current: string;
  onClose: () => void;
  onPick: (icon: string) => void;
};

/** Pick a new emoji for a category, from a transaction row or its details. */
export function CategoryIconPicker({ visible, current, onClose, onPick }: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const icons = useMemo(() => {
    const set = new Set(CATEGORY_ICON_CHOICES);
    if (current) set.add(current);
    return Array.from(set);
  }, [current]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.title}>{t('home.changeCategoryIcon')}</Text>
          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
          >
            {icons.map((ic) => (
              <Pressable
                key={ic}
                style={[styles.cell, current === ic && styles.cellOn]}
                onPress={() => onPick(ic)}
              >
                <Text style={styles.emoji}>{ic}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 16,
      maxHeight: '70%',
    },
    title: { fontWeight: '900', fontSize: 18, color: theme.ink, marginBottom: 12 },
    gridScroll: { maxHeight: 280 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
    cell: {
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
    },
    cellOn: { borderColor: theme.header, backgroundColor: theme.accentSoft },
    emoji: { fontSize: 24 },
    cancel: {
      marginTop: 8,
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelText: { fontWeight: '700', color: theme.ink },
  });
}
