import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CategoryDef } from '../categories/defaults';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { DockedSheet, SystemModal } from './SystemSafeArea';
import type { ThemeTokens } from '../types';

type Props = {
  visible: boolean;
  current: string;
  categories: CategoryDef[];
  onClose: () => void;
  onPick: (name: string) => void;
};

/** Pick a category for one transaction. Only that row’s icon and name change. */
export function CategoryIconPicker({ visible, current, categories, onClose, onPick }: Props) {
  const { theme } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SystemModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <DockedSheet innerPad={16} style={styles.sheet}>
          <Text style={styles.title}>{t('import.pickCategory')}</Text>
          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
          >
            {categories.map((cat) => {
              const on = cat.name === current;
              return (
                <Pressable
                  key={cat.name}
                  style={[styles.cell, on && { borderColor: cat.color, backgroundColor: `${cat.color}26` }]}
                  onPress={() => onPick(cat.name)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${cat.color}22` }]}>
                    <Text style={styles.emoji}>{cat.icon}</Text>
                  </View>
                  <Text style={[styles.label, on && styles.labelOn]} numberOfLines={2}>
                    {catName(cat.name) || cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </DockedSheet>
      </View>
    </SystemModal>
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
      maxHeight: '75%',
    },
    title: { fontWeight: '900', fontSize: 18, color: theme.ink, marginBottom: 12 },
    gridScroll: { maxHeight: 360 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
    cell: {
      width: '23%',
      flexGrow: 1,
      maxWidth: '25%',
      minWidth: 72,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 4,
      backgroundColor: theme.bg,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emoji: { fontSize: 22 },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.muted,
      textAlign: 'center',
    },
    labelOn: { color: theme.ink, fontWeight: '800' },
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
