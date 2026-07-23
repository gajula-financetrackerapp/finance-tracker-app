import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { ACCOUNT_ICONS, ACCOUNT_TYPES } from '../constants';
import { resolveDefaultAccountId } from '../cashBooks';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { fmt } from '../theme';
import { uid } from '../utils';
import type { Account } from '../types';

type Draft = {
  id: string;
  name: string;
  type: string;
  icon: string;
  amount: string;
  excluded: boolean;
  isNew: boolean;
};

function emptyDraft(currencyIcon = '💵'): Draft {
  return {
    id: uid(),
    name: '',
    type: 'Cash',
    icon: currencyIcon,
    amount: '0',
    excluded: false,
    isNew: true,
  };
}

function fromAccount(a: Account): Draft {
  return {
    id: a.id,
    name: a.name,
    type: a.type || 'Cash',
    icon: a.icon || '💵',
    amount: String(a.amount ?? 0),
    excluded: !!a.excluded,
    isNew: false,
  };
}

export function AccountsScreen() {
  const {
    theme,
    config,
    finance,
    activeBook,
    upsertAccount,
    deleteAccount,
    setDefaultAccountId,
  } = useApp();
  const insets = useSafeAreaInsets();

  const defaultId = resolveDefaultAccountId(finance);
  const [draft, setDraft] = useState<Draft | null>(null);

  const totalVisible = useMemo(
    () =>
      finance.accounts
        .filter((a) => !a.excluded)
        .reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [finance.accounts],
  );

  const openCreate = () => setDraft(emptyDraft());
  const openEdit = (a: Account) => setDraft(fromAccount(a));
  const closeEditor = () => setDraft(null);

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter an account name.');
      return;
    }
    const amount = Number(draft.amount);
    if (Number.isNaN(amount)) {
      Alert.alert('Invalid balance', 'Enter a valid number for balance.');
      return;
    }
    await upsertAccount({
      id: draft.id,
      name,
      type: draft.type || 'Cash',
      currency: config.currency,
      amount,
      icon: draft.icon || '💵',
      excluded: draft.excluded,
    });
    if (draft.isNew && finance.accounts.length === 0) {
      await setDefaultAccountId(draft.id);
    }
    closeEditor();
  };

  const confirmDelete = (a: Account) => {
    if (finance.accounts.length <= 1) {
      Alert.alert('Cannot delete', 'Keep at least one account.');
      return;
    }
    Alert.alert(
      'Delete account',
      `Delete “${a.name}”? Transactions linked to it will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteAccount(a.id);
            if (draft?.id === a.id) closeEditor();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>Accounts</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Wallets inside {activeBook.icon} {activeBook.name}. Used when you add income or expense.
          </Text>
          <Text style={[styles.total, { color: theme.ink }]}>
            Visible total: {fmt(totalVisible, config.currency)}
          </Text>
        </Card>

        {finance.accounts.map((a) => {
          const isDefault = a.id === defaultId;
          return (
            <Card key={a.id}>
              <Pressable onPress={() => openEdit(a)} style={styles.row}>
                <Text style={styles.icon}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.ink }]}>
                    {a.name}
                    {isDefault ? ' (default)' : ''}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {a.type}
                    {a.excluded ? ' · Hidden from totals' : ''}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: theme.ink }]}>
                  {fmt(a.amount, a.currency || config.currency)}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                {!isDefault ? (
                  <Pressable onPress={() => void setDefaultAccountId(a.id)}>
                    <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 12 }}>
                      Set default
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 12 }}>Default</Text>
                )}
                <Pressable onPress={() => openEdit(a)}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 12 }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(a)}>
                  <Text style={{ color: theme.red, fontWeight: '700', fontSize: 12 }}>Delete</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}

        <PrimaryButton title="+ Add account" onPress={openCreate} />
      </ScrollView>

      <Modal
        visible={!!draft}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: theme.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.line, paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable onPress={closeEditor} hitSlop={8}>
              <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>
              {draft?.isNew ? 'New account' : 'Edit account'}
            </Text>
            <Pressable onPress={() => void saveDraft()} hitSlop={8}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 15 }}>Save</Text>
            </Pressable>
          </View>

          {draft ? (
            <ScrollView
              contentContainerStyle={[styles.modalBody, { paddingBottom: 24 + insets.bottom }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {/* Name + Balance first so they stay above the keypad */}
              <Text style={[styles.label, { color: theme.muted, marginTop: 0 }]}>Name</Text>
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                placeholder="e.g. Cash, HDFC, Paytm"
                placeholderTextColor={theme.muted}
                style={[styles.input, { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card }]}
              />

              <Text style={[styles.label, { color: theme.muted }]}>Balance</Text>
              <TextInput
                value={draft.amount}
                onChangeText={(amount) => setDraft({ ...draft, amount })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.muted}
                style={[styles.input, { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card }]}
              />

              <Text style={[styles.label, { color: theme.muted }]}>Type</Text>
              <View style={styles.chipWrap}>
                {ACCOUNT_TYPES.map((t) => {
                  const on = draft.type === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setDraft({ ...draft, type: t })}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? theme.primary : theme.line,
                          backgroundColor: on ? theme.bg : theme.card,
                        },
                      ]}
                    >
                      <Text style={{ color: theme.ink, fontWeight: on ? '800' : '600', fontSize: 12 }}>
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: theme.muted }]}>Icon</Text>
              <View style={styles.chipWrap}>
                {ACCOUNT_ICONS.map((ic) => {
                  const on = draft.icon === ic;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setDraft({ ...draft, icon: ic })}
                      style={[
                        styles.iconChip,
                        {
                          borderColor: on ? theme.primary : theme.line,
                          backgroundColor: on ? theme.bg : theme.card,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 18 }}>{ic}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.toggleTitle, { color: theme.ink }]}>Hide from totals</Text>
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          'Hide from totals',
                          'When on, this account is still available for transactions, but its balance is excluded from the visible Accounts total.\n\nUseful for loans, investments, or wallets you want to track separately.',
                        )
                      }
                      hitSlop={10}
                      accessibilityLabel="Hide from totals info"
                    >
                      <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '700' }}>ⓘ</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    Excluded accounts stay usable but skip the visible total.
                  </Text>
                </View>
                <Switch
                  value={draft.excluded}
                  onValueChange={(excluded) => setDraft({ ...draft, excluded })}
                  trackColor={{ false: theme.line, true: theme.primary }}
                  thumbColor="#fff"
                />
              </View>
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 10, fontSize: 13 },
  total: { fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 28 },
  name: { fontWeight: '800', fontSize: 16 },
  amount: { fontWeight: '800', fontSize: 15 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontWeight: '800', fontSize: 16 },
  modalBody: { padding: 16 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '700',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  toggleTitle: { fontWeight: '800', fontSize: 14 },
});
