import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { showAppDialog, showAppInfo } from '../appDialog';
import { uid } from '../utils';
import { useT } from '../i18n/useT';
import type { ShoppingColumn, ShoppingItem, ThemeTokens } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: ShoppingItem[];
  onPatch: (id: string, patch: Partial<ShoppingItem>) => void;
};

const COL_TICK = 38;
const COL_NO = 30;
const COL_QTY = 64;
const COL_UNIT = 58;
const COL_NAME_MIN = 104;
const COL_CUSTOM = 118;
const TABLE_PAD = 12;

/**
 * The buy list as a table: every item on one line, a column at a time.
 *
 * The list itself is a stack of cards, which reads well while shopping but
 * hides how the items compare. The built-in columns are sized to the screen
 * so nothing has to be dragged into view; only a column the user adds can
 * push the table wider than the phone, and only then does it scroll.
 *
 * The tick is the one thing that can be changed from either place, because
 * ticking things off is what the list is for. Name, quantity and unit are
 * edited on the card; the cells of a user's own column are typed into here.
 */
export function ShoppingDetailedView({ visible, onClose, items, onPatch }: Props) {
  const { theme, config, updateConfig } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');

  const columns = config.shoppingColumns || [];

  const closeAdd = () => {
    setAdding(false);
    setDraftName('');
  };

  const addColumn = async () => {
    const name = draftName.trim();
    if (!name) return;
    const taken = columns.some((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (taken) {
      showAppInfo(t('shop.addColumn'), t('shop.columnExists'), '⚠️');
      return;
    }
    const next: ShoppingColumn[] = [...columns, { id: uid(), name }];
    await updateConfig({ shoppingColumns: next });
    closeAdd();
  };

  const removeColumn = (col: ShoppingColumn) => {
    showAppDialog({
      title: t('shop.deleteColumnTitle'),
      message: t('shop.deleteColumnBody').replace('{name}', col.name),
      icon: '🗑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void updateConfig({ shoppingColumns: columns.filter((c) => c.id !== col.id) });
            // Nothing should be left behind in a column nobody can see.
            items.forEach((item) => {
              if (!item.extra || !(col.id in item.extra)) return;
              const extra = { ...item.extra };
              delete extra[col.id];
              onPatch(item.id, { extra });
            });
          },
        },
      ],
    });
  };

  const setCell = (item: ShoppingItem, colId: string, value: string) => {
    onPatch(item.id, { extra: { ...(item.extra || {}), [colId]: value } });
  };

  // Name takes whatever the screen has left, so the four built-in columns fit
  // without dragging. Added columns eat into it until it hits its floor, and
  // the table starts scrolling from there.
  const fixed = COL_TICK + COL_NO + COL_QTY + COL_UNIT + columns.length * COL_CUSTOM;
  const nameWidth = Math.max(COL_NAME_MIN, windowWidth - TABLE_PAD * 2 - fixed);
  const tableWidth = fixed + nameWidth;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('shop.detailedTitle')}</Text>
            <Text style={styles.sub}>{t('shop.detailedSub')}</Text>
          </View>
          {/* Pinned here, not at the end of the header row: out there it sat
              past the edge of the screen once a column or two was added. */}
          <Pressable
            style={styles.plusBtn}
            onPress={() => setAdding((open) => !open)}
            accessibilityLabel={t('shop.addColumn')}
            hitSlop={8}
          >
            <Text style={styles.plusText}>＋</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </Pressable>
        </View>

        {adding ? (
          <View style={styles.addPanel}>
            <Text style={styles.addLabel}>{t('shop.columnName')}</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('shop.columnPlaceholder')}
              placeholderTextColor={theme.muted}
              style={styles.addInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void addColumn()}
            />
            <View style={styles.addActions}>
              <Pressable style={styles.ghostBtn} onPress={closeAdd}>
                <Text style={styles.ghostText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable style={styles.addBtn} onPress={() => void addColumn()}>
                <Text style={styles.addBtnText}>{t('common.add')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ padding: TABLE_PAD }}
        >
          <View style={{ width: tableWidth }}>
            <View style={styles.headRow}>
              <View style={{ width: COL_TICK }} />
              <Text style={[styles.headCell, { width: COL_NO }]}>{t('shop.colNo')}</Text>
              <Text style={[styles.headCell, { width: nameWidth }]}>{t('shop.itemName')}</Text>
              <Text style={[styles.headCell, { width: COL_QTY }]}>{t('shop.quantity')}</Text>
              <Text style={[styles.headCell, { width: COL_UNIT }]}>{t('shop.unit')}</Text>
              {columns.map((col) => (
                <Pressable
                  key={col.id}
                  style={{ width: COL_CUSTOM }}
                  onLongPress={() => removeColumn(col)}
                >
                  <Text style={styles.headCell} numberOfLines={1}>
                    {col.name}
                  </Text>
                  <Text style={styles.headHint}>{t('shop.holdToRemove')}</Text>
                </Pressable>
              ))}
            </View>

            <ScrollView
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 220 }}
            >
              {items.length === 0 ? (
                <Text style={styles.empty}>{t('shop.emptyTitle')}</Text>
              ) : (
                items.map((item, index) => (
                  <View key={item.id} style={[styles.row, item.bought && styles.rowPicked]}>
                    <View style={{ width: COL_TICK }}>
                      <Pressable
                        style={[styles.tick, item.bought && styles.tickOn]}
                        onPress={() => onPatch(item.id, { bought: !item.bought })}
                        hitSlop={6}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: item.bought }}
                        accessibilityLabel={item.name}
                      >
                        {item.bought ? <Text style={styles.tickMark}>✓</Text> : null}
                      </Pressable>
                    </View>
                    <Text style={[styles.cell, styles.cellMuted, { width: COL_NO }]}>
                      {index + 1}
                    </Text>
                    <Text
                      style={[
                        styles.cell,
                        styles.cellName,
                        item.bought && styles.cellStruck,
                        { width: nameWidth },
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <Text style={[styles.cell, { width: COL_QTY }]} numberOfLines={1}>
                      {item.qty || '—'}
                    </Text>
                    <Text style={[styles.cell, { width: COL_UNIT }]} numberOfLines={1}>
                      {item.unit || '—'}
                    </Text>
                    {columns.map((col) => (
                      <View key={col.id} style={{ width: COL_CUSTOM, paddingHorizontal: 4 }}>
                        <TextInput
                          value={item.extra?.[col.id] || ''}
                          onChangeText={(v) => setCell(item, col.id, v)}
                          placeholder="—"
                          placeholderTextColor={theme.muted}
                          style={styles.cellInput}
                        />
                      </View>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    title: { color: theme.ink, fontSize: 20, fontWeight: '800' },
    sub: { color: theme.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
    closeBtn: {
      backgroundColor: theme.card,
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    closeText: { color: theme.ink, fontWeight: '800', fontSize: 12 },
    addPanel: {
      marginHorizontal: 16,
      marginBottom: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderWidth: 1.5,
      borderColor: theme.line,
    },
    addLabel: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    addInput: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.ink,
      fontSize: 15,
    },
    addActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
    ghostBtn: { paddingHorizontal: 14, paddingVertical: 9 },
    ghostText: { color: theme.muted, fontWeight: '800', fontSize: 13 },
    addBtn: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    headRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingBottom: 8,
      borderBottomWidth: 1.5,
      borderBottomColor: theme.line,
    },
    headCell: {
      color: theme.muted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      paddingHorizontal: 4,
    },
    headHint: { color: theme.muted, fontSize: 9, paddingHorizontal: 4, opacity: 0.7 },
    plusBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plusText: { color: theme.primary, fontSize: 20, fontWeight: '800', lineHeight: 24 },
    tick: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tickOn: { backgroundColor: theme.primary, borderColor: theme.primary },
    tickMark: { color: '#fff', fontWeight: '900', fontSize: 13 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.line,
    },
    rowPicked: { opacity: 0.55 },
    cell: { color: theme.ink, fontSize: 13, paddingHorizontal: 4 },
    cellMuted: { color: theme.muted, fontWeight: '700' },
    cellName: { fontWeight: '700' },
    cellStruck: { textDecorationLine: 'line-through' },
    cellInput: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      color: theme.ink,
      fontSize: 13,
      backgroundColor: theme.card,
    },
    empty: { color: theme.muted, fontSize: 13, paddingVertical: 24 },
  });
}
