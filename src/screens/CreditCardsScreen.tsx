import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import { requireAuthToSave } from '../authGate';
import { showAppDialog, showAppInfo } from '../appDialog';
import {
  applySharedCreditLimitAnswer,
  hideCardReminder,
  issuersNeedingSharedLimitAsk,
} from '../lib/cardBills';
import { Screen, EmptyState } from '../components/ui';
import { CardAboutModal } from '../components/CardAboutModal';
import { CardAddSheet } from '../components/CardAddSheet';
import { CardAmountActivitySheet } from '../components/CardAmountActivitySheet';
import { CardCycleDatesSheet } from '../components/CardCycleDatesSheet';
import { CreditCardFace } from '../components/CreditCardFace';
import type { CardActivityKind } from '../lib/cardActivity';
import {
  cardsMissingCycleDates,
  listCreditCardViews,
  mergedReminderForCard,
  remindersForCardView,
  type CreditCardView,
} from '../lib/cardFaces';
import { fmt } from '../theme';
import { confirmMarkExpensePaid } from '../utils/markExpensePaid';
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
  const [activity, setActivity] = useState<{
    card: CreditCardView;
    kind: CardActivityKind;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      setAboutOpen(true);
    }, []),
  );

  const cards = useMemo(
    () => listCreditCardViews(finance.accounts, expenseReminders, finance.transactions),
    [finance.accounts, expenseReminders, finance.transactions],
  );
  const openBills = cards.filter((c) => !c.paid && (c.remaining || 0) > 0);
  const totalDue = openBills.reduce((s, c) => s + (c.remaining || 0), 0);

  const askForMissingDates = (views: CreditCardView[], skipId?: string) => {
    const missing = cardsMissingCycleDates(views).filter((c) => c.id !== skipId);
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

  const saveAddedCard = async (next: typeof expenseReminders) => {
    setAdding(false);
    await setExpenseReminders(next);
    askSharedLimitThenContinue(next);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.head}>
          <Text style={[styles.h1, { color: theme.ink }]}>{t('cards.title')}</Text>
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
            const reminder = mergedReminderForCard(card, expenseReminders);
            const groupIds = new Set(remindersForCardView(card, expenseReminders).map((r) => r.id));
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
                  removeLabel={t('cards.remove')}
                  onRemove={() => removeCard(card)}
                  onPress={
                    card.needsStatementDate || card.needsDueDate || card.needsAmount
                      ? () => setDateCard(card)
                      : () => navigation.navigate('ExpenseReminder')
                  }
                  onAddDates={() => setDateCard(card)}
                  onPressStatementAmount={() => setActivity({ card, kind: 'statement' })}
                  onPressExpenses={() => setActivity({ card, kind: 'expenses' })}
                  onMarkPaid={
                    reminder && !reminder.paid
                      ? () =>
                          confirmMarkExpensePaid(reminder, {
                            expenseReminders,
                            setExpenseReminders: async (items) => {
                              await setExpenseReminders(
                                items.map((r) =>
                                  r.id !== reminder.id && groupIds.has(r.id) ? { ...r, paid: true } : r,
                                ),
                              );
                            },
                            finance,
                            addTransaction,
                            syncAlarmIfType,
                            language: config.language,
                          })
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
      <CardAmountActivitySheet
        card={activity?.card || null}
        kind={activity?.kind || null}
        reminder={activity?.card ? mergedReminderForCard(activity.card, expenseReminders) : undefined}
        transactions={finance.transactions}
        currency={config.currency}
        onClose={() => setActivity(null)}
      />
    </Screen>
  );
}

function makeStyles() {
  return StyleSheet.create({
    head: { marginBottom: 16 },
    h1: { fontSize: 22, fontWeight: '800' },
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
