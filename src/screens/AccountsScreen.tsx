import React, { useMemo, useState } from 'react';
import {
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
import { ACCOUNT_ICONS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from '../constants';
import {
  CORE_BANK_NAME,
  CORE_CARD_NAME,
  isCoreBankAccount,
  isCoreCardAccount,
  resolveDefaultAccountId,
  sortAccountsForDisplay,
} from '../cashBooks';
import { Card, PrimaryButton, Screen } from '../components/ui';
import { fmt } from '../theme';
import { monthKey, uid } from '../utils';
import {
  accountBalance,
  accountExistingAmount,
  accountMonthExpense,
  accountMonthIncome,
  accountMonthlyBalances,
  accountOpening,
  openingFromDesiredLive,
} from '../utils/accountBalance';
import type { Account } from '../types';
import { useT } from '../i18n/useT';

function monthBalanceLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

type Draft = {
  id: string;
  name: string;
  type: string;
  icon: string;
  /** New accounts only: starting balance before tracked txns. */
  startingBalance: string;
  excluded: boolean;
  isNew: boolean;
};

function emptyDraft(currencyIcon = '💵'): Draft {
  return {
    id: uid(),
    name: '',
    type: 'Bank',
    icon: currencyIcon,
    startingBalance: '0',
    excluded: false,
    isNew: true,
  };
}

function fromAccount(a: Account): Draft {
  return {
    id: a.id,
    name: a.name,
    type: a.type || 'Bank',
    icon: a.icon || '💵',
    startingBalance: '0',
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
  const [openMonthly, setOpenMonthly] = useState<Record<string, boolean>>({});

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
    setDraft(fromAccount(a));
  };
  const closeEditor = () => setDraft(null);

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      showAppInfo(t('common.nameRequired'), 'Enter an account name.', '⚠️');
      return;
    }

    const nameKey = name.toLowerCase();
    const sameName = finance.accounts.find((a) => a.name.trim().toLowerCase() === nameKey);

    // Edit existing account — never rewrite balance/opening from a typed "existing".
    if (!draft.isNew) {
      if (sameName && sameName.id !== draft.id) {
        showAppInfo(
          t('accounts.duplicateTitle'),
          t('accounts.duplicateBody').replace('{name}', sameName.name),
          '⚠️',
        );
        return;
      }
      const current = finance.accounts.find((a) => a.id === draft.id);
      const opening = current ? accountOpening(current, txns) : 0;
      const live = current ? accountBalance(current, txns) : opening;
      const candidate = { name, type: draft.type };
      const lockedType = isCoreCardAccount(candidate)
        ? 'Card'
        : isCoreBankAccount(candidate)
          ? 'Bank'
          : draft.type || 'Bank';
      await upsertAccount({
        id: draft.id,
        name,
        type: lockedType,
        currency: config.currency,
        openingBalance: opening,
        amount: live,
        icon: draft.icon || '💵',
        excluded: draft.excluded,
      });
      closeEditor();
      return;
    }

    const starting = Number(draft.startingBalance);
    if (Number.isNaN(starting)) {
      showAppInfo('Invalid amount', 'Enter a valid starting balance.', '⚠️');
      return;
    }

    // New account with a name that already exists → add starting into that account.
    if (sameName) {
      const prevLive = accountBalance(sameName, txns);
      const desiredLive = prevLive + starting;
      const opening = openingFromDesiredLive(sameName.id, desiredLive, txns);
      await upsertAccount({
        id: sameName.id,
        name: sameName.name,
        type: draft.type || sameName.type || 'Bank',
        currency: sameName.currency || config.currency,
        openingBalance: opening,
        amount: desiredLive,
        icon: draft.icon || sameName.icon || '💵',
        excluded: draft.excluded,
      });
      showAppInfo(
        t('accounts.mergedTitle'),
        t('accounts.mergedBody')
          .replace('{name}', sameName.name)
          .replace('{amount}', fmt(starting, config.currency)),
        '✅',
      );
      closeEditor();
      return;
    }

    await upsertAccount({
      id: draft.id,
      name,
      type: draft.type || 'Bank',
      currency: config.currency,
      openingBalance: starting,
      amount: starting,
      icon: draft.icon || '💵',
      excluded: draft.excluded,
    });
    closeEditor();
  };

  const confirmDelete = (a: Account) => {
    if (isCoreBankAccount(a)) {
      showAppInfo(
        `Keep ${CORE_BANK_NAME}`,
        'This account can’t be deleted — it’s used in Received in for salary/UPI.',
        'ℹ️',
      );
      return;
    }
    if (isCoreCardAccount(a)) {
      showAppInfo(
        `Keep ${CORE_CARD_NAME}`,
        'Credit Card can’t be deleted — it keeps card spends out of the bank account.',
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
      finance.accounts.find((x) => x.id !== a.id && isCoreBankAccount(x)) ||
      finance.accounts.find((x) => x.id !== a.id && !x.excluded) ||
      finance.accounts.find((x) => x.id !== a.id);
    const keepName = fallback?.name || CORE_BANK_NAME;
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
          const monthExpense = accountMonthExpense(a.id, txns, thisMonth);
          const existing = accountExistingAmount(a, txns, thisMonth);
          return (
            <Card key={a.id}>
              <Pressable onPress={() => openEdit(a)} style={styles.row}>
                <Text style={styles.icon}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.ink }]}>
                    {a.name}
                    {isDefault ? ` (${t('accounts.default')})` : ''}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                    {ACCOUNT_TYPE_LABELS[a.type || ''] || a.type}
                    {a.excluded ? ' · Hidden' : ''}
                  </Text>
                </View>
                <View style={styles.amountCol}>
                  <Text style={[styles.amountCaption, { color: theme.muted }]}>
                    {t('accounts.existingPlusMonth')}
                  </Text>
                  <Text style={[styles.amount, { color: live < 0 ? theme.red : theme.ink }]}>
                    {fmt(live, cur)}
                  </Text>
                </View>
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
                <View style={[styles.amountSplitDivider, { backgroundColor: theme.line }]} />
                <View style={styles.amountSplitCell}>
                  <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                    {t('accounts.monthExpense')}
                  </Text>
                  <Text style={[styles.amountSplitValue, { color: theme.red }]}>
                    −{fmt(monthExpense, cur)}
                  </Text>
                </View>
              </View>

              {(() => {
                const monthly = accountMonthlyBalances(a, txns, thisMonth);
                const expanded = !!openMonthly[a.id];
                return (
                  <View style={[styles.monthlyBlock, { borderTopColor: theme.line }]}>
                    <Pressable
                      onPress={() =>
                        setOpenMonthly((prev) => ({ ...prev, [a.id]: !prev[a.id] }))
                      }
                      style={styles.monthlyToggle}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                    >
                      <Text style={[styles.monthlyToggleText, { color: theme.ink }]}>
                        {t('accounts.monthlyBalance')}
                      </Text>
                      <Text style={[styles.monthlyChevron, { color: theme.muted }]}>
                        {expanded ? '▼' : '›'}
                      </Text>
                    </Pressable>
                    {expanded ? (
                      monthly.length === 0 ? (
                        <Text style={[styles.monthlyEmpty, { color: theme.muted }]}>
                          {t('accounts.monthlyBalanceEmpty')}
                        </Text>
                      ) : (
                        <View style={styles.monthlyList}>
                          {monthly.map((row) => (
                            <View key={row.month} style={styles.monthlyRow}>
                              <Text style={[styles.monthlyMonth, { color: theme.muted }]}>
                                {t('accounts.monthlyBalanceTill').replace(
                                  '{month}',
                                  monthBalanceLabel(row.month),
                                )}
                              </Text>
                              <Text
                                style={[
                                  styles.monthlyAmount,
                                  { color: row.balance < 0 ? theme.red : theme.ink },
                                ]}
                              >
                                {fmt(row.balance, cur)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )
                    ) : null}
                  </View>
                );
              })()}

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
        {orderedAccounts.some((a) => !isCoreBankAccount(a) && !isCoreCardAccount(a)) ? (
          <Pressable
            onPress={() => {
              showAppDialog({
                title: t('accounts.keepCashBank'),
                message: `Remove extra accounts (HDFC, Wallet, etc.). Keep ${CORE_BANK_NAME} and ${CORE_CARD_NAME}. Their incomes and expenses will move to ${CORE_BANK_NAME}.`,
                icon: '🏦',
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

              {draft.isNew ? (
                <>
                  <Text style={[styles.label, { color: theme.muted }]}>
                    {t('accounts.startingBalance')}
                  </Text>
                  <TextInput
                    value={draft.startingBalance}
                    onChangeText={(startingBalance) => setDraft({ ...draft, startingBalance })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.muted}
                    style={[
                      styles.input,
                      { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card },
                    ]}
                  />
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                    {t('accounts.startingBalanceHint')}
                  </Text>
                </>
              ) : (
                (() => {
                  const current = finance.accounts.find((a) => a.id === draft.id);
                  if (!current) return null;
                  const cur = current.currency || config.currency;
                  const existing = accountExistingAmount(current, txns, thisMonth);
                  const monthIncome = accountMonthIncome(current.id, txns, thisMonth);
                  const monthExpense = accountMonthExpense(current.id, txns, thisMonth);
                  const live = accountBalance(current, txns);
                  return (
                    <View
                      style={[
                        styles.breakdown,
                        { backgroundColor: theme.card, borderColor: theme.line },
                      ]}
                    >
                      <Text style={[styles.label, { color: theme.muted, marginTop: 0 }]}>
                        {t('accounts.existing')}
                      </Text>
                      <Text
                        style={{
                          color: existing < 0 ? theme.red : theme.ink,
                          fontSize: 20,
                          fontWeight: '800',
                        }}
                      >
                        {fmt(existing, cur)}
                      </Text>
                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 12,
                          marginTop: 8,
                          lineHeight: 17,
                        }}
                      >
                        {t('accounts.existingReadonly')}
                      </Text>
                      <Text
                        style={{
                          color: theme.ink,
                          fontSize: 13,
                          lineHeight: 20,
                          fontWeight: '600',
                          marginTop: 10,
                        }}
                      >
                        {t('accounts.monthIncome')} +{fmt(monthIncome, cur)}
                        {'  ·  '}
                        {t('accounts.monthExpense')} −{fmt(monthExpense, cur)}
                        {'  ·  '}
                        {t('accounts.inAccount')} {fmt(live, cur)}
                      </Text>
                    </View>
                  );
                })()
              )}

              <Text style={[styles.label, { color: theme.muted }]}>{t('common.type')}</Text>
              <View style={styles.chipWrap}>
                {ACCOUNT_TYPES.map((typeName) => {
                  const on = draft.type === typeName;
                  return (
                    <Pressable
                      key={typeName}
                      onPress={() => setDraft({ ...draft, type: typeName })}
                      style={[
                        styles.chip,
                        {
                          borderColor: on ? theme.primary : theme.line,
                          backgroundColor: on ? theme.bg : theme.card,
                        },
                      ]}
                    >
                      <Text
                        style={{ color: theme.ink, fontWeight: on ? '800' : '600', fontSize: 12 }}
                      >
                        {ACCOUNT_TYPE_LABELS[typeName] || typeName}
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
  amountCol: { alignItems: 'flex-end', maxWidth: '46%' },
  amountCaption: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'right',
  },
  amount: { fontSize: 14, fontWeight: '800' },
  amountSplit: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  amountSplitCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  amountSplitLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  amountSplitValue: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  amountSplitDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  monthlyBlock: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  monthlyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  monthlyToggleText: { fontSize: 13, fontWeight: '800' },
  monthlyChevron: { fontSize: 16, fontWeight: '700' },
  monthlyList: { marginTop: 8, gap: 6 },
  monthlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthlyMonth: { fontSize: 13, fontWeight: '600' },
  monthlyAmount: { fontSize: 13, fontWeight: '800' },
  monthlyEmpty: { fontSize: 12, marginTop: 8, fontWeight: '600' },
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
