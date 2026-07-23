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
import { PrimaryButton, Screen } from '../components/ui';
import {
  CATEGORY_ICON_CHOICES,
  type CategoryDef,
  type CategoryKind,
} from '../categories/defaults';
import { theme as pulse } from '../theme';
import { requireAuthToSave } from '../authGate';

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
  } = useApp();

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
      color: pulse.accent,
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
      Alert.alert('Protected', 'The Others category cannot be deleted.');
      return;
    }
    Alert.alert(
      'Delete category',
      `Remove “${cat.name}”? Transactions using it will move to Others (or another category).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const err = await deleteCategory(tab, cat.name);
            if (err) Alert.alert('Could not delete', err);
          },
        },
      ],
    );
  };

  const onSaveEditor = async () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter a category name.');
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
      Alert.alert('Could not save', err);
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
              {k === 'expense' ? 'Expenses' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.hint}>
            Tap a category to edit. Add your own or delete unused ones. Changes sync to your
            account when signed in.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.rowMain} onPress={() => openEdit(item)}>
              <View style={[styles.iconBubble, { backgroundColor: item.color + '33' }]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>Tap to edit</Text>
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
                Delete
              </Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <PrimaryButton title={`+ Add ${tab} category`} onPress={openAdd} />
            <Pressable
              style={styles.resetBtn}
              onPress={() => {
                if (!requireAuthToSave('reset categories')) return;
                Alert.alert(
                  'Reset categories',
                  `Restore default ${tab} categories? Your custom ones in this tab will be replaced.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => void resetCategoriesToDefault(tab),
                    },
                  ],
                );
              }}
            >
              <Text style={styles.resetText}>Reset {tab} defaults</Text>
            </Pressable>
          </View>
        }
      />

      <Modal visible={!!editor} animationType="slide" transparent onRequestClose={() => setEditor(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editor?.mode === 'add' ? 'Add category' : 'Edit category'}
            </Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={editor?.name || ''}
              onChangeText={(t) => setEditor((e) => (e ? { ...e, name: t } : e))}
              placeholder="Category name"
              placeholderTextColor={pulse.muted}
              style={styles.input}
              autoCapitalize="words"
            />
            <Text style={styles.label}>Icon</Text>
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
                title={saving ? 'Saving…' : 'Save'}
                onPress={() => {
                  if (!saving) void onSaveEditor();
                }}
              />
              <Pressable style={styles.cancelBtn} onPress={() => setEditor(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: pulse.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pulse.line,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: pulse.header },
  tabText: { fontWeight: '800', color: pulse.muted },
  tabTextOn: { color: '#fff' },
  list: { padding: 16, paddingBottom: 40 },
  hint: { color: pulse.muted, marginBottom: 12, lineHeight: 20, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: pulse.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: pulse.line,
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
  name: { fontWeight: '800', color: pulse.ink, fontSize: 15 },
  sub: { color: pulse.muted, fontSize: 12, marginTop: 2 },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  deleteText: { color: pulse.red, fontWeight: '800', fontSize: 13 },
  footer: { marginTop: 12, gap: 10 },
  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  resetText: { color: pulse.muted, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: pulse.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontWeight: '900', fontSize: 18, color: pulse.ink, marginBottom: 14 },
  label: {
    color: pulse.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: pulse.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: pulse.ink,
    marginBottom: 12,
  },
  iconPick: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pulse.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#fff',
  },
  iconPickOn: { borderColor: pulse.header, backgroundColor: pulse.accentSoft },
  modalActions: { gap: 10, marginTop: 4 },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: pulse.line,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: pulse.ink },
});
