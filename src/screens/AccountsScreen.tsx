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
import { useFinance } from '../FinanceContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import { ACCOUNT_ICONS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from '../constants';
import {
  CORE_BANK_NAME,
  CORE_CARD_NAME,
  accountDeleteBlock,
  accountNameClash,
  oneCardTotals,
  isCoreBankAccount,
  isCoreCardAccount,
  resolveDefaultAccountId,
  sortAccountsForDisplay,
  suggestedCardAccountName,
} from '../cashBooks';
import { Card, PrimaryButton, Screen, choiceLabel, choiceSurface } from '../components/ui';
import { SYSTEM_MODAL_PROPS } from '../components/SystemSafeArea';
import { DropdownSelect } from '../components/DropdownSelect';
import { fmt } from '../theme';
import { monthKey, uid } from '../utils';
import {
  accountBalance,
  accountExistingAmount,
  accountMonthExpense,
  accountMonthIncome,
  accountMonthlyBalances,
  accountOpening,
} from '../utils/accountBalance';
import type { Account } from '../types';
import { useT } from '../i18n/useT';
import { CARD_ISSUER_LABELS, digits4, issuerSlug } from '../lib/importRules/parseDueNotice';

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
  cardIssuer: string;
  cardLast4: string;
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
    cardIssuer: '',
    cardLast4: '',
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
    cardIssuer: a.cardIssuer || '',
    cardLast4: a.cardLast4 || '',
  };
}

function cardLast4Taken(
  accounts: Account[],
  last4: string,
  issuer: string,
  exceptId: string,
): boolean {
  const mine = issuer ? issuerSlug(issuer) : '';
  return accounts.some((a) => {
    if (a.id === exceptId || a.excluded) return false;
    if (!isCoreCardAccount(a)) return false;
    if (digits4(a.cardLast4) !== last4) return false;
    const other = a.cardIssuer ? issuerSlug(a.cardIssuer) : '';
    if (!other || !mine) return true;
    return other === mine;
  });
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
  const { setShowAdd, setEditingTxn, setPendingAddKind, setPendingAddAccountId } = useFinance();
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

  /** Close the editor first — the add form is a modal mounted above the navigator. */
  const openAdd = (accountId: string, kind: 'income' | 'cardBill') => {
    closeEditor();
    setEditingTxn(null);
    setPendingAddKind(kind);
    setPendingAddAccountId(accountId);
    setShowAdd(true);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const isCard = draft.type === 'Card';
    const issuer = isCard ? draft.cardIssuer.trim() : '';
    const last4 = isCard ? digits4(draft.cardLast4) : null;

    if (isCard && draft.isNew) {
      if (!issuer) {
        showAppInfo(t('accounts.cardBank'), t('accounts.cardNeedIssuer'), '💳');
        return;
      }
      if (!last4) {
        showAppInfo(t('accounts.cardLast4'), t('accounts.cardNeedLast4'), '💳');
        return;
      }
    }
    if (isCard && (issuer || last4) && (!issuer || !last4)) {
      showAppInfo(t('accounts.cardBank'), t('accounts.cardNeedBoth'), '💳');
      return;
    }
    if (isCard && last4 && cardLast4Taken(finance.accounts, last4, issuer, draft.id)) {
      showAppInfo(t('accounts.cardLast4'), t('accounts.cardLast4Taken'), '⚠️');
      return;
    }

    const suggested = issuer && last4 ? suggestedCardAccountName(issuer, last4) : '';
    const nameKey = draft.name.trim().toLowerCase();
    const stillDefaultCard = nameKey === 'credit card' || nameKey === 'card';
    let name = draft.name.trim();
    if (isCard && suggested && (!name || stillDefaultCard)) name = suggested;
    if (!name) {
      showAppInfo(t('common.nameRequired'), t('accounts.nameRequiredBody'), '⚠️');
      return;
    }

    // One name, one account, whether you are adding or renaming. Nothing is
    // folded together behind your back — the save simply does not go through.
    const clash = accountNameClash(finance.accounts, name, draft.id);
    if (clash) {
      showAppInfo(
        t('accounts.duplicateTitle'),
        t('accounts.duplicateBody').replace('{name}', clash.name),
        '⚠️',
      );
      return;
    }

    const cardFields = isCard
      ? { cardIssuer: issuer || undefined, cardLast4: last4 || undefined }
      : { cardIssuer: undefined, cardLast4: undefined };

    // Edit existing account — never rewrite balance/opening from a typed "existing".
    if (!draft.isNew) {
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
        ...cardFields,
      });
      closeEditor();
      return;
    }

    const starting = Number(draft.startingBalance);
    if (Number.isNaN(starting)) {
      showAppInfo(t('common.invalidAmount'), t('accounts.startingBalanceInvalid'), '⚠️');
      return;
    }

    await upsertAccount({
      id: draft.id,
      name,
      type: draft.type || 'Bank',
      currency: config.currency,
      openingBalance: starting,
      amount: starting,
      icon: draft.icon || (isCard ? '💳' : '💵'),
      excluded: draft.excluded,
      ...cardFields,
    });
    closeEditor();
  };

  const confirmDelete = (a: Account) => {
    // Spares can go; the last bank and the last card cannot, by any name.
    const blocked = accountDeleteBlock(finance.accounts, a.id);
    if (blocked === 'lastBank') {
      showAppInfo(t('accounts.keepOneBankTitle'), t('accounts.keepOneBankBody'), 'ℹ️');
      return;
    }
    if (blocked === 'lastCard') {
      showAppInfo(t('accounts.keepOneCardTitle'), t('accounts.keepOneCardBody'), 'ℹ️');
      return;
    }
    if (blocked === 'lastAccount') {
      showAppInfo(t('accounts.keepOneTitle'), t('accounts.keepOneBody'), 'ℹ️');
      return;
    }
    const fallback =
      finance.accounts.find((x) => x.id !== a.id && isCoreBankAccount(x)) ||
      finance.accounts.find((x) => x.id !== a.id && !x.excluded) ||
      finance.accounts.find((x) => x.id !== a.id);
    const keepName = fallback?.name || CORE_BANK_NAME;
    showAppDialog({
      title: t('accounts.deleteTitle'),
      message: t('accounts.deleteBody').replace('{name}', a.name).replace('{keep}', keepName),
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
          const isCard = isCoreCardAccount(a);
          // A card reports the month it had: what was charged to it, and what was
          // paid towards it. Its balance reads negative while it owes money.
          const cardMonth = oneCardTotals(a, finance.accounts, txns, (txn) =>
            (txn.date || '').startsWith(thisMonth),
          );
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
                    {a.cardIssuer && a.cardLast4 ? ` · ${a.cardIssuer} ${a.cardLast4}` : ''}
                    {a.excluded ? ' · Hidden' : ''}
                  </Text>
                </View>
                <View style={styles.amountCol}>
                  <Text style={[styles.amountCaption, { color: theme.muted }]}>
                    {isCard ? t('accounts.cardBalance') : t('accounts.existingPlusMonth')}
                  </Text>
                  <Text style={[styles.amount, { color: live < 0 ? theme.red : theme.ink }]}>
                    {fmt(live, cur)}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.amountSplit, { borderTopColor: theme.line }]}>
                {isCard ? (
                  <>
                    <View style={styles.amountSplitRow}>
                      <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                        {t('accounts.cardExpenses')}
                      </Text>
                      <Text
                        style={[styles.amountSplitValue, { color: theme.red }]}
                        numberOfLines={1}
                      >
                        −{fmt(cardMonth.expenses, cur)}
                      </Text>
                    </View>
                    <View style={styles.amountSplitRow}>
                      <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                        {t('accounts.cardBillPaid')}
                      </Text>
                      <Text
                        style={[styles.amountSplitValue, { color: theme.green }]}
                        numberOfLines={1}
                      >
                        +{fmt(cardMonth.billPaid, cur)}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.amountSplitRow}>
                      <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                        {t('accounts.existing')}
                      </Text>
                      <Text
                        style={[
                          styles.amountSplitValue,
                          { color: existing < 0 ? theme.red : theme.ink },
                        ]}
                        numberOfLines={1}
                      >
                        {fmt(existing, cur)}
                      </Text>
                    </View>
                    <View style={styles.amountSplitRow}>
                      <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                        {t('accounts.monthIncome')}
                      </Text>
                      <Text
                        style={[styles.amountSplitValue, { color: theme.green }]}
                        numberOfLines={1}
                      >
                        +{fmt(monthIncome, cur)}
                      </Text>
                    </View>
                    <View style={styles.amountSplitRow}>
                      <Text style={[styles.amountSplitLabel, { color: theme.muted }]}>
                        {t('accounts.monthExpense')}
                      </Text>
                      <Text
                        style={[styles.amountSplitValue, { color: theme.red }]}
                        numberOfLines={1}
                      >
                        −{fmt(monthExpense, cur)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {!isCard
                ? (() => {
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
                  })()
                : null}

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
              // Name the accounts that will actually survive, which is whatever
              // you have called them, not the names they shipped with.
              const keptBank = finance.accounts.find(isCoreBankAccount);
              const keptCard = finance.accounts.find(isCoreCardAccount);
              const bankName = keptBank?.name || CORE_BANK_NAME;
              const cardName = keptCard?.name || CORE_CARD_NAME;
              showAppDialog({
                title: t('accounts.keepCashBank'),
                message: `Remove every other account and keep only “${bankName}” and “${cardName}”. Their incomes and expenses will move to “${bankName}”.`,
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
        {...SYSTEM_MODAL_PROPS}
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
                placeholder={
                  draft.type === 'Card' ? t('accounts.cardNamePlaceholder') : t('accounts.namePlaceholder')
                }
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
                  const editingCard = isCoreCardAccount(current);
                  const cardMonth = oneCardTotals(
                    current,
                    finance.accounts,
                    txns,
                    (txn) => (txn.date || '').startsWith(thisMonth),
                  );
                  return (
                    <View
                      style={[
                        styles.breakdown,
                        { backgroundColor: theme.card, borderColor: theme.line },
                      ]}
                    >
                      <Text style={[styles.label, { color: theme.muted, marginTop: 0 }]}>
                        {editingCard ? t('accounts.cardBalance') : t('accounts.existing')}
                      </Text>
                      <Text
                        style={{
                          color: (editingCard ? live : existing) < 0 ? theme.red : theme.ink,
                          fontSize: 18,
                          fontWeight: '800',
                        }}
                      >
                        {fmt(editingCard ? live : existing, cur)}
                      </Text>
                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 12,
                          marginTop: 8,
                          lineHeight: 17,
                        }}
                      >
                        {editingCard
                          ? t('accounts.cardBalanceHint')
                          : t('accounts.existingReadonly')}
                      </Text>
                      <View style={styles.breakdownRows}>
                        {editingCard ? (
                          <>
                            <View style={styles.breakdownRow}>
                              <Text style={[styles.breakdownLabel, { color: theme.muted }]}>
                                {t('accounts.cardExpenses')}
                              </Text>
                              <Text
                                style={[styles.breakdownValue, { color: theme.red }]}
                                numberOfLines={1}
                              >
                                −{fmt(cardMonth.expenses, cur)}
                              </Text>
                            </View>
                            <View style={[styles.breakdownRow, { borderTopColor: theme.line }]}>
                              <Text style={[styles.breakdownLabel, { color: theme.muted }]}>
                                {t('accounts.cardBillPaid')}
                              </Text>
                              <Text
                                style={[styles.breakdownValue, { color: theme.green }]}
                                numberOfLines={1}
                              >
                                +{fmt(cardMonth.billPaid, cur)}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={styles.breakdownRow}>
                              <Text style={[styles.breakdownLabel, { color: theme.muted }]}>
                                {t('accounts.monthIncome')}
                              </Text>
                              <Text
                                style={[styles.breakdownValue, { color: theme.green }]}
                                numberOfLines={1}
                              >
                                +{fmt(monthIncome, cur)}
                              </Text>
                            </View>
                            <View style={styles.breakdownRow}>
                              <Text style={[styles.breakdownLabel, { color: theme.muted }]}>
                                {t('accounts.monthExpense')}
                              </Text>
                              <Text
                                style={[styles.breakdownValue, { color: theme.red }]}
                                numberOfLines={1}
                              >
                                −{fmt(monthExpense, cur)}
                              </Text>
                            </View>
                            <View style={[styles.breakdownRow, { borderTopColor: theme.line }]}>
                              <Text style={[styles.breakdownLabel, { color: theme.muted }]}>
                                {t('accounts.inAccount')}
                              </Text>
                              <Text
                                style={[
                                  styles.breakdownValue,
                                  { color: live < 0 ? theme.red : theme.ink },
                                ]}
                                numberOfLines={1}
                              >
                                {fmt(live, cur)}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>

                      {editingCard ? (
                        <PrimaryButton
                          title={t('accounts.addBillPayment')}
                          onPress={() => openAdd(current.id, 'cardBill')}
                          style={{ marginTop: 12 }}
                        />
                      ) : (
                        <PrimaryButton
                          title={t('accounts.addIncome')}
                          onPress={() => openAdd(current.id, 'income')}
                          style={{ marginTop: 12 }}
                        />
                      )}
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
                      onPress={() => {
                        const cardIssuer = typeName === 'Card' ? draft.cardIssuer : '';
                        const cardLast4 = typeName === 'Card' ? draft.cardLast4 : '';
                        const prevAuto = suggestedCardAccountName(draft.cardIssuer, draft.cardLast4);
                        const nextAuto = suggestedCardAccountName(cardIssuer, cardLast4);
                        const name =
                          typeName === 'Card' && (!draft.name.trim() || draft.name.trim() === prevAuto)
                            ? nextAuto || draft.name
                            : draft.name;
                        setDraft({
                          ...draft,
                          type: typeName,
                          cardIssuer,
                          cardLast4,
                          name,
                          icon:
                            typeName === 'Card' && (draft.icon === '💵' || !draft.icon)
                              ? '💳'
                              : typeName === 'Bank' && draft.icon === '💳'
                                ? '💵'
                                : draft.icon,
                        });
                      }}
                      style={[styles.chip, choiceSurface(theme, on)]}
                    >
                      <Text
                        style={[{ fontSize: 12 }, choiceLabel(theme, on)]}
                      >
                        {ACCOUNT_TYPE_LABELS[typeName] || typeName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {draft.type === 'Card' ? (
                <View style={{ marginTop: 4 }}>
                  <DropdownSelect
                    label={t('accounts.cardBank')}
                    value={draft.cardIssuer}
                    placeholder={t('accounts.cardBankPlaceholder')}
                    options={CARD_ISSUER_LABELS.map((label) => ({ value: label, label }))}
                    onChange={(cardIssuer) => {
                      const prevAuto = suggestedCardAccountName(draft.cardIssuer, draft.cardLast4);
                      const nextAuto = suggestedCardAccountName(cardIssuer, draft.cardLast4);
                      const name =
                        !draft.name.trim() || draft.name.trim() === prevAuto
                          ? nextAuto || draft.name
                          : draft.name;
                      setDraft({ ...draft, cardIssuer, name });
                    }}
                  />
                  <Text style={[styles.label, { color: theme.muted }]}>{t('accounts.cardLast4')}</Text>
                  <TextInput
                    value={draft.cardLast4}
                    onChangeText={(raw) => {
                      const cardLast4 = raw.replace(/\D/g, '').slice(0, 4);
                      const prevAuto = suggestedCardAccountName(draft.cardIssuer, draft.cardLast4);
                      const nextAuto = suggestedCardAccountName(draft.cardIssuer, cardLast4);
                      const name =
                        !draft.name.trim() || draft.name.trim() === prevAuto
                          ? nextAuto || draft.name
                          : draft.name;
                      setDraft({ ...draft, cardLast4, name });
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="1234"
                    placeholderTextColor={theme.muted}
                    style={[
                      styles.input,
                      { color: theme.ink, borderColor: theme.line, backgroundColor: theme.card },
                    ]}
                  />
                  <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                    {draft.isNew ? t('accounts.cardIdentityHintNew') : t('accounts.cardIdentityHint')}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.label, { color: theme.muted }]}>{t('common.icon')}</Text>
              <View style={styles.chipWrap}>
                {ACCOUNT_ICONS.map((ic) => {
                  const on = draft.icon === ic;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setDraft({ ...draft, icon: ic })}
                      style={[styles.chip, choiceSurface(theme, on)]}
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
                    {t('accounts.excludedFromTotal')}
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
  total: { fontSize: 14, fontWeight: '800', marginTop: 10 },
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
  amount: { fontSize: 13, fontWeight: '800' },
  amountSplit: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  amountSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountSplitLabel: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  amountSplitValue: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
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
  monthlyAmount: { fontSize: 12, fontWeight: '800' },
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
  breakdownRows: { marginTop: 10, gap: 7 },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  breakdownLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  breakdownValue: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
});
