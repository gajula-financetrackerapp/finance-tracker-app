import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  applySharedCreditLimitAnswer,
  hideCardReminder,
  ignoreCardActivity,
  issuersNeedingSharedLimitAsk,
  txnNoteFitsCard,
} from '../lib/cardBills';
import { Screen, EmptyState } from '../components/ui';
import { CardAboutModal } from '../components/CardAboutModal';
import { CardAddSheet } from '../components/CardAddSheet';
import { CardAmountActivitySheet } from '../components/CardAmountActivitySheet';
import { CardCycleDatesSheet } from '../components/CardCycleDatesSheet';
import { CardMarkPaidSheet } from '../components/CardMarkPaidSheet';
import { CreditCardFace } from '../components/CreditCardFace';
import type { CardActivityKind, CardActivityRow } from '../lib/cardActivity';
import {
  cardsMissingCycleDates,
  listCreditCardViews,
  mergedReminderForCard,
  remindersForCardView,
  type CreditCardView,
} from '../lib/cardFaces';
import { fmt } from '../theme';
import { bankAccountId, cardAccountId } from '../cashBooks';
import { buildCardBillTxnFromReminder } from '../utils/expenseReminderFinance';
import { useAlarms } from '../alarms/AlarmContext';
import { useT } from '../i18n/useT';
import { RootStackParamList } from '../navigation/types';

export function CreditCardsScreen() {
  const {
    theme,
    config,
    finance,
    expenseReminders,
    setExpenseReminders,
    addTransaction,
    deleteTransaction,
    refreshCardBillReminders,
  } = useApp();
  const { session } = useFinance();
  const { syncAlarmIfType } = useAlarms();
  const { t } = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => makeStyles(), []);
  const holder = session?.user?.email?.split('@')[0] || '';
  const [refreshing, setRefreshing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dateCard, setDateCard] = useState<CreditCardView | null>(null);
  const [payCard, setPayCard] = useState<CreditCardView | null>(null);
  const [activity, setActivity] = useState<{
    card: CreditCardView;
    kind: CardActivityKind;
  } | null>(null);

  const cards = useMemo(
    () => listCreditCardViews(finance.accounts, expenseReminders, finance.transactions),
    [finance.accounts, expenseReminders, finance.transactions],
  );
  const openBills = cards.filter((c) => !c.paid && (c.remaining || 0) > 0);
  const totalDue = openBills.reduce((s, c) => s + (c.remaining || 0), 0);

  const askForMissingDates = (views: CreditCardView[], skipId?: string) => {
    const skipped = skipId
      ? views.find((c) => c.id === skipId) ||
        views.find((c) => c.reminderId === skipId || !!c.reminderIds?.includes(skipId))
      : undefined;
    const skipIssuer =
      skipped && ((skipped.last4s && skipped.last4s.length > 1) || (skipped.reminderIds?.length || 0) > 1)
        ? skipped.issuer
        : null;
    const stillNeedsAmount = (c: CreditCardView) =>
      !!c.needsAmount && !c.needsStatementDate && !c.needsDueDate;
    const missing = cardsMissingCycleDates(views).filter((c) => {
      if (c.id === skipId) return stillNeedsAmount(c);
      if (skipIssuer && c.issuer === skipIssuer) return stillNeedsAmount(c);
      return true;
    });
    setDateCard(missing[0] || null);
    return missing.length > 0;
  };

  const finishCardPrompts = (
    next: typeof expenseReminders,
    skipId?: string,
    refreshSummary?: { updated: boolean; statementCount: number; paymentCount: number; spendCount: number },
  ) => {
    const views = listCreditCardViews(finance.accounts, next, finance.transactions);
    if (askForMissingDates(views, skipId)) return;
    if (!refreshSummary) return;
    if (refreshSummary.updated) {
      const body = t('cards.refreshOk')
        .replace('{statements}', String(refreshSummary.statementCount))
        .replace('{spends}', String(refreshSummary.spendCount))
        .replace('{payments}', String(refreshSummary.paymentCount));
      showAppInfo(t('cards.title'), body, '✅');
      return;
    }
    showAppInfo(t('cards.title'), t('cards.refreshNone'), '💳');
  };

  const askSharedLimitThenContinue = (
    next: typeof expenseReminders,
    skipId?: string,
    refreshSummary?: { updated: boolean; statementCount: number; paymentCount: number; spendCount: number },
  ) => {
    const pending = issuersNeedingSharedLimitAsk(next)[0];
    if (!pending) {
      finishCardPrompts(next, skipId, refreshSummary);
      return;
    }
    showAppDialog({
      title: t('cards.sharedLimitTitle'),
      message: t('cards.sharedLimitLead')
        .replace('{issuer}', pending.issuer)
        .replace('{n}', String(pending.last4s.length))
        .replace('{last4s}', pending.last4s.join(', ')),
      icon: '💳',
      buttons: [
        {
          text: t('cards.sharedLimitNo'),
          onPress: () => {
            void (async () => {
              const updated = applySharedCreditLimitAnswer(next, pending.issuer, false);
              await setExpenseReminders(updated);
              askSharedLimitThenContinue(updated, skipId, refreshSummary);
            })();
          },
        },
        {
          text: t('cards.sharedLimitYes'),
          style: 'primary',
          onPress: () => {
            void (async () => {
              const updated = applySharedCreditLimitAnswer(next, pending.issuer, true);
              await setExpenseReminders(updated);
              askSharedLimitThenContinue(
                updated,
                skipId,
                refreshSummary
                  ? { ...refreshSummary, updated: true }
                  : { updated: true, statementCount: 0, paymentCount: 0, spendCount: 0 },
              );
            })();
          },
        },
      ],
    });
  };

  const onRefresh = async () => {
    if (!requireAuthToSave('refresh card statements')) return;
    setRefreshing(true);
    try {
      const result = await refreshCardBillReminders();
      if (result.error === 'SMS_MODULE_MISSING') {
        showAppInfo(t('cards.title'), t('cards.refreshNeedBuild'), '📥');
        return;
      }
      if (result.error === 'SMS_PERMISSION_DENIED') {
        showAppInfo(t('cards.title'), t('cards.refreshDenied'), '🔒');
        return;
      }
      if (result.error === 'FEATURE_OFF') {
        showAppInfo(t('cards.title'), t('cards.refreshOff'), '⚠️');
        return;
      }
      if (result.error === 'AUTH') {
        return;
      }
      askSharedLimitThenContinue(result.reminders, undefined, {
        updated: result.updated,
        statementCount: result.statementCount,
        paymentCount: result.paymentCount,
        spendCount: result.spendCount,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const removeCard = (card: CreditCardView) => {
    if (!requireAuthToSave('remove a credit card')) return;
    const name = card.last4 ? `${card.issuer} ${card.last4}` : card.issuer;
    showAppDialog({
      title: t('cards.removeTitle'),
      message: t('cards.removeLead').replace('{card}', name),
      icon: '💳',
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: () => {
            void setExpenseReminders(hideCardReminder(expenseReminders, card));
          },
        },
      ],
    });
  };

  const saveCardDates = async (next: typeof expenseReminders) => {
    const savedId = dateCard?.id;
    await setExpenseReminders(next);
    askSharedLimitThenContinue(next, savedId);
  };

  const saveCardPayment = async (next: typeof expenseReminders, paidAmount: number) => {
    const card = payCard;
    const reminder = card ? mergedReminderForCard(card, next) : undefined;
    await setExpenseReminders(next);
    if (reminder && paidAmount > 0) {
      const txn = buildCardBillTxnFromReminder(
        reminder,
        bankAccountId(finance.accounts),
        cardAccountId(finance.accounts),
        paidAmount,
      );
      if (txn) await addTransaction(txn);
      syncAlarmIfType('expense', reminder.id);
    }
    setPayCard(null);
  };

  const deleteCardExpense = (row: CardActivityRow) => {
    const card = activity?.card;
    if (!card || !requireAuthToSave('delete a card spend')) return;
    showAppDialog({
      title: t('cards.deleteExpenseTitle'),
      message: t('cards.deleteExpenseLead'),
      icon: '🗑',
      buttons: [
        { text: t('cards.deleteExpenseNo'), style: 'cancel' },
        {
          text: t('cards.deleteExpenseYes'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const ids = remindersForCardView(card, expenseReminders).map((r) => r.id);
              const next = ignoreCardActivity(expenseReminders, ids, row);
              await setExpenseReminders(next);
              const identity = {
                last4: card.last4,
                last4s: card.last4s,
                issuer: card.issuer,
              };
              const idsToDelete = new Set<string>();
              if (row.txnId) idsToDelete.add(row.txnId);
              for (const txn of finance.transactions) {
                if (txn.kind !== 'expense') continue;
                const day = (txn.date || '').slice(0, 10);
                if (day !== row.date) continue;
                if (Math.round((Math.abs(Number(txn.amount)) || 0) * 100) !== Math.round(row.amount * 100)) {
                  continue;
                }
                if (!txnNoteFitsCard(`${txn.note || ''} ${txn.itemName || ''}`, identity)) continue;
                if (txn.id) idsToDelete.add(txn.id);
              }
              for (const id of idsToDelete) await deleteTransaction(id);
            })();
          },
        },
      ],
    });
  };

  const saveAddedCard = async (next: typeof expenseReminders) => {
    setAdding(false);
    await setExpenseReminders(next);
    askSharedLimitThenContinue(next);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.head}>
          <View style={styles.titleRow}>
            <Text style={[styles.h1, { color: theme.ink }]}>{t('cards.title')}</Text>
            <Pressable
              onPress={() => setAboutOpen(true)}
              hitSlop={8}
              style={[styles.infoBtn, { backgroundColor: theme.accentSoft }]}
              accessibilityRole="button"
              accessibilityLabel={t('cards.aboutTitle')}
            >
              <Text style={[styles.infoMark, { color: theme.ink }]}>i</Text>
            </Pressable>
          </View>
          <View style={styles.headActions}>
            <Pressable
              onPress={() => setAdding(true)}
              style={[styles.addBtn, { borderColor: theme.ink }]}
            >
              <Text style={[styles.addBtnText, { color: theme.ink }]}>{t('cards.add')}</Text>
            </Pressable>
            <View style={styles.refreshCluster}>
              {openBills.length ? (
                <Text style={[styles.total, { color: theme.ink }]} numberOfLines={1}>
                  {fmt(Math.round(totalDue), config.currency)}
                </Text>
              ) : null}
              <Pressable
                onPress={() => void onRefresh()}
                disabled={refreshing}
                style={[styles.refreshBtn, { backgroundColor: theme.ink, opacity: refreshing ? 0.7 : 1 }]}
              >
                {refreshing ? (
                  <ActivityIndicator color={theme.bg} />
                ) : (
                  <Text style={[styles.refreshBtnText, { color: theme.bg }]}>{t('cards.refresh')}</Text>
                )}
              </Pressable>
            </View>
          </View>
          <Text style={[styles.lead, { color: theme.muted }]}>
            {openBills.length
              ? t('cards.statementDueFor').replace('{n}', String(openBills.length))
              : t('cards.lead')}
          </Text>
        </View>

        {cards.length === 0 ? (
          <>
            <EmptyState icon="💳" title={t('cards.empty')} subtitle={t('cards.emptySub')} />
            <Pressable
              onPress={() => setAdding(true)}
              style={[styles.emptyAdd, { backgroundColor: theme.ink }]}
            >
              <Text style={[styles.refreshBtnText, { color: theme.bg }]}>{t('cards.add')}</Text>
            </Pressable>
          </>
        ) : (
          cards.map((card) => {
            return (
              <View key={card.id} style={styles.cardBlock}>
                <CreditCardFace
                  card={card}
                  holder={holder}
                  currency={config.currency}
                  dueLabel={t('cards.dueOn')}
                  paidLabel={t('cards.paid')}
                  noStatementLabel={t('cards.noStatement')}
                  statementOnLabel={t('cards.statementOn')}
                  expensesLabel={t('cards.unbilled')}
                  markPaidLabel={t('cards.markPaid')}
                  addStatementLabel={t('cards.addStatementDate')}
                  addDueLabel={t('cards.addDueDate')}
                  addBothLabel={t('cards.addBothDates')}
                  addAmountLabel={t('cards.addStatementAmount')}
                  cardTagLabel={t('cards.cardTag')}
                  removeLabel={t('cards.remove')}
                  onRemove={() => removeCard(card)}
                  onPress={() =>
                    navigation.navigate(
                      'ExpenseReminder',
                      card.reminderId ? { reminderId: card.reminderId } : undefined,
                    )
                  }
                  onAddDates={() => setDateCard(card)}
                  onPressStatementAmount={() => setActivity({ card, kind: 'statement' })}
                  onPressExpenses={() => setActivity({ card, kind: 'expenses' })}
                  onMarkPaid={
                    !card.paid && (card.remaining || 0) > 0
                      ? () => setPayCard(card)
                      : undefined
                  }
                />
              </View>
            );
          })
        )}
      </ScrollView>
      <CardAboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />
      <CardAddSheet
        visible={adding}
        reminders={expenseReminders}
        offsets={config.expenseOffsets?.length ? config.expenseOffsets : [1, 0]}
        onClose={() => setAdding(false)}
        onSave={saveAddedCard}
      />
      <CardCycleDatesSheet
        card={dateCard}
        reminders={expenseReminders}
        offsets={config.expenseOffsets?.length ? config.expenseOffsets : [1, 0]}
        onClose={() => setDateCard(null)}
        onSave={saveCardDates}
      />
      <CardMarkPaidSheet
        card={payCard ? cards.find((c) => c.id === payCard.id) || payCard : null}
        reminders={expenseReminders}
        currency={config.currency}
        onClose={() => setPayCard(null)}
        onSave={saveCardPayment}
      />
      <CardAmountActivitySheet
        card={
          activity
            ? cards.find((c) => c.id === activity.card.id) || activity.card
            : null
        }
        kind={activity?.kind || null}
        reminder={
          activity?.card
            ? mergedReminderForCard(
                cards.find((c) => c.id === activity.card.id) || activity.card,
                expenseReminders,
              )
            : undefined
        }
        transactions={finance.transactions}
        currency={config.currency}
        onClose={() => setActivity(null)}
        onDeleteExpense={activity?.kind === 'expenses' ? deleteCardExpense : undefined}
      />
    </Screen>
  );
}

function makeStyles() {
  return StyleSheet.create({
    head: { marginBottom: 16 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    h1: { fontSize: 22, fontWeight: '800' },
    infoBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoMark: { fontSize: 15, fontWeight: '800', lineHeight: 18 },
    lead: { marginTop: 8, fontSize: 13, fontWeight: '600' },
    total: { fontSize: 16, fontWeight: '800' },
    headActions: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    refreshCluster: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    addBtn: {
      borderRadius: 10,
      borderWidth: 1.5,
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: { fontWeight: '800', fontSize: 12 },
    refreshBtn: {
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    refreshBtnText: { fontWeight: '800', fontSize: 12 },
    emptyAdd: {
      alignSelf: 'center',
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    cardBlock: { marginBottom: 18 },
  });
}
