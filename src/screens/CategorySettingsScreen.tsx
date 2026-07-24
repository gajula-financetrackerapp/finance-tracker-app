import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';
import { PrimaryButton, Screen } from '../components/ui';
import {
  CATEGORY_ICON_CHOICES,
  type CategoryDef,
  type CategoryKind,
} from '../categories/defaults';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { useT } from '../i18n/useT';

type EditorState = {
  mode: 'add' | 'edit';
  kind: CategoryKind;
  originalName?: string;
  name: string;
  icon: string;
  color: string;
};

export function CategorySettingsScreen() {
  const {
    expenseCategories,
    incomeCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    resetCategoriesToDefault,
    theme,
  } = useApp();
  const { t, catName } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [tab, setTab] = useState<CategoryKind>('expense');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const list = tab === 'expense' ? expenseCategories : incomeCategories;

  const openAdd = () => {
    if (!requireAuthToSave('add categories')) return;
    setEditor({
      mode: 'add',
      kind: tab,
      name: '',
      icon: tab === 'income' ? '💼' : '🛍️',
      color: theme.accent,
    });
  };

  const openEdit = (cat: CategoryDef) => {
    if (!requireAuthToSave('edit categories')) return;
    setEditor({
      mode: 'edit',
      kind: tab,
      originalName: cat.name,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
    });
  };

  const onDelete = (cat: CategoryDef) => {
    if (!requireAuthToSave('delete categories')) return;
    if (cat.name === 'Others') {
      showAppInfo(t('categories.protected'), 'The Others category cannot be deleted.', '🔒');
      return;
    }
    showAppDialog({
      title: t('categories.deleteTitle'),
      message: `Remove “${catName(cat.name)}”? Transactions using it will move to Others (or another category).`,
      icon: '🗑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const err = await deleteCategory(tab, cat.name);
            if (err) showAppInfo(t('common.couldNotSave'), err, '⚠️');
          },
        },
      ],
    });
  };

  const onSaveEditor = async () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      Alert.alert(t('common.nameRequired'), 'Enter a category name.');
      return;
    }
    setSaving(true);
    const err =
      editor.mode === 'add'
        ? await addCategory(editor.kind, {
            name,
            icon: editor.icon,
            color: editor.color,
          })
        : await updateCategory(editor.kind, editor.originalName || name, {
            name,
            icon: editor.icon,
            color: editor.color,
          });
    setSaving(false);
    if (err) {
      Alert.alert(t('common.couldNotSave'), err);
      return;
    }
    setEditor(null);
  };

  const iconChoices = useMemo(() => {
    const set = new Set(CATEGORY_ICON_CHOICES);
    if (editor?.icon) set.add(editor.icon);
    return Array.from(set);
  }, [editor?.icon]);

  return (
    <Screen>
      <View style={styles.tabs}>
        {(['expense', 'income'] as CategoryKind[]).map((k) => (
          <Pressable
            key={k}
            style={[styles.tab, tab === k && styles.tabOn]}
            onPress={() => setTab(k)}
          >
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
              {k === 'expense' ? t('home.expenses') : t('home.income')}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.hint}>{t('categories.hint')}</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.rowMain} onPress={() => openEdit(item)}>
              <View style={[styles.iconBubble, { backgroundColor: item.color + '33' }]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{catName(item.name)}</Text>
                <Text style={styles.sub}>{t('categories.tapEdit')}</Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => onDelete(item)}
              hitSlop={8}
              disabled={item.name === 'Others'}
            >
              <Text
                style={[
                  styles.deleteText,
                  item.name === 'Others' && { opacity: 0.35 },
                ]}
              >
                {t('common.delete')}
              </Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <PrimaryButton
              title={tab === 'expense' ? t('categories.addExpense') : t('categories.addIncome')}
              onPress={openAdd}
            />
            <Pressable
              style={styles.resetBtn}
              onPress={() => {
                if (!requireAuthToSave('reset categories')) return;
                showAppDialog({
                  title: t('categories.resetTitle'),
                  message: `Restore default ${tab} categories? Your custom ones in this tab will be replaced.`,
                  icon: '↩️',
                  buttons: [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('categories.reset'),
                      style: 'destructive',
                      onPress: () => void resetCategoriesToDefault(tab),
                    },
                  ],
                });
              }}
            >
              <Text style={styles.resetText}>
                {tab === 'expense' ? t('categories.resetExpense') : t('categories.resetIncome')}
              </Text>
            </Pressable>
          </View>
        }
      />

      <Modal visible={!!editor} animationType="slide" transparent onRequestClose={() => setEditor(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editor?.mode === 'add' ? t('categories.add') : t('categories.edit')}
            </Text>
            <Text style={styles.label}>{t('common.name')}</Text>
            <TextInput
              value={editor?.name || ''}
              onChangeText={(name) => setEditor((e) => (e ? { ...e, name } : e))}
              placeholder={t('categories.namePlaceholder')}
              placeholderTextColor={theme.muted}
              style={styles.input}
              autoCapitalize="words"
            />
            <Text style={styles.label}>{t('common.icon')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {iconChoices.map((ic) => (
                <Pressable
                  key={ic}
                  style={[styles.iconPick, editor?.icon === ic && styles.iconPickOn]}
                  onPress={() => setEditor((e) => (e ? { ...e, icon: ic } : e))}
                >
                  <Text style={{ fontSize: 22 }}>{ic}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <PrimaryButton
                title={saving ? t('common.saving') : t('common.save')}
                onPress={() => {
                  if (!saving) void onSaveEditor();
                }}
              />
              <Pressable style={styles.cancelBtn} onPress={() => setEditor(null)} disabled={saving}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.line,
      padding: 4,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabOn: { backgroundColor: theme.header },
    tabText: { fontWeight: '800', color: theme.muted },
    tabTextOn: { color: '#fff' },
    list: { padding: 16, paddingBottom: 40 },
    hint: { color: theme.muted, marginBottom: 12, lineHeight: 20, fontSize: 13 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.line,
      marginBottom: 8,
      paddingRight: 10,
    },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
    iconBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: { fontSize: 22 },
    name: { fontWeight: '800', color: theme.ink, fontSize: 15 },
    sub: { color: theme.muted, fontSize: 12, marginTop: 2 },
    deleteBtn: { paddingHorizontal: 8, paddingVertical: 10 },
    deleteText: { color: theme.red, fontWeight: '800', fontSize: 13 },
    footer: { marginTop: 12, gap: 10 },
    resetBtn: { alignItems: 'center', paddingVertical: 10 },
    resetText: { color: theme.muted, fontWeight: '700' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
    },
    modalTitle: { fontWeight: '900', fontSize: 18, color: theme.ink, marginBottom: 14 },
    label: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
      color: theme.ink,
      marginBottom: 12,
    },
    iconPick: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: '#fff',
    },
    iconPickOn: { borderColor: theme.header, backgroundColor: theme.accentSoft },
    modalActions: { gap: 10, marginTop: 4 },
    cancelBtn: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelText: { fontWeight: '700', color: theme.ink },
  });
}

