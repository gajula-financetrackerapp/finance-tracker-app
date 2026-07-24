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
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { ACCOUNT_ICONS, ACCOUNT_TYPES } from '../constants';
import { resolveDefaultAccountId, sortAccountsForDisplay } from '../cashBooks';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { fmt } from '../theme';
import { monthKey, uid } from '../utils';
import {
  accountBalance,
  accountExistingAmount,
  accountMonthIncome,
  openingFromDesiredLive,
} from '../utils/accountBalance';
import type { Account, Transaction } from '../types';
import { useT } from '../i18n/useT';

type Draft = {
  id: string;
  name: string;
  type: string;
  icon: string;
  /** Current / live balance the user sees and edits. */
  balance: string;
  excluded: boolean;
  isNew: boolean;
};

function emptyDraft(currencyIcon = '💵'): Draft {
  return {
    id: uid(),
    name: '',
    type: 'Cash',
    icon: currencyIcon,
    balance: '0',
    excluded: false,
    isNew: true,
  };
}

function fromAccount(a: Account, transactions: Transaction[], month: string): Draft {
  return {
    id: a.id,
    name: a.name,
    type: a.type || 'Cash',
    icon: a.icon || '💵',
    balance: String(accountExistingAmount(a, transactions, month)),
    excluded: !!a.excluded,
    isNew: false,
  };
}

export function AccountsScreen() {
  const {
    theme,
    config,
    finance,
    upsertAccount,
    deleteAccount,
    keepOnlyCashAccount,
  } = useApp();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const txns = finance.transactions;
  const thisMonth = monthKey();

  const defaultId = resolveDefaultAccountId(finance);
  const [draft, setDraft] = useState<Draft | null>(null);

  const orderedAccounts = useMemo(
    () => sortAccountsForDisplay(finance.accounts),
    [finance.accounts],
  );

  const totalVisible = useMemo(
    () =>
      finance.accounts
        .filter((a) => !a.excluded)
        .reduce((s, a) => s + accountBalance(a, txns), 0),
    [finance.accounts, txns],
  );

  const openCreate = () => {
    if (!requireAuthToSave('manage accounts')) return;
    setDraft(emptyDraft());
  };
  const openEdit = (a: Account) => {
    if (!requireAuthToSave('manage accounts')) return;
    setDraft(fromAccount(a, txns, thisMonth));
  };
  const closeEditor = () => setDraft(null);

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      Alert.alert(t('common.nameRequired'), 'Enter an account name.');
      return;
    }
    const existing = Number(draft.balance);
    if (Number.isNaN(existing)) {
      Alert.alert('Invalid amount', 'Enter a valid number.');
      return;
    }
    // Existing amount excludes current-month income (added on Home → Income).
    const monthIncome = draft.isNew ? 0 : accountMonthIncome(draft.id, txns, thisMonth);
    const desiredLive = existing + monthIncome;
    const opening = draft.isNew
      ? existing
      : openingFromDesiredLive(draft.id, desiredLive, txns);
    await upsertAccount({
      id: draft.id,
      name,
      type: draft.type || 'Cash',
      currency: config.currency,
      openingBalance: opening,
      amount: desiredLive,
      icon: draft.icon || '💵',
      excluded: draft.excluded,
    });
    closeEditor();
  };

  const confirmDelete = (a: Account) => {
    if (a.name.trim().toLowerCase() === 'cash') {
      showAppInfo(
        'Keep Cash',
        'Cash is required and can’t be deleted. You can delete extra accounts; Bank is kept for salary/UPI.',
        'ℹ️',
      );
      return;
    }
    if (a.name.trim().toLowerCase() === 'bank') {
      showAppInfo(
        'Keep Bank',
        'Bank can’t be deleted — it’s used in Received in for salary/UPI. Add Card or others with + Add account.',
        'ℹ️',
      );
      return;
    }
    if (finance.accounts.length <= 1) {
      showAppInfo(
        'Need at least one account',
        'Keep at least one account for incomes and expenses.',
        'ℹ️',
      );
      return;
    }
    const fallback =
      finance.accounts.find((x) => x.id !== a.id && x.name.trim().toLowerCase() === 'cash') ||
      finance.accounts.find((x) => x.id !== a.id && !x.excluded) ||
      finance.accounts.find((x) => x.id !== a.id);
    const keepName = fallback?.name || 'Cash';
    showAppDialog({
      title: 'Delete account?',
      message: `Remove “${a.name}”? Incomes and expenses move to “${keepName}”.`,
      icon: '🗑',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void deleteAccount(a.id);
            if (draft?.id === a.id) closeEditor();
          },
        },
      ],
    });
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>{t('accounts.title')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('accounts.hint')}</Text>
          <Text style={[styles.total, { color: theme.ink }]}>
            {t('accounts.total')} {fmt(totalVisible, config.currency)}
          </Text>
        </Card>

        {orderedAccounts.map((a) => {
          const isDefault = a.id === defaultId;
          const cur = a.currency || config.currency;
          const live = accountBalance(a, txns);
          const monthIncome = accountMonthIncome(a.id, txns, thisMonth);
          const existing = accountExistingAmount(a, txns, thisMonth);
          return (
            <Card key={a.id}>
              <Pressable onPress={() => openEdit(a)} style={styles.row}>
                <Text style={styles.icon}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.ink }]}>
                    {a.name}
                    {isDefault ? ` · ${t('accounts.default')}` : ''}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {a.type}
                    {a.excluded ? ' · Hidden' : ''}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: live < 0 ? theme.red : theme.ink }]}>
                  {fmt(live, cur)}
                </Text>
              </Pressable>

              <View style={[styles.amountSplit, { borderTopColor: theme.line }]}>
                <View style={styles.amountSplitCell}>
                  <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                    {t('accounts.existing')}
                  </Text>
                  <Text
                    style={[
                      styles.amountSplitValue,
                      { color: existing < 0 ? theme.red : theme.ink },
                    ]}
                  >
                    {fmt(existing, cur)}
                  </Text>
                </View>
                <View style={[styles.amountSplitDivider, { backgroundColor: theme.line }]} />
                <View style={styles.amountSplitCell}>
                  <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                    {t('accounts.monthIncome')}
                  </Text>
                  <Text style={[styles.amountSplitValue, { color: theme.green }]}>
                    +{fmt(monthIncome, cur)}
                  </Text>
                </View>
              </View>

              <View style={[styles.actions, { borderTopColor: theme.line }]}>
                {isDefault ? (
                  <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 12, flex: 1 }}>
                    {t('accounts.default')}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <Pressable onPress={() => openEdit(a)}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 12 }}>
                    {t('home.edit')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(a)}>
                  <Text style={{ color: theme.red, fontWeight: '700', fontSize: 12 }}>
                    {t('accounts.delete')}
                  </Text>
                </Pressable>
              </View>
            </Card>
          );
        })}

        <PrimaryButton title={t('accounts.add')} onPress={openCreate} />
        {orderedAccounts.some(
          (a) =>
            a.name.trim().toLowerCase() !== 'cash' && a.name.trim().toLowerCase() !== 'bank',
        ) ? (
          <Pressable
            onPress={() => {
              showAppDialog({
                title: t('accounts.keepCashBank'),
                message:
                  'Remove extra accounts (HDFC, Card, etc.). Their incomes and expenses will move to Cash.',
                icon: '💵',
                buttons: [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('accounts.removeExtras'),
                    style: 'destructive',
                    onPress: () => {
                      void keepOnlyCashAccount();
                    },
                  },
                ],
              });
            }}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 13 }}>
              {t('accounts.removeExtrasHint')}
            </Text>
          </Pressable>
        ) : null}
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
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: theme.line, paddingTop: Math.max(insets.top, 12) },
            ]}
          >
            <Pressable onPress={closeEditor} hitSlop={8}>
              <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 15 }}>
                {t('home.cancel')}
              </Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>
              {draft?.isNew ? t('accounts.new') : t('accounts.editTitle')}
            </Text>
            <Pressable onPress={() => void saveDraft()} hitSlop={8}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 15 }}>
                {t('home.save')}
              </Text>
            </Pressable>
          </View>

          {draft ? (
            <ScrollView
              contentContainerStyle={[styles.modalBody, { paddingBottom: 24 + insets.bottom }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Text style={[styles.label, { color: theme.muted, marginTop: 0 }]}>
                {t('common.name')}
              </Text>
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                placeholder={t('accounts.namePlaceholder')}
                placeholderTextColor={theme.muted}
                style={[
                  styles.input,
                  { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card },
                ]}
              />

              <Text style={[styles.label, { color: theme.muted }]}>{t('accounts.existing')}</Text>
              <TextInput
                value={draft.balance}
                onChangeText={(balance) => setDraft({ ...draft, balance })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.muted}
                style={[
                  styles.input,
                  { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card },
                ]}
              />
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                Don’t include current month’s income here — add that on Home → Income (Received in).
              </Text>

              {!draft.isNew ? (
                <View
                  style={[
                    styles.breakdown,
                    { backgroundColor: theme.card, borderColor: theme.line },
                  ]}
                >
                  {(() => {
                    const cur = config.currency;
                    const monthIncome = accountMonthIncome(draft.id, txns, thisMonth);
                    const existing = Number(draft.balance) || 0;
                    return (
                      <Text style={{ color: theme.ink, fontSize: 13, lineHeight: 20, fontWeight: '600' }}>
                        {t('accounts.existing')} {fmt(existing, cur)}
                        {'  ·  '}
                        {t('accounts.monthIncome')} +{fmt(monthIncome, cur)}
                        {'  ·  '}
                        {t('accounts.inAccount')} {fmt(existing + monthIncome, cur)}
                      </Text>
                    );
                  })()}
                </View>
              ) : null}

              <Text style={[styles.label, { color: theme.muted }]}>{t('common.type')}</Text>
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

              <Text style={[styles.label, { color: theme.muted }]}>{t('common.icon')}</Text>
              <View style={styles.chipWrap}>
                {ACCOUNT_ICONS.map((ic) => {
                  const on = draft.icon === ic;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setDraft({ ...draft, icon: ic })}
                      style={[
                        styles.chip,
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

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>{t('accounts.hide')}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    Excluded from the visible total above
                  </Text>
                </View>
                <Switch
                  value={draft.excluded}
                  onValueChange={(excluded) => setDraft({ ...draft, excluded })}
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
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  total: { fontSize: 15, fontWeight: '800', marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 28 },
  name: { fontSize: 16, fontWeight: '800' },
  amount: { fontSize: 16, fontWeight: '800' },
  amountSplit: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  amountSplitCell: { flex: 1, alignItems: 'center' },
  amountSplitLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  amountSplitValue: { fontSize: 13, fontWeight: '800' },
  amountSplitDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalBody: { padding: 16 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  breakdown: {
    marginTop: 14,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
});
